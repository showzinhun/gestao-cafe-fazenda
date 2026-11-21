/**
 * Fluxo configurável (§4.3, §5). O código conhece só as classes (regra 6).
 * Funções puras: recebem a configuração e devolvem os problemas encontrados.
 */
export const CLASSES = ['COLHEITA', 'PROCESSAMENTO', 'ESTOQUE', 'SERVICO', 'SAIDA'] as const;
export type Classe = (typeof CLASSES)[number];
export const MODELOS_RESULTADO = ['NENHUM', 'PERCENTUAL_POR_TIPO', 'CAFE_E_PERDA', 'POR_PENEIRA', 'CONVERSAO_ESTOQUE'] as const;
export type ModeloResultado = (typeof MODELOS_RESULTADO)[number];
export type Unidade = 'MEDIDA' | 'KG';

export const NOME_CLASSE: Record<Classe, string> = {
  COLHEITA: 'Colheita',
  PROCESSAMENTO: 'Processamento',
  ESTOQUE: 'Estoque',
  SERVICO: 'Serviço',
  SAIDA: 'Saída',
};
export const NOME_MODELO: Record<ModeloResultado, string> = {
  NENHUM: 'Nenhum',
  PERCENTUAL_POR_TIPO: 'Percentual por tipo de café',
  CAFE_E_PERDA: 'Café e perda',
  POR_PENEIRA: 'Por peneira',
  CONVERSAO_ESTOQUE: 'Conversão para estoque (kg)',
};

/** O que cada classe aceita (§5.1). */
export const REGRAS_CLASSE: Record<Classe, { modelos: readonly ModeloResultado[]; entrada: readonly Unidade[]; saida: readonly Unidade[]; podeSecagem: boolean; recebeDeOutras: boolean; enviaParaOutras: boolean }> = {
  COLHEITA: { modelos: ['NENHUM'], entrada: ['MEDIDA'], saida: ['MEDIDA'], podeSecagem: false, recebeDeOutras: false, enviaParaOutras: true },
  PROCESSAMENTO: { modelos: ['PERCENTUAL_POR_TIPO', 'CAFE_E_PERDA'], entrada: ['MEDIDA'], saida: ['MEDIDA'], podeSecagem: true, recebeDeOutras: true, enviaParaOutras: true },
  ESTOQUE: { modelos: ['CONVERSAO_ESTOQUE'], entrada: ['MEDIDA', 'KG'], saida: ['KG'], podeSecagem: false, recebeDeOutras: true, enviaParaOutras: true },
  SERVICO: { modelos: ['POR_PENEIRA'], entrada: ['KG'], saida: ['KG'], podeSecagem: false, recebeDeOutras: true, enviaParaOutras: true },
  SAIDA: { modelos: ['NENHUM'], entrada: ['KG'], saida: ['KG'], podeSecagem: false, recebeDeOutras: true, enviaParaOutras: false },
};

export interface EtapaConfig {
  id: string;
  codigo: string;
  nome: string;
  classe: Classe;
  prefixoLote: string;
  unidadeEntrada: Unidade;
  unidadeSaida: Unidade;
  modeloResultado: ModeloResultado;
  monitoraSecagem: boolean;
  umidadeMetaMin: string | null;
  umidadeMetaMax: string | null;
  exigeLocal: boolean;
  ativa: boolean;
  tiposResultado: string[]; // ids ou códigos de tipo de café
}

export interface TransicaoConfig {
  origem: string; // id da etapa
  destino: string;
  fazendaId: string | null;
}

export interface Problema {
  etapa?: string;
  mensagem: string;
  /** Transição impossível (classe ou unidade): bloqueia o salvamento. As demais são pendências. */
  grave?: boolean;
}

