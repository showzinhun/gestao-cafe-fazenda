import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { destinosPermitidos, unidadesCompativeis, type TransicaoConfig } from '@/dominio/fluxo';
import { gerarCodigoLote, statusDoLote, type CertificadoFazenda, type Composicao } from '@/dominio/lote';
import { qtd } from '@/dominio/quantidade';
import { ehUuid, type Contexto, type Tx } from './transacao';

/**
 * Peças comuns dos serviços de rastreabilidade (Fase 2). Tudo aqui roda dentro de comTransacao:
 * as travas (FOR UPDATE) valem até o fim da transação (RN-01, regra 3).
 */

/** Decimal do Prisma (ou texto) → decimal.js. Nunca number (regra 9). */
export const dec = (v: { toString(): string } | string | null | undefined): Decimal => new Decimal(v == null ? 0 : v.toString());

/** Com vírgula é o formato brasileiro ("1.234,5"); sem vírgula, o ponto é decimal ("1234.5"). */
export function normalizarDecimal(v: string | number): string {
  const bruto = typeof v === 'number' ? String(v) : v.trim();
  return bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
}

/** Quantidade positiva vinda da API: aceita "1.234,5", "1234.5" ou número; guarda 3 casas. */
export const quantidadeSchema = z.union([z.string(), z.number()]).transform((v, c) => {
  const t = normalizarDecimal(v);
  let d: Decimal;
  try {
    d = qtd(t);
  } catch {
    c.addIssue({ code: 'custom', message: 'Quantidade inválida.' });
    return z.NEVER;
  }
  if (d.lte(0)) {
    c.addIssue({ code: 'custom', message: 'A quantidade deve ser maior que zero.' });
    return z.NEVER;
  }
  return d.toFixed(3);
});

