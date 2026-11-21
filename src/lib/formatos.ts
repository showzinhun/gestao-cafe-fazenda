import Decimal from 'decimal.js';
import { formatarNumero } from './formatacao';

/** Formatos de tela pt-BR usados no servidor e no cliente. Nunca fazem conta com number (regra 9). */
export const num = (v: string | null | undefined, casas = 3) => (v == null || v === '' ? '—' : formatarNumero(v, casas));
export const un = (u: string) => (u === 'KG' ? 'kg' : 'med.');
export const pct = (v: string | null | undefined, casas = 1) => (v == null ? '—' : `${formatarNumero(new Decimal(v).times(100), casas)}%`);
export const dataHora = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';
