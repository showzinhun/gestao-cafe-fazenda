import Decimal from 'decimal.js';

/** Formatação pt-BR (§12): 1.234,567 e dd/mm/aaaa. */
export function formatarNumero(valor: Decimal.Value, casas = 3): string {
  const d = new Decimal(valor).toDecimalPlaces(casas, Decimal.ROUND_HALF_UP);
  const [inteira = '0', fracao = ''] = d.abs().toFixed(casas).split('.');
  const milhar = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracao.replace(/0+$/, '');
  return (d.isNegative() && !d.isZero() ? '-' : '') + milhar + (frac ? ',' + frac : '');
}

export function formatarData(data: Date, fuso = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' }).format(data);
}

/** R$ 1.234,56 (sempre 2 casas). */
export function formatarMoeda(valor: Decimal.Value): string {
  const d = new Decimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [inteira = '0', fracao = '00'] = d.abs().toFixed(2).split('.');
  return `${d.isNegative() && !d.isZero() ? '-' : ''}R$ ${inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao}`;
}
