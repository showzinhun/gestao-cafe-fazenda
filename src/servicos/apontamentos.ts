import Decimal from 'decimal.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { apontadorPodeCorrigir } from '@/dominio/colheita';
import { qtd } from '@/dominio/quantidade';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { dataLocal, dec, exigirFazendas, exigirMotivo, fazendasPermitidas, normalizarDecimal } from './rastreio-base';

/**
 * Apontamento de colheita (§6.1) e sincronização do app de campo (RN-19, RN-23).
 * - Cada registro do aparelho tem um UUID (origem). Reenviar o mesmo UUID com o mesmo valor não muda nada.
 * - Um apontamento por colhedor, talhão e dia: registros de UUIDs diferentes se somam nele.
 * - Conflito (o servidor mudou depois da leitura offline, ou o apontamento já foi fechado): o servidor vence.
 */

const medidasSchema = z.union([z.string(), z.number()]).transform((v, c) => {
  try {
    const d = qtd(normalizarDecimal(v));
    if (d.lt(0)) throw new Error();
    return d.toFixed(3);
  } catch {
    c.addIssue({ code: 'custom', message: 'Medidas inválidas.' });
    return z.NEVER;
  }
});

const registroSchema = z.object({
  id: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fazendaId: z.string().uuid(),
  talhaoId: z.string().uuid(),
  safraId: z.string().uuid(),
  colhedorId: z.string().uuid(),
  turmaId: z.string().uuid().optional().nullable(),
  tipoCafeId: z.string().uuid().optional().nullable(),
  tipoColheita: z.enum(['MANUAL', 'SEMIMECANIZADA']).default('MANUAL'),
  medidas: medidasSchema,
  criadoEm: z.coerce.date().optional().nullable(),
  /** Versão do apontamento que o aparelho viu na última sincronização. */
  versaoBase: z.number().int().optional().nullable(),
});
export type RegistroCampo = z.input<typeof registroSchema>;

export type ResultadoSync =
  | { id: string; situacao: 'gravado' | 'repetido'; apontamentoId: string; medidas: string; versao: number }
  | { id: string; situacao: 'conflito'; mensagem: string; apontamentoId?: string; medidas?: string; versao?: number; status?: string }
  | { id: string; situacao: 'erro'; mensagem: string };

/** POST /api/campo/sync: cada registro numa transação própria, para um erro não perder os outros. */
export async function sincronizar(ctx: Contexto, entrada: { dispositivoId?: string | null; apontamentos: unknown[] }): Promise<ResultadoSync[]> {
  exigir(ctx, 'apontamento.lancar');
  const dispositivoId = typeof entrada.dispositivoId === 'string' ? entrada.dispositivoId.slice(0, 80) : null;
  if (!Array.isArray(entrada.apontamentos) || entrada.apontamentos.length > 1000) throw new ErroValidacao('Envie até 1.000 apontamentos por vez.');
  const resultados: ResultadoSync[] = [];
  for (const bruto of entrada.apontamentos) {
    const p = registroSchema.safeParse(bruto);
    const id = typeof (bruto as { id?: unknown })?.id === 'string' ? String((bruto as { id: string }).id) : '?';
    if (!p.success) {
      resultados.push({ id, situacao: 'erro', mensagem: p.error.issues[0]?.message ?? 'Registro inválido.' });
      continue;
    }
    resultados.push(await sincronizarUm(ctx, p.data, dispositivoId));
  }
  return resultados;
}

async function sincronizarUm(ctx: Contexto, r: z.output<typeof registroSchema>, dispositivoId: string | null): Promise<ResultadoSync> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      return await comTransacao(ctx, (tx) => aplicar(tx, ctx, r, dispositivoId));
    } catch (e) {
      // Dois aparelhos criando o mesmo colhedor/talhão/dia ao mesmo tempo: na 2ª tentativa vira soma.
      if (tentativa === 0 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      if (e instanceof ErroRegra || e instanceof ErroValidacao || e instanceof ErroNaoEncontrado || e instanceof ErroPermissao)
        return { id: r.id, situacao: 'erro', mensagem: e.message };
      throw e;
    }
  }
  return { id: r.id, situacao: 'erro', mensagem: 'Não foi possível gravar. Tente de novo.' };
}

async function travarApontamento(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM apontamento WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.apontamento.findFirstOrThrow({ where: { id } });
}

