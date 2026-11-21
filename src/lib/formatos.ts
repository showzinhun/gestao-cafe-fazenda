import Decimal from 'decimal.js';
import { formatarNumero } from './formatacao';

/** Formatos de tela pt-BR usados no servidor e no cliente. Nunca fazem conta com number (regra 9). */
export const num = (v: string | null | undefined, casas = 3) => (v == null || v === '' ? '—' : formatarNumero(v, casas));
export const un = (u: string) => (u === 'KG' ? 'kg' : 'med.');
export const pct = (v: string | null | undefined, casas = 1) => (v == null ? '—' : `${formatarNumero(new Decimal(v).times(100), casas)}%`);
export const dataHora = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';

/**
 * Número digitado na tela, sempre no formato brasileiro: "1.200" = mil e duzentos, "0,95" = 95 centésimos.
 * Devolve o texto canônico ("1200", "0.95") que a API recebe. Vazio continua vazio.
 */
export function paraApi(t: string): string {
  return t.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
}

/** Valor do servidor ("1200.000") para o campo da tela ("1200,000"). */
export const paraCampo = (v: string) => v.replace('.', ',');
/** Preço com duas casas fixas e símbolo da moeda do contrato (R$ 1.800,00 / US$ 210,50). */
export const preco = (v: string | null | undefined, moeda: string = 'BRL') => {
  if (v == null || v === '') return '—';
  const d = new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [i = '0', f = '00'] = d.abs().toFixed(2).split('.');
  return `${moeda === 'USD' ? 'US$' : 'R$'} ${d.isNegative() ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${f}`;
};
