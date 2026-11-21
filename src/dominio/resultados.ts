import Decimal from 'decimal.js';
import { ErroRegra, ErroValidacao } from './erros';
import type { ModeloResultado, Unidade } from './fluxo';
import { qtd } from './quantidade';

/**
 * Cálculo dos lotes gerados por um movimento, conforme o modelo de resultado da etapa (§5.1).
 * Puro: recebe as entradas e os parâmetros informados; o serviço grava.
 */

export interface EntradaCalculo {
  id: string;
  quantidade: Decimal.Value;
  tipoCafeId: string | null;
}

export type ParametrosResultado =
  | { modelo: 'PERCENTUAL_POR_TIPO'; resultados: { tipoCafeId: string; percentual: Decimal.Value }[] }
  | { modelo: 'CAFE_E_PERDA'; fator?: Decimal.Value; fatores?: { tipoCafeId: string | null; fator: Decimal.Value }[] }
  | { modelo: 'CONVERSAO_ESTOQUE'; lotes: { quantidade: Decimal.Value; tipoCafeId?: string | null; peneiraId?: string | null }[] }
  | { modelo: 'POR_PENEIRA'; lotes: { quantidade: Decimal.Value; peneiraId: string; tipoCafeId?: string | null }[] };

export interface SaidaCalculada {
  tipoCafeId: string | null;
  peneiraId: string | null;
  quantidade: Decimal;
  percentual: Decimal | null;
  /** Entradas que formam este lote (composição e certificados vêm só delas). */
  fontes: string[];
}

export interface ResultadoCalculado {
  saidas: SaidaCalculada[];
  entrada: Decimal;
  saida: Decimal;
  perda: Decimal | null;
  percQuebra: Decimal | null;
  rendimento: Decimal | null;
}

const fracao = (v: Decimal.Value, oque: string): Decimal => {
  let d: Decimal;
  try {
    d = new Decimal(String(v).replace(',', '.'));
  } catch {
    throw new ErroValidacao(`${oque} inválido.`);
  }
  if (d.isNaN() || d.lt(0) || d.gt(1)) throw new ErroRegra('RN-12', `${oque} deve ficar entre 0 e 1 (recebido ${String(v)}).`);
  return d;
};

const positiva = (v: Decimal.Value, oque: string): Decimal => {
  const d = qtd(String(v).replace(',', '.'));
  if (d.lte(0)) throw new ErroValidacao(`${oque} deve ser maior que zero.`);
  return d;
};