async function aplicar(tx: Tx, ctx: Contexto, r: z.output<typeof registroSchema>, dispositivoId: string | null): Promise<ResultadoSync> {
  const medidas = new Decimal(r.medidas);
  const hoje = dataLocal(new Date());
  const gestor = ctx.perfil === 'GESTOR' || ctx.perfil === 'ADMIN_EMPRESA';
  const conflito = (mensagem: string, a?: { id: string; medidas: { toString(): string }; versao: number; status: string }): ResultadoSync =>
    ({ id: r.id, situacao: 'conflito', mensagem, ...(a ? { apontamentoId: a.id, medidas: dec(a.medidas).toFixed(3), versao: a.versao, status: a.status } : {}) });

  const origem = await tx.apontamentoOrigem.findFirst({ where: { id: r.id } });
  if (origem) {
    const a = await travarApontamento(tx, origem.apontamentoId);
    const anterior = dec(origem.medidas);
    if (anterior.eq(medidas)) return { id: r.id, situacao: 'repetido', apontamentoId: a.id, medidas: dec(a.medidas).toFixed(3), versao: a.versao };
    if (a.status === 'FECHADO' || a.fechamentoId) return conflito('O apontamento já entrou num fechamento de pagamento e não muda mais (RN-19).', a);
    if (r.versaoBase != null && r.versaoBase !== a.versao) return conflito('O apontamento foi corrigido no escritório depois da sua leitura. Vale o valor do servidor (RN-23).', a);
    if (!gestor && !apontadorPodeCorrigir(a.data.toISOString().slice(0, 10), hoje)) return conflito('O apontador só corrige no mesmo dia. Peça a correção ao gestor (§6.1).', a);
    const total = qtd(dec(a.medidas).minus(anterior).plus(medidas));
    await tx.apontamentoOrigem.update({ where: { id: origem.id }, data: { medidas: medidas.toFixed(3), dispositivoId } });
    const atualizado = await tx.apontamento.update({
      where: { id: a.id },
      data: { medidas: total.toFixed(3), status: total.gt(0) ? 'PENDENTE' : 'CANCELADO', sincronizadoEm: new Date(), alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'apontamento', entidadeId: a.id, acao: 'SINCRONIZAR', antes: { medidas: a.medidas }, depois: { origem: r.id, medidas: atualizado.medidas, dispositivoId } });
    return { id: r.id, situacao: 'gravado', apontamentoId: a.id, medidas: total.toFixed(3), versao: atualizado.versao };
  }

  // Registro novo do aparelho.
  if (medidas.lte(0)) return { id: r.id, situacao: 'erro', mensagem: 'Informe medidas maiores que zero (RN-19).' };
  exigirFazendas(await fazendasPermitidas(tx, ctx), [r.fazendaId]);
  const talhao = await tx.talhao.findFirst({ where: { id: r.talhaoId, ativo: true } });
  if (!talhao || talhao.fazendaId !== r.fazendaId) throw new ErroNaoEncontrado('Talhão não encontrado nesta fazenda.');
  const colhedor = await tx.colhedor.findFirst({ where: { id: r.colhedorId } });
  if (!colhedor) throw new ErroNaoEncontrado('Colhedor não encontrado.');
  if (!(await tx.safra.findFirst({ where: { id: r.safraId } }))) throw new ErroNaoEncontrado('Safra não encontrada.');
  if (r.data > hoje) throw new ErroValidacao('Apontamento com data futura.');

  const data = new Date(`${r.data}T00:00:00Z`);
  const existente = await tx.apontamento.findFirst({ where: { colhedorId: r.colhedorId, talhaoId: r.talhaoId, data, status: { not: 'CANCELADO' } } });
  if (existente) {
    const a = await travarApontamento(tx, existente.id);
    if (a.status === 'FECHADO' || a.fechamentoId) return conflito('O apontamento deste colhedor, talhão e dia já entrou num fechamento (RN-19).', a);
    const total = qtd(dec(a.medidas).plus(medidas));
    await tx.apontamentoOrigem.create({ data: { id: r.id, empresaId: ctx.empresaId, apontamentoId: a.id, medidas: medidas.toFixed(3), dispositivoId, criadoOfflineEm: r.criadoEm ?? null } });
    const atualizado = await tx.apontamento.update({ where: { id: a.id }, data: { medidas: total.toFixed(3), sincronizadoEm: new Date(), alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'apontamento', entidadeId: a.id, acao: 'SOMAR', depois: { origem: r.id, medidas: r.medidas, total: atualizado.medidas, dispositivoId } });
    return { id: r.id, situacao: 'gravado', apontamentoId: a.id, medidas: total.toFixed(3), versao: atualizado.versao };
  }
  const a = await tx.apontamento.create({
    data: {
      id: r.id, empresaId: ctx.empresaId, data, fazendaId: r.fazendaId, talhaoId: r.talhaoId, safraId: r.safraId, colhedorId: r.colhedorId,
      turmaId: r.turmaId ?? colhedor.turmaId, tipoCafeId: r.tipoCafeId ?? null, tipoColheita: r.tipoColheita, medidas: medidas.toFixed(3),
      apontadorId: ctx.usuarioId, dispositivoId, criadoOfflineEm: r.criadoEm ?? null, alteradoPor: ctx.usuarioId,
    },
  });
  await tx.apontamentoOrigem.create({ data: { id: r.id, empresaId: ctx.empresaId, apontamentoId: a.id, medidas: medidas.toFixed(3), dispositivoId, criadoOfflineEm: r.criadoEm ?? null } });
  await auditar(tx, ctx, { entidade: 'apontamento', entidadeId: a.id, acao: 'CRIAR', depois: { colhedor: colhedor.nome, talhao: talhao.codigo, data: r.data, medidas: r.medidas, dispositivoId } });
  return { id: r.id, situacao: 'gravado', apontamentoId: a.id, medidas: medidas.toFixed(3), versao: a.versao };
}

/** Correção depois do dia: só GESTOR (ou ADMIN), com motivo. Apontamento fechado é imutável (RN-19). */
export async function corrigirApontamento(ctx: Contexto, id: string, entrada: { medidas: string | number; motivo: string }) {
  if (ctx.perfil !== 'GESTOR' && ctx.perfil !== 'ADMIN_EMPRESA') throw new ErroPermissao('Só o gestor corrige apontamentos depois do dia (§6.1).');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Apontamento não encontrado.');
  const medidas = new Decimal(medidasSchema.parse(entrada.medidas));
  const motivo = exigirMotivo(entrada.motivo);
  return comTransacao(ctx, async (tx) => {
    if (!(await tx.apontamento.findFirst({ where: { id } }))) throw new ErroNaoEncontrado('Apontamento não encontrado.');
    const a = await travarApontamento(tx, id);
    if (a.status === 'FECHADO' || a.fechamentoId) throw new ErroRegra('RN-19', 'Apontamento fechado não muda. Reabra o fechamento para corrigir.');
    exigirFazendas(await fazendasPermitidas(tx, ctx), [a.fazendaId]);
    const atualizado = await tx.apontamento.update({
      where: { id },
      data: { medidas: medidas.toFixed(3), status: medidas.gt(0) ? 'PENDENTE' : 'CANCELADO', versao: { increment: 1 }, motivoCorrecao: motivo, alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'apontamento', entidadeId: id, acao: 'CORRIGIR', antes: { medidas: a.medidas, versao: a.versao }, depois: { medidas: atualizado.medidas, versao: atualizado.versao, motivo } });
    return atualizado;
  });
}

const n = (v: { toString(): string } | null) => (v == null ? null : dec(v).toFixed(3));

/** Apontamentos com nome do colhedor e talhão, para as telas do escritório. */
export async function listarApontamentos(ctx: Contexto, f: { fazendaId?: string; talhaoId?: string; data?: string; inicio?: string; fim?: string; status?: 'PENDENTE' | 'FECHADO' | 'CANCELADO'; semCarga?: boolean } = {}) {
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.apontamento.findMany({
      where: {
        ...(f.fazendaId ? { fazendaId: f.fazendaId } : {}), ...(f.talhaoId ? { talhaoId: f.talhaoId } : {}), ...(f.status ? { status: f.status } : { status: { not: 'CANCELADO' } }),
        ...(f.data ? { data: new Date(`${f.data}T00:00:00Z`) } : {}),
        ...(f.inicio || f.fim ? { data: { ...(f.inicio ? { gte: new Date(`${f.inicio}T00:00:00Z`) } : {}), ...(f.fim ? { lte: new Date(`${f.fim}T00:00:00Z`) } : {}) } } : {}),
        ...(f.semCarga ? { cargas: { none: { carga: { movimento: { status: { not: 'ESTORNADO' } } } } } } : {}),
      },
      include: { colhedor: { select: { nome: true, apelido: true } }, talhao: { select: { codigo: true } }, turma: { select: { nome: true } }, fazenda: { select: { codigo: true } } },
      orderBy: [{ data: 'desc' }, { colhedor: { nome: 'asc' } }],
      take: 2000,
    });
    return lista.map((a) => ({
      id: a.id, data: a.data.toISOString().slice(0, 10), fazenda: a.fazenda.codigo, talhaoId: a.talhaoId, talhao: a.talhao.codigo, turma: a.turma?.nome ?? null,
      colhedorId: a.colhedorId, colhedor: a.colhedor.apelido ? `${a.colhedor.nome} (${a.colhedor.apelido})` : a.colhedor.nome, tipoColheita: a.tipoColheita,
      medidas: n(a.medidas)!, valorUnitario: a.valorUnitario?.toString() ?? null, status: a.status, versao: a.versao, motivoCorrecao: a.motivoCorrecao,
    }));
  });
}
