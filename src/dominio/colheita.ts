import Decimal from 'decimal.js';
import { soDigitos } from './documentos';
import { qtd } from './quantidade';

/** Máscaras de dados pessoais (§3.3): mostram só o suficiente para conferir. */
export function mascararCpf(cpf: string): string {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : '***';
}

export function mascararPix(chave: string): string {
  const c = chave.trim();
  if (c.includes('@')) {
    const [u, dominio] = c.split('@');
    return `${u!.slice(0, 2)}***@${dominio}`;
  }
  const d = soDigitos(c);
  if (d.length >= 8 && d.length === c.replace(/[\s()+.-]/g, '').length) return `***${d.slice(-4)}`;
  return c.length > 8 ? `${c.slice(0, 4)}…${c.slice(-4)}` : '***';
}

/** Divergência da carga (§6.2): medido na recepção − apontado; percentual sobre o apontado. */
export function divergenciaCarga(medidas: Decimal.Value, apontadas: Decimal.Value, limitePerc: Decimal.Value = '0.05') {
  const m = qtd(medidas);
  const a = qtd(apontadas);
  const diferenca = qtd(m.minus(a));
  const perc = a.gt(0) ? diferenca.div(a).toDecimalPlaces(6, Decimal.ROUND_HALF_UP) : null;
  return { diferenca, perc, alerta: perc !== null && perc.abs().gt(limitePerc) };
}

export const dinheiro = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Item do fechamento (§6.3): Σ medidas × preço congelado + adicionais − adiantamentos − descontos.
 * Cada apontamento é arredondado a centavos antes de somar.
 */
export function calcularItem(p: { apontamentos: { medidas: Decimal.Value; valorUnitario: Decimal.Value }[]; lancamentos: { tipo: 'ADIANTAMENTO' | 'DESCONTO' | 'ADICIONAL'; valor: Decimal.Value }[] }) {
  const medidas = qtd(p.apontamentos.reduce((s, a) => s.plus(a.medidas), new Decimal(0)));
  const bruto = dinheiro(p.apontamentos.reduce((s, a) => s.plus(dinheiro(new Decimal(a.medidas).times(a.valorUnitario))), new Decimal(0)));
  const soma = (t: string) => dinheiro(p.lancamentos.filter((l) => l.tipo === t).reduce((s, l) => s.plus(l.valor), new Decimal(0)));
  const adiantamentos = soma('ADIANTAMENTO');
  const descontos = soma('DESCONTO');
  const adicionais = soma('ADICIONAL');
  return { medidas, bruto, adiantamentos, descontos, adicionais, liquido: dinheiro(bruto.plus(adicionais).minus(adiantamentos).minus(descontos)) };
}

/** Correção pelo apontador só no mesmo dia (§6.1). Datas aaaa-mm-dd no fuso da empresa. */
export const apontadorPodeCorrigir = (dataApontamento: string, hoje: string) => dataApontamento === hoje;
