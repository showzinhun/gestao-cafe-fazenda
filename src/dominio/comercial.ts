import Decimal from 'decimal.js';
import { ErroRegra } from './erros';
import { KG_POR_SACA, qtd } from './quantidade';

/** Regras do comercial (§9). Quantidades e dinheiro em Decimal (regra 9). */

export const codigoContrato = (ano: number, numero: number) => `CT-${ano}-${String(numero).padStart(4, '0')}`;
export const kgDoContrato = (sacas: Decimal.Value) => qtd(new Decimal(sacas).times(KG_POR_SACA));

/** §9.1: CONCLUIDO quando kg embarcado ≥ quantidade × (1 − tolerância). */
export function contratoCumprido(p: { quantidadeKg: Decimal.Value; toleranciaPerc: Decimal.Value; kgEmbarcado: Decimal.Value }): boolean {
  return new Decimal(p.kgEmbarcado).gte(new Decimal(p.quantidadeKg).times(new Decimal(1).minus(p.toleranciaPerc)));
}

/** §9.4: o embarque pode levar até o saldo do contrato + a tolerância. */
export function limiteDoEmbarque(p: { quantidadeKg: Decimal.Value; toleranciaPerc: Decimal.Value; kgEmbarcado: Decimal.Value }): Decimal {
  return qtd(new Decimal(p.quantidadeKg).minus(p.kgEmbarcado).plus(new Decimal(p.quantidadeKg).times(p.toleranciaPerc)));
}

/** RN-17: o lote precisa ter todos os certificados exigidos pelo contrato. */
export function exigirCertificadosDoContrato(lote: { codigo: string; certificados: string[] }, exigidos: { id: string; codigo: string }[]): void {
  const faltam = exigidos.filter((c) => !lote.certificados.includes(c.id));
  if (faltam.length) throw new ErroRegra('RN-17', `O lote ${lote.codigo} não tem ${faltam.map((c) => c.codigo).join(', ')}, exigido(s) pelo contrato.`);
}

/** Peneira mínima (§9.3): a ordem cresce da peneira maior para a menor (19 antes de 13). */
export function peneiraAtende(lote: { ordem: number } | null, minima: { ordem: number } | null): boolean {
  if (!minima) return true;
  return !!lote && lote.ordem <= minima.ordem;
}

/** RN-27: diferença entre o peso líquido da balança e a soma dos lotes; acima do limite exige motivo. */
export function diferencaPesagem(p: { bruto: Decimal.Value; tara: Decimal.Value; somaLotes: Decimal.Value; limitePerc?: Decimal.Value }) {
  const liquido = qtd(new Decimal(p.bruto).minus(p.tara));
  if (liquido.lte(0)) throw new ErroRegra('RN-27', 'O peso bruto precisa ser maior que a tara.');
  const soma = new Decimal(p.somaLotes);
  const diferenca = qtd(liquido.minus(soma));
  const perc = soma.gt(0) ? diferenca.abs().div(soma).toDecimalPlaces(6, Decimal.ROUND_HALF_UP) : new Decimal(1);
  return { liquido, diferenca, perc, exigeMotivo: perc.gt(p.limitePerc ?? '0.005') };
}

/** §9.5: sacas fixadas, preço médio ponderado e sacas a fixar. Σ fixadas ≤ quantidade. */
export function resumoFixacoes(fixacoes: { sacas: Decimal.Value; precoPorSaca: Decimal.Value }[], quantidadeSacas: Decimal.Value) {
  const fixadas = fixacoes.reduce((s, f) => s.plus(f.sacas), new Decimal(0));
  const valor = fixacoes.reduce((s, f) => s.plus(new Decimal(f.sacas).times(f.precoPorSaca)), new Decimal(0));
  return {
    fixadas: qtd(fixadas),
    precoMedio: fixadas.gt(0) ? valor.div(fixadas).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : null,
    aFixar: qtd(new Decimal(quantidadeSacas).minus(fixadas)),
  };
}

/** Dias inteiros até o fim do prazo (datas aaaa-mm-dd). Negativo = vencido. */
export function diasAte(fim: string, hoje: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
}
