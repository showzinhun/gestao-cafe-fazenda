import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { saldoDoLote, saldoLivre } from '@/dominio/lote';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto } from './transacao';
import { dec, destinosDoLote, exigirFazendas, exigirMotivo, fazendasPermitidas, mapasFazenda, normalizarDecimal, travarLotes } from './rastreio-base';

/** Consulta e ajustes de lote. Saldo e status são sempre derivados (regra 5). */

export async function obterLote(ctx: Contexto, loteId: string) {
  if (!ehUuid(loteId)) throw new ErroNaoEncontrado('Lote não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const l = await tx.lote.findFirst({
      where: { id: loteId },
      include: {
        etapa: { select: { id: true, nome: true, classe: true } },
        movimento: { select: { id: true, numero: true, status: true } },
        fazenda: { select: { id: true, codigo: true, nome: true } },
        safra: { select: { id: true, codigo: true } },
        tipoCafe: { select: { id: true, codigo: true, nome: true } },
        peneira: { select: { id: true, codigo: true } },
        talhoes: { include: { talhao: { select: { codigo: true, fazendaId: true } } }, orderBy: { percentual: 'desc' } },
        certificados: { where: { removidoEm: null }, include: { certificado: { select: { id: true, codigo: true } } } },
        reservas: { where: { status: 'ATIVA' } },
      },
    });
    if (!l) throw new ErroNaoEncontrado('Lote não encontrado.');
    const base = { quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada), quantidadeReservada: dec(l.quantidadeReservada) };
    return { ...l, saldo: saldoDoLote(base).toFixed(3), saldoLivre: saldoLivre(base).toFixed(3) };
  });
}

export async function listarLotes(ctx: Contexto, filtro: { etapaId?: string; comSaldo?: boolean } = {}) {
  return comTransacao(ctx, async (tx) => {
    const lotes = await tx.lote.findMany({
      where: { ...(filtro.etapaId ? { etapaId: filtro.etapaId } : {}), ...(filtro.comSaldo ? { status: { in: ['ABERTO', 'PARCIAL'] } } : {}) },
      orderBy: { codigo: 'asc' },
      take: 500,
    });
    return lotes.map((l) => ({ ...l, saldo: saldoDoLote({ quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada) }).toFixed(3) }));
  });
}

const alteracaoSchema = z.object({
  tipoCafeId: z.string().uuid().nullable().optional(),
  peneiraId: z.string().uuid().nullable().optional(),
  umidade: z.union([z.string(), z.number()]).transform(normalizarDecimal).refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v), 'Umidade entre 0 e 99,99%.').nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
});

/** Ajusta dados do lote. Lote parcial ou utilizado não muda tipo nem peneira (RN-03). */
export async function alterarLote(ctx: Contexto, loteId: string, entrada: z.input<typeof alteracaoSchema>) {
  exigir(ctx, 'movimento.lancar');
  if (!ehUuid(loteId)) throw new ErroNaoEncontrado('Lote não encontrado.');
  const d = alteracaoSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    await travarLotes(tx, [loteId]);
    const l = await tx.lote.findFirst({ where: { id: loteId } });
    if (!l) throw new ErroNaoEncontrado('Lote não encontrado.');
    if (l.status === 'ESTORNADO') throw new ErroValidacao('Lote estornado não se altera.');
    const fazendas = l.fazendaId ? [l.fazendaId] : [...(await mapasFazenda(tx, (await tx.loteTalhao.findMany({ where: { loteId } })).map((t) => t.talhaoId))).doTalhao.values()];
    exigirFazendas(await fazendasPermitidas(tx, ctx), fazendas);
    const mudaIdentidade = (d.tipoCafeId !== undefined && d.tipoCafeId !== l.tipoCafeId) || (d.peneiraId !== undefined && d.peneiraId !== l.peneiraId);
    if (mudaIdentidade && dec(l.quantidadeUtilizada).gt(0)) {
      const onde = await destinosDoLote(tx, [l.id]);
      throw new ErroRegra('RN-03', `O lote ${l.codigo} já foi usado em ${onde}: não muda tipo nem peneira. Estorne esse movimento antes.`);
    }
    if (d.tipoCafeId && !(await tx.tipoCafe.findFirst({ where: { id: d.tipoCafeId } }))) throw new ErroNaoEncontrado('Tipo de café não encontrado.');
    if (d.peneiraId && !(await tx.peneira.findFirst({ where: { id: d.peneiraId } }))) throw new ErroNaoEncontrado('Peneira não encontrada.');
    const atualizado = await tx.lote.update({
      where: { id: loteId },
      data: {
        ...(d.tipoCafeId !== undefined ? { tipoCafeId: d.tipoCafeId } : {}),
        ...(d.peneiraId !== undefined ? { peneiraId: d.peneiraId } : {}),
        ...(d.umidade !== undefined ? { umidade: d.umidade } : {}),
        ...(d.observacao !== undefined ? { observacao: d.observacao || null } : {}),
        alteradoPor: ctx.usuarioId,
      },
    });
    await auditar(tx, ctx, { entidade: 'lote', entidadeId: l.id, acao: 'ALTERAR', antes: { tipoCafeId: l.tipoCafeId, peneiraId: l.peneiraId, umidade: l.umidade, observacao: l.observacao }, depois: d });
    return atualizado;
  });
}

