import type { Classe, ModeloResultado, Unidade } from './fluxo';

/** Modelos de fluxo prontos (§5.3). São copiados para a empresa na criação e depois editados à vontade. */
export interface EtapaModelo {
  codigo: string;
  nome: string;
  classe: Classe;
  prefixoLote: string;
  unidadeEntrada: Unidade;
  unidadeSaida: Unidade;
  modeloResultado: ModeloResultado;
  monitoraSecagem?: boolean;
  umidadeMetaMin?: string;
  umidadeMetaMax?: string;
  exigeLocal?: boolean;
  tiposResultado?: string[]; // códigos de tipo de café
}

export interface ModeloFluxo {
  codigo: 'VIA_UMIDA' | 'VIA_SECA' | 'SIMPLIFICADO';
  nome: string;
  descricao: string;
  etapas: EtapaModelo[];
  transicoes: [string, string][]; // códigos de etapa: origem → destino
}

const colheita: EtapaModelo = { codigo: 'COLHEITA', nome: 'Colheita', classe: 'COLHEITA', prefixoLote: 'EF', unidadeEntrada: 'MEDIDA', unidadeSaida: 'MEDIDA', modeloResultado: 'NENHUM' };
const terreiro: EtapaModelo = { codigo: 'TERREIRO', nome: 'Terreiro', classe: 'PROCESSAMENTO', prefixoLote: 'TE', unidadeEntrada: 'MEDIDA', unidadeSaida: 'MEDIDA', modeloResultado: 'CAFE_E_PERDA', monitoraSecagem: true, umidadeMetaMin: '11', umidadeMetaMax: '12.5', exigeLocal: true };
const secador: EtapaModelo = { codigo: 'SECADOR', nome: 'Secador', classe: 'PROCESSAMENTO', prefixoLote: 'SE', unidadeEntrada: 'MEDIDA', unidadeSaida: 'MEDIDA', modeloResultado: 'CAFE_E_PERDA', monitoraSecagem: true, umidadeMetaMin: '11', umidadeMetaMax: '12.5', exigeLocal: true };
const tulha: EtapaModelo = { codigo: 'TULHA', nome: 'Tulha', classe: 'PROCESSAMENTO', prefixoLote: 'TU', unidadeEntrada: 'MEDIDA', unidadeSaida: 'MEDIDA', modeloResultado: 'CAFE_E_PERDA', exigeLocal: true };
const armazem: EtapaModelo = { codigo: 'ARMAZEM', nome: 'Armazém', classe: 'ESTOQUE', prefixoLote: 'AR', unidadeEntrada: 'MEDIDA', unidadeSaida: 'KG', modeloResultado: 'CONVERSAO_ESTOQUE', exigeLocal: true };
const servico: EtapaModelo = { codigo: 'SERVICO', nome: 'Benefício / Serviço', classe: 'SERVICO', prefixoLote: 'GS', unidadeEntrada: 'KG', unidadeSaida: 'KG', modeloResultado: 'POR_PENEIRA' };
const embarque: EtapaModelo = { codigo: 'EMBARQUE', nome: 'Embarque', classe: 'SAIDA', prefixoLote: 'EB', unidadeEntrada: 'KG', unidadeSaida: 'KG', modeloResultado: 'NENHUM' };

export const MODELOS_FLUXO: ModeloFluxo[] = [
  {
    codigo: 'VIA_UMIDA',
    nome: 'Via úmida completa',
    descricao: 'Colheita → Lavador/Despolpador → Terreiro ⇄ Secador → Tulha → Armazém ⇄ Serviço → Embarque, com atalhos.',
    etapas: [
      colheita,
      { codigo: 'LAVADOR', nome: 'Lavador / Despolpador', classe: 'PROCESSAMENTO', prefixoLote: 'LD', unidadeEntrada: 'MEDIDA', unidadeSaida: 'MEDIDA', modeloResultado: 'PERCENTUAL_POR_TIPO', tiposResultado: ['VER', 'BOI', 'CD'] },
      terreiro,
      secador,
      tulha,
      armazem,
      servico,
      embarque,
    ],
    transicoes: [
      ['COLHEITA', 'LAVADOR'],
      ['LAVADOR', 'TERREIRO'],
      ['TERREIRO', 'SECADOR'],
      ['SECADOR', 'TERREIRO'],
      ['SECADOR', 'TULHA'],
      ['TULHA', 'ARMAZEM'],
      ['ARMAZEM', 'SERVICO'],
      ['SERVICO', 'ARMAZEM'],
      ['ARMAZEM', 'EMBARQUE'],
      // atalhos
      ['COLHEITA', 'TERREIRO'],
      ['LAVADOR', 'SECADOR'],
      ['TERREIRO', 'TULHA'],
    ],
  },
  {
    codigo: 'VIA_SECA',
    nome: 'Via seca (natural)',
    descricao: 'Colheita → Terreiro → Secador → Tulha → Armazém ⇄ Serviço → Embarque.',
    etapas: [colheita, terreiro, secador, tulha, armazem, servico, embarque],
    transicoes: [
      ['COLHEITA', 'TERREIRO'],
      ['TERREIRO', 'SECADOR'],
      ['SECADOR', 'TULHA'],
      ['TULHA', 'ARMAZEM'],
      ['ARMAZEM', 'SERVICO'],
      ['SERVICO', 'ARMAZEM'],
      ['ARMAZEM', 'EMBARQUE'],
    ],
  },
  {
    codigo: 'SIMPLIFICADO',
    nome: 'Simplificado',
    descricao: 'Colheita → Secador → Armazém → Embarque.',
    etapas: [colheita, secador, armazem, embarque],
    transicoes: [
      ['COLHEITA', 'SECADOR'],
      ['SECADOR', 'ARMAZEM'],
      ['ARMAZEM', 'EMBARQUE'],
    ],
  },
];

export function modeloFluxo(codigo: string): ModeloFluxo | undefined {
  return MODELOS_FLUXO.find((m) => m.codigo === codigo);
}

/** Cadastros-base copiados para toda empresa nova (§4.2: seed de tipos de café). */
export const TIPOS_CAFE_PADRAO = [
  ['NAT', 'Natural'],
  ['LAV', 'Lavado'],
  ['CAT', 'Cata'],
  ['VER', 'Verde'],
  ['BOI', 'Boia'],
  ['CD', 'Cereja descascada'],
  ['BEN', 'Beneficiado'],
] as const;

export const PENEIRAS_PADRAO = [
  ['19', 'Peneira 19'],
  ['18', 'Peneira 18'],
  ['17', 'Peneira 17'],
  ['16', 'Peneira 16'],
  ['15', 'Peneira 15'],
  ['14', 'Peneira 14'],
  ['13', 'Peneira 13'],
  ['MK', 'Moca'],
  ['FD', 'Fundo'],
  ['ESC', 'Escolha'],
] as const;

export const CERTIFICADOS_PADRAO = [
  ['RFA', 'Rainforest Alliance'],
  ['AAA', 'Nespresso AAA'],
  ['4C', '4C'],
  ['UTZ', 'UTZ Certified'],
  ['CAFE', 'C.A.F.E. Practices'],
  ['TAG', 'TAG Cerrado'],
  ['ORG', 'Orgânico'],
] as const;
