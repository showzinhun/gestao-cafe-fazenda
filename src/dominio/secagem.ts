import Decimal from 'decimal.js';

/**
 * Painel de secagem (§7). A previsão é uma estimativa estatística (não é quantidade nem dinheiro),
 * por isso a regressão usa ponto flutuante; a umidade guardada continua Decimal.
 */

export interface Leitura {
  dataHora: Date | string;
  umidade: Decimal.Value;
}

const horas = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

/**
 * Previsão de ponto (§7): regressão log-linear ln(u) = a + b·t sobre as 3 últimas leituras.
 * Devolve em quantas horas (a partir da última leitura) a umidade chega ao topo da meta.
 * null se houver menos de 3 leituras ou se a umidade não estiver caindo.
 */
export function previsaoPonto(leituras: Leitura[], metaMax: Decimal.Value): { horas: number; em: Date } | null {
  if (leituras.length < 3) return null;
  const ult = [...leituras].sort((x, y) => new Date(x.dataHora).getTime() - new Date(y.dataHora).getTime()).slice(-3);
  const t0 = new Date(ult[0]!.dataHora);
  const pts = ult.map((l) => ({ t: horas(t0, new Date(l.dataHora)), y: Math.log(new Decimal(l.umidade).toNumber()) }));
  const ultima = ult[2]!;
  const alvo = new Decimal(metaMax);
  if (new Decimal(ultima.umidade).lte(alvo)) return { horas: 0, em: new Date(ultima.dataHora) };
  const n = pts.length;
  const mt = pts.reduce((s, p) => s + p.t, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.t - mt) ** 2, 0);
  if (sxx === 0) return null;
  const b = pts.reduce((s, p) => s + (p.t - mt) * (p.y - my), 0) / sxx;
  if (b >= 0) return null;
  const a = my - b * mt;
  const tAlvo = (Math.log(alvo.toNumber()) - a) / b;
  const faltam = Math.max(0, tAlvo - pts[2]!.t);
  return { horas: Math.round(faltam * 10) / 10, em: new Date(new Date(ultima.dataHora).getTime() + faltam * 3_600_000) };
}

export type Tendencia = 'caindo' | 'subindo' | 'estavel';

export function tendencia(leituras: Leitura[]): Tendencia | null {
  if (leituras.length < 2) return null;
  const o = [...leituras].sort((x, y) => new Date(x.dataHora).getTime() - new Date(y.dataHora).getTime());
  const d = new Decimal(o.at(-1)!.umidade).minus(o.at(-2)!.umidade);
  return d.abs().lt('0.2') ? 'estavel' : d.isNegative() ? 'caindo' : 'subindo';
}

export const dentroDaMeta = (u: Decimal.Value, min: Decimal.Value, max: Decimal.Value) => new Decimal(u).gte(min) && new Decimal(u).lte(max);

export type SituacaoSecagem = 'LIVRE' | 'SECANDO' | 'NO_PONTO' | 'ATENCAO';

/**
 * Cor do cartão (§7): livre; em secagem; no ponto (umidade na meta);
 * atenção (secagem mais longa que N dias, sem leitura há mais de X horas, ou já abaixo da meta).
 */
export function situacaoSecagem(p: {
  ocupado: boolean;
  ultimaUmidade: Decimal.Value | null;
  metaMin: Decimal.Value | null;
  metaMax: Decimal.Value | null;
  diasDesdeEntrada: number;
  horasSemLeitura: number | null;
  limiteDias: number;
  limiteHorasSemLeitura: number;
}): { situacao: SituacaoSecagem; motivos: string[] } {
  if (!p.ocupado) return { situacao: 'LIVRE', motivos: [] };
  const motivos: string[] = [];
  if (p.ultimaUmidade != null && p.metaMin != null && p.metaMax != null && dentroDaMeta(p.ultimaUmidade, p.metaMin, p.metaMax)) return { situacao: 'NO_PONTO', motivos };
  if (p.diasDesdeEntrada > p.limiteDias) motivos.push(`secando há ${p.diasDesdeEntrada} dias (limite ${p.limiteDias})`);
  if (p.horasSemLeitura == null || p.horasSemLeitura > p.limiteHorasSemLeitura) motivos.push(p.horasSemLeitura == null ? 'sem leitura de umidade' : `sem leitura há ${Math.floor(p.horasSemLeitura)} h`);
  if (p.ultimaUmidade != null && p.metaMin != null && new Decimal(p.ultimaUmidade).lt(p.metaMin)) motivos.push('umidade abaixo da meta (passou do ponto)');
  return { situacao: motivos.length ? 'ATENCAO' : 'SECANDO', motivos };
}
