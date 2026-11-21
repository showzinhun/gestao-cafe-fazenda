import Decimal from 'decimal.js';
import { ErroRegra } from './erros';
import { qtd } from './quantidade';

/** Estado do lote (RN-02): sempre derivado, nunca informado pelo cliente. */
export type StatusLote = 'ABERTO' | 'PARCIAL' | 'UTILIZADO' | 'ESTORNADO';

export function saldoDoLote(l: { quantidade: Decimal.Value; quantidadeUtilizada: Decimal.Value }): Decimal {
  return qtd(new Decimal(l.quantidade).minus(l.quantidadeUtilizada));
}

/** Saldo livre: o que sobra depois das reservas ativas (RN-01, RN-07). */
export function saldoLivre(l: { quantidade: Decimal.Value; quantidadeUtilizada: Decimal.Value; quantidadeReservada: Decimal.Value }): Decimal {
  return qtd(saldoDoLote(l).minus(l.quantidadeReservada));
}

export function statusDoLote(l: { quantidade: Decimal.Value; quantidadeUtilizada: Decimal.Value; estornado?: boolean }): StatusLote {
  if (l.estornado) return 'ESTORNADO';
  const usada = new Decimal(l.quantidadeUtilizada);
  if (usada.lte(0)) return 'ABERTO';
  return usada.gte(l.quantidade) ? 'UTILIZADO' : 'PARCIAL';
}

/** Código curto da safra (§8): "2025/26" → "2526". */
export function codigoSafra(codigo: string): string {
  const m = /^(\d{2})?(\d{2})\s*\/\s*(\d{2})?(\d{2})$/.exec(codigo.trim());
  if (m) return `${m[2]}${m[4]}`;
  const d = codigo.replace(/\D/g, '');
  if (d.length < 4) throw new ErroRegra('RN-13', `Código de safra "${codigo}" sem ano reconhecível.`);
  return d.slice(-4);
}

/**
 * Código do lote (§8): {PREFIXO}-{FAZ}-{SAFRA}-{NUM6}[-{TIPO}][-P{PENEIRA}][-{seq}].
 * Gerado só no servidor e nunca editado. A rastreabilidade usa as chaves, não o código.
 */
export function gerarCodigoLote(p: { prefixo: string; fazenda: string | null; safra: string; numero: number; tipo?: string | null; peneira?: string | null; seq?: number }): string {
  const partes = [p.prefixo, p.fazenda ?? 'MIX', codigoSafra(p.safra), String(p.numero).padStart(6, '0')];
  if (p.tipo) partes.push(p.tipo);
  if (p.peneira) partes.push(`P${p.peneira}`);
  if (p.seq && p.seq > 1) partes.push(String(p.seq));
  return partes.join('-');
}

// ---------------------------------------------------------------- composição por talhão (RN-09)

export type Composicao = Map<string, Decimal>; // talhaoId → fração (0..1)
const CASAS_PCT = 10;

/**
 * pct(L,t) = Σ_i (qtd_i / qtd_total) × pct(lote_i, t).
 * Arredonda a 10 casas e ajusta a diferença no maior, para Σ = 1 exato.
 */
export function comporTalhoes(fontes: { quantidade: Decimal.Value; composicao: Composicao }[]): Composicao {
  const total = fontes.reduce((s, f) => s.plus(f.quantidade), new Decimal(0));
  if (total.lte(0)) throw new ErroRegra('RN-09', 'Sem quantidade de origem para compor o lote.');
  const bruto = new Map<string, Decimal>();
  for (const f of fontes) {
    const peso = new Decimal(f.quantidade).div(total);
    for (const [t, pct] of f.composicao) bruto.set(t, (bruto.get(t) ?? new Decimal(0)).plus(peso.times(pct)));
  }
  return normalizarComposicao(bruto);
}

export function normalizarComposicao(c: Composicao): Composicao {
  const r = new Map<string, Decimal>();
  for (const [t, v] of c) {
    const x = v.toDecimalPlaces(CASAS_PCT, Decimal.ROUND_HALF_UP);
    if (x.gt(0)) r.set(t, x);
  }
  if (!r.size) throw new ErroRegra('RN-09', 'Composição por talhão vazia.');
  const soma = [...r.values()].reduce((s, v) => s.plus(v), new Decimal(0));
  const dif = new Decimal(1).minus(soma);
  if (dif.abs().gt('0.0001')) throw new ErroRegra('RN-09', `A composição por talhão soma ${soma.toString()}, não 1.`);
  if (!dif.isZero()) {
    const [maior] = [...r.entries()].sort((a, b) => b[1].comparedTo(a[1]));
    r.set(maior![0], maior![1].plus(dif));
  }
  return r;
}

/** Quantidade equivalente de cada talhão no lote, com 3 casas. */
export function equivalentes(c: Composicao, quantidade: Decimal.Value): { talhaoId: string; percentual: Decimal; quantidade: Decimal }[] {
  return [...c.entries()].map(([talhaoId, percentual]) => ({ talhaoId, percentual, quantidade: qtd(percentual.times(quantidade)) }));
}

// ---------------------------------------------------------------- certificação herdada (RN-08, §10)

export interface CertificadoFazenda {
  fazendaId: string;
  certificadoId: string;
  validadeInicio: string; // aaaa-mm-dd
  validadeFim: string;
  status: 'VALIDO' | 'VENCIDO' | 'SUSPENSO';
}

export function certificadoValidoEm(c: CertificadoFazenda, data: string): boolean {
  return c.status !== 'SUSPENSO' && c.validadeInicio <= data && data <= c.validadeFim;
}

/** Certificados válidos de uma fazenda numa data. */
export function certificadosDaFazenda(fazendaId: string, certificados: CertificadoFazenda[], data: string): Set<string> {
  return new Set(certificados.filter((c) => c.fazendaId === fazendaId && certificadoValidoEm(c, data)).map((c) => c.certificadoId));
}

/**
 * Certificados que um lote gerado pode ter (RN-08): a interseção dos certificados das origens,
 * limitada às fazendas da composição que tenham cada certificado válido na data do lote.
 */
export function certificadosHerdados(p: { origens: Set<string>[]; fazendas: string[]; certificadosFazendas: CertificadoFazenda[]; data: string }): Set<string> {
  if (!p.origens.length) return new Set();
  let r = new Set(p.origens[0]);
  for (const o of p.origens.slice(1)) r = new Set([...r].filter((c) => o.has(c)));
  for (const f of p.fazendas) {
    const validos = certificadosDaFazenda(f, p.certificadosFazendas, p.data);
    r = new Set([...r].filter((c) => validos.has(c)));
  }
  return r;
}

/** Só se pode tirar certificados de um lote, nunca acrescentar um que a regra não permita (RN-08). */
export function conferirCertificadosEscolhidos(permitidos: Set<string>, escolhidos: string[], nome: (id: string) => string): void {
  const indevidos = escolhidos.filter((c) => !permitidos.has(c));
  if (indevidos.length)
    throw new ErroRegra('RN-08', `O lote não pode ter ${indevidos.map(nome).join(', ')}: nem todas as origens e fazendas da composição têm esse certificado válido.`);
}