/** Data no fuso da empresa (§4: America/Sao_Paulo), aaaa-mm-dd. */
export function dataLocal(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

export function exigirMotivo(motivo: unknown, oque = 'o motivo'): string {
  const m = typeof motivo === 'string' ? motivo.trim() : '';
  if (m.length < 5) throw new ErroValidacao(`Informe ${oque} (pelo menos 5 letras).`, 'motivo');
  return m;
}

// ---------------------------------------------------------------- travas e numeração

/** Trava os lotes em ordem fixa (evita impasse entre transações concorrentes). */
export async function travarLotes(tx: Tx, ids: string[]): Promise<void> {
  const unicos = [...new Set(ids)].sort();
  if (unicos.length) await tx.$queryRaw`SELECT id FROM lote WHERE id = ANY(${unicos}::uuid[]) ORDER BY id FOR UPDATE`;
}

export async function travarMovimento(tx: Tx, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Movimento não encontrado.');
  const r = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM movimento WHERE id = ${id}::uuid FOR UPDATE`;
  if (!r.length) throw new ErroNaoEncontrado('Movimento não encontrado.');
  return tx.movimento.findFirstOrThrow({ where: { id }, include: { etapa: true } });
}

/** Próximo número sequencial da chave (ex.: movimentos de uma etapa). Atômico. */
export async function proximoNumero(tx: Tx, empresaId: string, chave: string): Promise<number> {
  const r = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO contador (empresa_id, chave, valor) VALUES (${empresaId}::uuid, ${chave}, 1)
    ON CONFLICT (empresa_id, chave) DO UPDATE SET valor = contador.valor + 1
    RETURNING valor`;
  return Number(r[0]!.valor);
}

/** Código do lote sem repetir: depois de apagar resultados, o novo lote ganha o sufixo -2, -3… (§8). */
export async function codigoLivre(tx: Tx, partes: Parameters<typeof gerarCodigoLote>[0]): Promise<string> {
  for (let seq = 1; seq < 1000; seq++) {
    const codigo = gerarCodigoLote({ ...partes, seq });
    if (!(await tx.lote.findFirst({ where: { codigo }, select: { id: true } }))) return codigo;
  }
  throw new ErroValidacao('Não foi possível gerar o código do lote.');
}

// ---------------------------------------------------------------- saldo e status (RN-01, RN-02)

/** Grava utilizada/reservada e o status derivado. O banco também confere (CHECK). */
export async function gravarLote(tx: Tx, ctx: Contexto, lote: { id: string; quantidade: { toString(): string } }, valores: { utilizada?: Decimal; reservada?: Decimal; estornado?: boolean }) {
  const atual = await tx.lote.findFirstOrThrow({ where: { id: lote.id } });
  const utilizada = qtd(valores.utilizada ?? dec(atual.quantidadeUtilizada));
  const reservada = qtd(valores.reservada ?? dec(atual.quantidadeReservada));
  if (utilizada.lt(0) || utilizada.gt(dec(atual.quantidade))) throw new ErroRegra('RN-01', `Lote ${atual.codigo}: quantidade utilizada fora do saldo.`);
  if (reservada.lt(0) || reservada.gt(dec(atual.quantidade).minus(utilizada))) throw new ErroRegra('RN-07', `Lote ${atual.codigo}: as reservas passam do saldo.`);
  const status = statusDoLote({ quantidade: dec(atual.quantidade), quantidadeUtilizada: utilizada, estornado: valores.estornado ?? atual.status === 'ESTORNADO' });
  return tx.lote.update({
    where: { id: lote.id },
    data: { quantidadeUtilizada: utilizada.toFixed(3), quantidadeReservada: reservada.toFixed(3), status, alteradoPor: ctx.usuarioId },
  });
}

// ---------------------------------------------------------------- acesso por fazenda (RN-04)

/** null = sem restrição (ADMIN_EMPRESA). */
export async function fazendasPermitidas(tx: Tx, ctx: Contexto): Promise<Set<string> | null> {
  if (ctx.perfil === 'ADMIN_EMPRESA') return null;
  return new Set((await tx.usuarioFazenda.findMany({ where: { usuarioId: ctx.usuarioId }, select: { fazendaId: true } })).map((a) => a.fazendaId));
}

export function exigirFazendas(permitidas: Set<string> | null, fazendas: Iterable<string>, codigos?: Map<string, string>): void {
  if (!permitidas) return;
  const fora = [...new Set(fazendas)].filter((f) => !permitidas.has(f));
  if (fora.length)
    throw new ErroRegra('RN-04', `Você não tem acesso à fazenda ${fora.map((f) => codigos?.get(f) ?? f).join(', ')}. Peça ao administrador para liberar.`);
}

// ---------------------------------------------------------------- composição, fazendas e certificados

export async function composicoes(tx: Tx, loteIds: string[]): Promise<Map<string, Composicao>> {
  const linhas = await tx.loteTalhao.findMany({ where: { loteId: { in: loteIds } } });
  const r = new Map<string, Composicao>();
  for (const l of linhas) {
    const c = r.get(l.loteId) ?? new Map<string, Decimal>();
    c.set(l.talhaoId, dec(l.percentual));
    r.set(l.loteId, c);
  }
  return r;
}

/** talhão → fazenda, e fazenda → código. */
export async function mapasFazenda(tx: Tx, talhaoIds: string[]) {
  const talhoes = await tx.talhao.findMany({ where: { id: { in: [...new Set(talhaoIds)] } }, select: { id: true, fazendaId: true } });
  const doTalhao = new Map(talhoes.map((t) => [t.id, t.fazendaId]));
  const fazendas = await tx.fazenda.findMany({ where: { id: { in: [...new Set(talhoes.map((t) => t.fazendaId))] } }, select: { id: true, codigo: true } });
  return { doTalhao, codigo: new Map(fazendas.map((f) => [f.id, f.codigo])) };
}

export async function certificadosAtivos(tx: Tx, loteIds: string[]): Promise<Map<string, Set<string>>> {
  const linhas = await tx.loteCertificado.findMany({ where: { loteId: { in: loteIds }, removidoEm: null } });
  const r = new Map<string, Set<string>>(loteIds.map((id) => [id, new Set<string>()]));
  for (const l of linhas) r.get(l.loteId)!.add(l.certificadoId);
  return r;
}

export async function certificadosDeFazendas(tx: Tx, fazendaIds: string[]): Promise<CertificadoFazenda[]> {
  const linhas = await tx.fazendaCertificado.findMany({ where: { fazendaId: { in: [...new Set(fazendaIds)] } } });
  return linhas.map((c) => ({ fazendaId: c.fazendaId, certificadoId: c.certificadoId, validadeInicio: dataLocal(c.validadeInicio), validadeFim: dataLocal(c.validadeFim), status: c.status }));
}

// ---------------------------------------------------------------- fluxo (RN-16) e unidades

export async function transicoesDe(tx: Tx, origens: string[]): Promise<TransicaoConfig[]> {
  const ts = await tx.fluxoTransicao.findMany({ where: { etapaOrigemId: { in: [...new Set(origens)] } } });
  return ts.map((t) => ({ origem: t.etapaOrigemId, destino: t.etapaDestinoId, fazendaId: t.fazendaId }));
}

export function exigirTransicao(transicoes: TransicaoConfig[], origem: { id: string; nome: string }, destino: { id: string; nome: string }, fazendaId: string | null): void {
  if (!destinosPermitidos(transicoes, origem.id, fazendaId).includes(destino.id))
    throw new ErroRegra('RN-16', `O fluxo não permite levar café de ${origem.nome} para ${destino.nome}${fazendaId ? ' nesta fazenda' : ''}. Configure a transição em Fluxo de etapas.`);
}

export function exigirUnidade(lote: { codigo: string; unidade: 'MEDIDA' | 'KG' }, etapa: { nome: string; classe: string; unidadeEntrada: 'MEDIDA' | 'KG'; unidadeSaida: 'MEDIDA' | 'KG' }): void {
  if (!unidadesCompativeis({ unidadeSaida: lote.unidade }, etapa as Parameters<typeof unidadesCompativeis>[1]))
    throw new ErroRegra('RN-11', `O lote ${lote.codigo} está em ${lote.unidade === 'KG' ? 'kg' : 'medidas'}, mas ${etapa.nome} recebe em ${etapa.unidadeEntrada === 'KG' ? 'kg' : 'medidas'}.`);
}

/** Onde o lote foi usado: "Secador #3, Tulha #1" (mensagens de RN-03/RN-05). */
export async function destinosDoLote(tx: Tx, loteIds: string[]): Promise<string> {
  const es = await tx.movimentoEntrada.findMany({
    where: { loteId: { in: loteIds }, cancelada: false, movimento: { status: { not: 'ESTORNADO' } } },
    include: { movimento: { select: { numero: true, etapa: { select: { nome: true, prefixoLote: true } } } } },
  });
  return [...new Set(es.map((e) => `${e.movimento.etapa.nome} ${e.movimento.etapa.prefixoLote}#${e.movimento.numero}`))].join(', ');
}