/** Quebra (RN-10): (entrada − Σ saídas) / entrada, na mesma unidade, com 6 casas. */
export function quebra(entrada: Decimal.Value, saida: Decimal.Value): Decimal {
  const e = new Decimal(entrada);
  if (e.lte(0)) return new Decimal(0);
  return e.minus(saida).div(e).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/** Rendimento na conversão para o estoque (RN-10/RN-11): kg por medida, 3 casas. */
export function rendimento(kg: Decimal.Value, medidas: Decimal.Value): Decimal {
  return new Decimal(kg).div(medidas).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Se o arredondamento passar do total, tira a diferença do maior lote (a sobra vai para a perda, RN-12). */
function ajustarArredondamento(saidas: SaidaCalculada[], total: Decimal): void {
  const soma = saidas.reduce((s, x) => s.plus(x.quantidade), new Decimal(0));
  if (soma.lte(total)) return;
  const maior = [...saidas].sort((a, b) => b.quantidade.comparedTo(a.quantidade))[0]!;
  maior.quantidade = qtd(maior.quantidade.minus(soma.minus(total)));
}

export function calcularResultado(p: {
  modelo: ModeloResultado;
  unidadeEntrada: Unidade;
  entradas: EntradaCalculo[];
  parametros: ParametrosResultado;
  tiposPermitidos?: string[]; // PERCENTUAL_POR_TIPO: tipos configurados na etapa
}): ResultadoCalculado {
  if (p.parametros.modelo !== p.modelo) throw new ErroValidacao(`Esta etapa usa o resultado "${p.modelo}".`);
  if (!p.entradas.length) throw new ErroValidacao('O movimento não tem entradas.');
  const entrada = qtd(p.entradas.reduce((s, e) => s.plus(e.quantidade), new Decimal(0)));
  const todas = p.entradas.map((e) => e.id);
  const saidas: SaidaCalculada[] = [];
  const par = p.parametros;

  if (par.modelo === 'PERCENTUAL_POR_TIPO') {
    if (!par.resultados.length) throw new ErroValidacao('Informe o percentual de pelo menos um tipo.');
    const vistos = new Set<string>();
    let soma = new Decimal(0);
    for (const r of par.resultados) {
      if (vistos.has(r.tipoCafeId)) throw new ErroValidacao('Tipo de café repetido no resultado.');
      vistos.add(r.tipoCafeId);
      if (p.tiposPermitidos && !p.tiposPermitidos.includes(r.tipoCafeId)) throw new ErroValidacao('Esse tipo de café não é resultado desta etapa.');
      const pct = fracao(r.percentual, 'O percentual');
      soma = soma.plus(pct);
      if (pct.gt(0)) saidas.push({ tipoCafeId: r.tipoCafeId, peneiraId: null, quantidade: qtd(entrada.times(pct)), percentual: pct, fontes: todas });
    }
    if (soma.gt(1)) throw new ErroRegra('RN-12', `A soma dos percentuais (${soma.toString()}) passa de 1.`);
  } else if (par.modelo === 'CAFE_E_PERDA') {
    // D-02: um lote por tipo de café de entrada.
    const grupos = new Map<string | null, EntradaCalculo[]>();
    for (const e of p.entradas) grupos.set(e.tipoCafeId, [...(grupos.get(e.tipoCafeId) ?? []), e]);
    for (const [tipo, es] of grupos) {
      const especifico = par.fatores?.find((f) => f.tipoCafeId === tipo)?.fator;
      const valor = especifico ?? par.fator;
      if (valor === undefined || valor === null || String(valor).trim() === '') throw new ErroValidacao('Informe o fator de café (ex.: 0,90).');
      const fator = fracao(valor, 'O fator de café');
      const q = qtd(es.reduce((s, e) => s.plus(e.quantidade), new Decimal(0)).times(fator));
      if (q.gt(0)) saidas.push({ tipoCafeId: tipo, peneiraId: null, quantidade: q, percentual: fator, fontes: es.map((e) => e.id) });
    }
  } else {
    if (!par.lotes.length) throw new ErroValidacao('Informe pelo menos um lote de resultado.');
    for (const l of par.lotes) {
      if (par.modelo === 'POR_PENEIRA' && !l.peneiraId) throw new ErroValidacao('Informe a peneira de cada lote.');
      const q = positiva(l.quantidade, par.modelo === 'CONVERSAO_ESTOQUE' ? 'O peso em kg' : 'A quantidade');
      saidas.push({ tipoCafeId: l.tipoCafeId ?? null, peneiraId: l.peneiraId ?? null, quantidade: q, percentual: null, fontes: todas });
    }
  }

  const conversao = par.modelo === 'CONVERSAO_ESTOQUE' && p.unidadeEntrada === 'MEDIDA';
  if (!conversao) {
    const soma = saidas.reduce((s, x) => s.plus(x.quantidade), new Decimal(0));
    if (par.modelo === 'POR_PENEIRA' || par.modelo === 'CONVERSAO_ESTOQUE') {
      if (soma.gt(entrada)) throw new ErroRegra('RN-12', `Os lotes somam ${soma.toString()}, mais que a entrada (${entrada.toString()}).`);
      for (const s of saidas) s.percentual = s.quantidade.div(entrada).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    } else ajustarArredondamento(saidas, entrada);
  }
  if (!saidas.length) throw new ErroValidacao('O resultado não gera nenhum lote.');

  const saida = qtd(saidas.reduce((s, x) => s.plus(x.quantidade), new Decimal(0)));
  if (conversao) return { saidas, entrada, saida, perda: null, percQuebra: null, rendimento: rendimento(saida, entrada) };
  const perda = qtd(entrada.minus(saida));
  return { saidas, entrada, saida, perda, percQuebra: quebra(entrada, saida), rendimento: null };
}
