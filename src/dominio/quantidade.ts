import Decimal from 'decimal.js';

/** Quantidades (kg, medidas) com 3 casas, como numeric(14,3) no banco (§4). Nunca usar number. */
export type Quantidade = Decimal;

export const KG_POR_SACA = new Decimal(60);

export function qtd(valor: Decimal.Value): Decimal {
  return new Decimal(valor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export function kgParaSacas(kg: Decimal.Value, kgPorSaca: Decimal.Value = KG_POR_SACA): Decimal {
  return new Decimal(kg).div(kgPorSaca).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}