/**
 * Certificados do lote no estoque (RN-08, §10): pode tirar; só pode pôr de volta o que a regra
 * permitiu quando o lote foi gerado. Acrescentar um certificado que as origens não têm é bloqueado.
 */
export async function definirCertificadosLote(ctx: Contexto, loteId: string, certificadoIds: string[], motivo?: string) {
  exigir(ctx, 'movimento.lancar');
  if (!ehUuid(loteId)) throw new ErroNaoEncontrado('Lote não encontrado.');
  const escolhidos = z.array(z.string().uuid()).parse(certificadoIds);
  return comTransacao(ctx, async (tx) => {
    await travarLotes(tx, [loteId]);
    const l = await tx.lote.findFirst({ where: { id: loteId }, include: { etapa: true, certificados: { include: { certificado: true } } } });
    if (!l) throw new ErroNaoEncontrado('Lote não encontrado.');
    if (l.etapa.classe !== 'ESTOQUE') throw new ErroValidacao('Os certificados do lote só se ajustam no estoque (§10).');
    if (l.status !== 'ABERTO') throw new ErroRegra('RN-03', `O lote ${l.codigo} já foi usado: os certificados não mudam.`);
    const permitidos = new Map(l.certificados.map((c) => [c.certificadoId, c]));
    const indevidos = escolhidos.filter((c) => !permitidos.has(c));
    if (indevidos.length) {
      const nomes = (await tx.certificado.findMany({ where: { id: { in: indevidos } } })).map((c) => c.codigo);
      throw new ErroRegra('RN-08', `O lote ${l.codigo} não pode ter ${nomes.join(', ') || 'esse certificado'}: nem todas as origens e fazendas da composição têm esse certificado válido.`);
    }
    const tirar = l.certificados.filter((c) => !c.removidoEm && !escolhidos.includes(c.certificadoId));
    const devolver = l.certificados.filter((c) => c.removidoEm && escolhidos.includes(c.certificadoId));
    const m = tirar.length ? exigirMotivo(motivo, 'o motivo de tirar o certificado') : null;
    for (const c of tirar)
      await tx.loteCertificado.update({ where: { loteId_certificadoId: { loteId, certificadoId: c.certificadoId } }, data: { removidoEm: new Date(), removidoPor: ctx.usuarioId, motivoRemocao: m } });
    for (const c of devolver)
      await tx.loteCertificado.update({ where: { loteId_certificadoId: { loteId, certificadoId: c.certificadoId } }, data: { removidoEm: null, removidoPor: null, motivoRemocao: null } });
    await auditar(tx, ctx, {
      entidade: 'lote', entidadeId: l.id, acao: 'CERTIFICADOS',
      antes: l.certificados.filter((c) => !c.removidoEm).map((c) => c.certificado.codigo),
      depois: { certificados: l.certificados.filter((c) => escolhidos.includes(c.certificadoId)).map((c) => c.certificado.codigo), motivo: m },
    });
  });
}