export function normalizarPrefixo(p: string): string {
  return p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/** Valida uma etapa isolada contra as regras da classe. */
export function validarEtapa(e: Omit<EtapaConfig, 'id'> & { id?: string }): Problema[] {
  const p: Problema[] = [];
  const r = REGRAS_CLASSE[e.classe];
  const nome = e.nome || e.codigo;
  if (!e.nome.trim()) p.push({ etapa: nome, mensagem: 'Informe o nome da etapa.' });
  if (!/^[A-Z0-9_]{2,12}$/.test(e.codigo)) p.push({ etapa: nome, mensagem: 'O código da etapa deve ter de 2 a 12 letras, números ou _.' });
  if (!/^[A-Z]{2,3}$/.test(e.prefixoLote)) p.push({ etapa: nome, mensagem: 'O prefixo do lote deve ter 2 ou 3 letras (§8).' });
  if (!r.modelos.includes(e.modeloResultado)) p.push({ etapa: nome, mensagem: `Etapas de ${NOME_CLASSE[e.classe]} usam o resultado ${r.modelos.map((m) => NOME_MODELO[m]).join(' ou ')}.` });
  if (!r.entrada.includes(e.unidadeEntrada)) p.push({ etapa: nome, mensagem: `Etapas de ${NOME_CLASSE[e.classe]} recebem em ${r.entrada.join(' ou ')}.` });
  if (!r.saida.includes(e.unidadeSaida)) p.push({ etapa: nome, mensagem: `Etapas de ${NOME_CLASSE[e.classe]} geram em ${r.saida.join(' ou ')}.` });
  if (e.modeloResultado === 'PERCENTUAL_POR_TIPO' && e.tiposResultado.length === 0) p.push({ etapa: nome, mensagem: 'Escolha os tipos de café que a etapa gera (ex.: verde, boia, cereja descascada).' });
  if (e.monitoraSecagem && !r.podeSecagem) p.push({ etapa: nome, mensagem: 'Só etapas de processamento entram no painel de secagem.' });
  if (e.monitoraSecagem) {
    const min = e.umidadeMetaMin === null ? NaN : Number(e.umidadeMetaMin);
    const max = e.umidadeMetaMax === null ? NaN : Number(e.umidadeMetaMax);
    if (!(min >= 0 && max <= 100 && min < max)) p.push({ etapa: nome, mensagem: 'Informe a meta de umidade (mínima menor que a máxima, entre 0 e 100%).' });
  }
  return p;
}

const NOME_UNIDADE: Record<Unidade, string> = { MEDIDA: 'medidas', KG: 'kg' };

/**
 * A unidade de saída da origem precisa ser a de entrada do destino. Exceção: a etapa de estoque
 * guarda em kg, então também recebe kg direto (ex.: o café que volta do benefício para o armazém).
 */
export function unidadesCompativeis(o: Pick<EtapaConfig, 'unidadeSaida'>, d: Pick<EtapaConfig, 'classe' | 'unidadeEntrada' | 'unidadeSaida'>): boolean {
  if (o.unidadeSaida === d.unidadeEntrada) return true;
  return d.classe === 'ESTOQUE' && o.unidadeSaida === 'KG' && d.unidadeSaida === 'KG';
}

/** Pode existir a transição origem → destino (classes e unidades)? Não olha repetição nem alcance. */
export function transicaoPermitida(o: EtapaConfig, d: EtapaConfig): boolean {
  return o.id !== d.id && REGRAS_CLASSE[o.classe].enviaParaOutras && REGRAS_CLASSE[d.classe].recebeDeOutras && unidadesCompativeis(o, d);
}

/**
 * Valida o fluxo inteiro (§5.2): pelo menos uma etapa ativa de COLHEITA, ESTOQUE e SAIDA;
 * prefixos e códigos únicos; transições coerentes com as classes; tudo alcançável a partir da colheita.
 */
export function validarFluxo(etapas: EtapaConfig[], transicoes: TransicaoConfig[]): Problema[] {
  const p: Problema[] = [];
  const ativas = etapas.filter((e) => e.ativa);
  for (const c of ['COLHEITA', 'ESTOQUE', 'SAIDA'] as const) {
    if (!ativas.some((e) => e.classe === c)) p.push({ mensagem: `O fluxo precisa de pelo menos uma etapa ativa de ${NOME_CLASSE[c]}.` });
  }
  const repetido = (campo: 'codigo' | 'prefixoLote', rotulo: string) => {
    const vistos = new Map<string, string>();
    for (const e of etapas) {
      const v = e[campo];
      if (vistos.has(v)) p.push({ etapa: e.nome, mensagem: `${rotulo} ${v} já é usado pela etapa ${vistos.get(v)}.` });
      else vistos.set(v, e.nome);
    }
  };
  repetido('codigo', 'O código');
  repetido('prefixoLote', 'O prefixo');
  for (const e of etapas) p.push(...validarEtapa(e));

  const porId = new Map(etapas.map((e) => [e.id, e]));
  const chaves = new Set<string>();
  for (const t of transicoes) {
    const o = porId.get(t.origem);
    const d = porId.get(t.destino);
    if (!o || !d) {
      p.push({ mensagem: 'Há uma transição para uma etapa que não existe.' });
      continue;
    }
    if (o.id === d.id) p.push({ etapa: o.nome, mensagem: 'Uma etapa não pode transferir para ela mesma.', grave: true });
    if (!REGRAS_CLASSE[o.classe].enviaParaOutras) p.push({ etapa: o.nome, mensagem: `${NOME_CLASSE[o.classe]} é o fim do fluxo: não transfere para outra etapa.`, grave: true });
    if (!REGRAS_CLASSE[d.classe].recebeDeOutras) p.push({ etapa: d.nome, mensagem: `${NOME_CLASSE[d.classe]} não recebe café de outras etapas.`, grave: true });
    if (!unidadesCompativeis(o, d)) p.push({ etapa: d.nome, mensagem: `${o.nome} gera em ${NOME_UNIDADE[o.unidadeSaida]}, mas ${d.nome} recebe em ${NOME_UNIDADE[d.unidadeEntrada]}.`, grave: true });
    const k = `${t.origem}>${t.destino}>${t.fazendaId ?? '*'}`;
    if (chaves.has(k)) p.push({ etapa: o.nome, mensagem: `A transição ${o.nome} → ${d.nome} está repetida.` });
    chaves.add(k);
  }

  // Alcance: toda etapa ativa (exceto colheita) deve ser alcançável a partir de alguma colheita ativa.
  const geral = transicoes;
  const alcance = new Set(ativas.filter((e) => e.classe === 'COLHEITA').map((e) => e.id));
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of geral) {
      if (alcance.has(t.origem) && !alcance.has(t.destino) && porId.get(t.destino)?.ativa) {
        alcance.add(t.destino);
        mudou = true;
      }
    }
  }
  for (const e of ativas) if (!alcance.has(e.id)) p.push({ etapa: e.nome, mensagem: `Nenhum caminho leva da colheita até ${e.nome}.` });
  return p;
}

/**
 * Destinos permitidos para uma etapa numa fazenda: primeiro as transições da fazenda;
 * se a fazenda não tiver nenhuma para essa origem, valem as da empresa (§5.2, RN-16).
 */
export function destinosPermitidos(transicoes: TransicaoConfig[], origem: string, fazendaId: string | null): string[] {
  const daFazenda = fazendaId ? transicoes.filter((t) => t.origem === origem && t.fazendaId === fazendaId) : [];
  const base = daFazenda.length ? daFazenda : transicoes.filter((t) => t.origem === origem && t.fazendaId === null);
  return [...new Set(base.map((t) => t.destino))];
}
