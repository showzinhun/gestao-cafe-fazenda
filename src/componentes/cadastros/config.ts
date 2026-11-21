/** Telas genéricas de cadastro (§12, item 4): colunas e campos de cada recurso. Só apresentação. */
export type Opcao = { valor: string; rotulo: string; grupo?: string };
export type Registro = Record<string, unknown> & { id: string };

export interface CampoForm {
  nome: string;
  rotulo: string;
  tipo: 'texto' | 'decimal' | 'inteiro' | 'data' | 'selecao' | 'multipla';
  dica?: string;
  opcoes?: Opcao[] | string; // lista fixa ou nome da fonte vinda do servidor
  vazio?: string; // rótulo da opção vazia (campo opcional)
  obrigatorio?: boolean;
  padrao?: string;
  largura?: 'cheia';
  filtraPor?: string; // seleção dependente (ex.: talhão filtrado pela fazenda)
}

export interface Coluna {
  rotulo: string;
  valor: (r: Registro) => string;
  num?: boolean;
  mono?: boolean;
  link?: (r: Registro) => string;
}

export interface ConfigCadastro {
  titulo: string;
  singular: string;
  descricao: string;
  campoAtivo?: 'ativo' | 'ativa';
  colunas: Coluna[];
  campos: CampoForm[];
}

const t = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const dataBr = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('/') : '—');
const num = (v: unknown, casas = 3) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas }));
const sub = (r: Registro, k: string, c: string) => t((r[k] as Record<string, unknown> | null)?.[c]);

export const PAPEIS_OPCOES: Opcao[] = [
  { valor: 'PRODUTOR', rotulo: 'Produtor' },
  { valor: 'CLIENTE', rotulo: 'Cliente' },
  { valor: 'OPERADOR', rotulo: 'Operador' },
  { valor: 'TRANSPORTADOR', rotulo: 'Transportador' },
];
const rotuloPapel = (v: string) => PAPEIS_OPCOES.find((p) => p.valor === v)?.rotulo ?? v;

export const CADASTROS: Record<string, ConfigCadastro> = {
  fazendas: {
    titulo: 'Fazendas',
    singular: 'fazenda',
    descricao: 'Cada fazenda tem um código de 2 a 4 letras, usado no código do lote (§8). Abra a fazenda para cadastrar os talhões no mapa.',
    colunas: [
      { rotulo: 'Código', valor: (r) => t(r.codigo), mono: true, link: (r) => `/cadastros/fazendas/${r.id}` },
      { rotulo: 'Fazenda', valor: (r) => t(r.nome) },
      { rotulo: 'Produtor', valor: (r) => sub(r, 'produtor', 'nome') },
      { rotulo: 'Município / UF', valor: (r) => [r.municipio, r.uf].filter(Boolean).join(' / ') || '—' },
      { rotulo: 'CAR', valor: (r) => t(r.car), mono: true },
      { rotulo: 'Talhões', valor: (r) => t((r._count as { talhoes?: number } | undefined)?.talhoes ?? 0), num: true },
    ],
    campos: [
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', dica: '2 a 4 letras (ex.: NS)', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'produtorId', rotulo: 'Produtor', tipo: 'selecao', opcoes: 'produtores', vazio: 'Escolha o produtor…' },
      { nome: 'municipio', rotulo: 'Município', tipo: 'texto' },
      { nome: 'uf', rotulo: 'UF', tipo: 'selecao', vazio: '—', opcoes: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((u) => ({ valor: u, rotulo: u })) },
      { nome: 'car', rotulo: 'CAR', tipo: 'texto', dica: 'Cadastro Ambiental Rural' },
      { nome: 'ie', rotulo: 'Inscrição estadual', tipo: 'texto' },
      { nome: 'pais', rotulo: 'País', tipo: 'texto', padrao: 'BR' },
    ],
  },
  parceiros: {
    titulo: 'Parceiros',
    singular: 'parceiro',
    descricao: 'Produtores, clientes, operadores e transportadores. O produtor aparece no dossiê EUDR.',
    colunas: [
      { rotulo: 'Nome', valor: (r) => t(r.nome) },
      { rotulo: 'CPF / CNPJ', valor: (r) => t(r.cpfCnpj), mono: true },
      { rotulo: 'Pessoa', valor: (r) => (r.tipoPessoa === 'F' ? 'Física' : 'Jurídica') },
      { rotulo: 'Papéis', valor: (r) => ((r.papeis as string[]) ?? []).map(rotuloPapel).join(', ') },
    ],
    campos: [
      { nome: 'tipoPessoa', rotulo: 'Tipo de pessoa', tipo: 'selecao', opcoes: [{ valor: 'F', rotulo: 'Pessoa física' }, { valor: 'J', rotulo: 'Pessoa jurídica' }], obrigatorio: true, padrao: 'F' },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'razaoSocial', rotulo: 'Razão social', tipo: 'texto', dica: 'Pessoa jurídica' },
      { nome: 'cpfCnpj', rotulo: 'CPF / CNPJ', tipo: 'texto', dica: 'Conferido pelos dígitos verificadores' },
      { nome: 'pais', rotulo: 'País', tipo: 'texto', padrao: 'BR', dica: 'Sigla de 2 letras' },
      { nome: 'codigoErp', rotulo: 'Código no ERP', tipo: 'texto' },
      { nome: 'papeis', rotulo: 'Papéis', tipo: 'multipla', opcoes: PAPEIS_OPCOES, obrigatorio: true, largura: 'cheia' },
    ],
  },
  safras: {
    titulo: 'Safras',
    singular: 'safra',
    descricao: 'Ano agrícola. Obrigatória em todo movimento (RN-13).',
    campoAtivo: 'ativa',
    colunas: [
      { rotulo: 'Safra', valor: (r) => t(r.codigo), mono: true },
      { rotulo: 'Início', valor: (r) => dataBr(r.dataInicio) },
      { rotulo: 'Fim', valor: (r) => dataBr(r.dataFim) },
    ],
    campos: [
      { nome: 'codigo', rotulo: 'Safra', tipo: 'texto', dica: 'Ex.: 2025/26', obrigatorio: true },
      { nome: 'dataInicio', rotulo: 'Início', tipo: 'data', obrigatorio: true },
      { nome: 'dataFim', rotulo: 'Fim', tipo: 'data', obrigatorio: true },
    ],
  },
  'tipos-cafe': {
    titulo: 'Tipos de café',
    singular: 'tipo de café',
    descricao: 'Natural, lavado, verde, boia, cereja descascada… Os tipos que cada etapa gera são escolhidos no fluxo.',
    colunas: [
      { rotulo: 'Código', valor: (r) => t(r.codigo), mono: true },
      { rotulo: 'Tipo', valor: (r) => t(r.nome) },
    ],
    campos: [
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', dica: '2 a 4 letras', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    ],
  },
  peneiras: {
    titulo: 'Peneiras',
    singular: 'peneira',
    descricao: 'Classificação por tamanho do grão, usada no estoque e no serviço.',
    colunas: [
      { rotulo: 'Código', valor: (r) => t(r.codigo), mono: true },
      { rotulo: 'Descrição', valor: (r) => t(r.descricao) },
      { rotulo: 'Ordem', valor: (r) => t(r.ordem), num: true },
    ],
    campos: [
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
      { nome: 'ordem', rotulo: 'Ordem', tipo: 'inteiro', padrao: '0' },
    ],
  },
  locais: {
    titulo: 'Locais',
    singular: 'local',
    descricao: 'Terreiros, secadores, tulhas e quadras do armazém, com capacidade para o alerta de ocupação (RN-24).',
    colunas: [
      { rotulo: 'Código', valor: (r) => t(r.codigo), mono: true },
      { rotulo: 'Local', valor: (r) => t(r.nome) },
      { rotulo: 'Etapa', valor: (r) => sub(r, 'etapa', 'nome') },
      { rotulo: 'Fazenda', valor: (r) => (r.fazenda ? sub(r, 'fazenda', 'codigo') : 'Todas') },
      { rotulo: 'Capacidade', valor: (r) => (r.capacidade ? `${num(r.capacidade)} ${String(r.unidadeCapacidade ?? '').toLowerCase()}` : '—'), num: true },
    ],
    campos: [
      { nome: 'etapaId', rotulo: 'Etapa', tipo: 'selecao', opcoes: 'etapas', obrigatorio: true },
      { nome: 'fazendaId', rotulo: 'Fazenda', tipo: 'selecao', opcoes: 'fazendas', vazio: 'Todas (local central)' },
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', dica: 'Ex.: TE-01', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'capacidade', rotulo: 'Capacidade', tipo: 'decimal' },
      { nome: 'unidadeCapacidade', rotulo: 'Unidade', tipo: 'selecao', vazio: '—', opcoes: [{ valor: 'M2', rotulo: 'm²' }, { valor: 'MEDIDA', rotulo: 'Medidas' }, { valor: 'KG', rotulo: 'kg' }, { valor: 'SACA', rotulo: 'Sacas' }] },
    ],
  },
  turnos: {
    titulo: 'Turnos',
    singular: 'turno',
    descricao: 'Turnos de trabalho nos movimentos.',
    colunas: [{ rotulo: 'Turno', valor: (r) => t(r.nome) }],
    campos: [{ nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true }],
  },
  motoristas: {
    titulo: 'Motoristas',
    singular: 'motorista',
    descricao: 'Usados no carregamento do embarque (RN-27). A placa padrão é sugerida na guia.',
    colunas: [
      { rotulo: 'Nome', valor: (r) => t(r.nome) },
      { rotulo: 'CPF', valor: (r) => t(r.cpf), mono: true },
      { rotulo: 'Placa', valor: (r) => t(r.placaPadrao), mono: true },
      { rotulo: 'Transportadora', valor: (r) => (r.transportador ? sub(r, 'transportador', 'nome') : 'Autônomo') },
    ],
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'cpf', rotulo: 'CPF', tipo: 'texto' },
      { nome: 'cnh', rotulo: 'CNH', tipo: 'texto' },
      { nome: 'placaPadrao', rotulo: 'Placa padrão', tipo: 'texto', dica: 'Ex.: ABC1D23' },
      { nome: 'transportadorId', rotulo: 'Transportadora', tipo: 'selecao', opcoes: 'transportadores', vazio: 'Autônomo' },
      { nome: 'telefone', rotulo: 'Telefone', tipo: 'texto' },
    ],
  },
  certificados: {
    titulo: 'Certificados',
    singular: 'certificado',
    descricao: 'Certificações (RFA, AAA, 4C…). A validade por fazenda chega na Fase 7.',
    colunas: [
      { rotulo: 'Código', valor: (r) => t(r.codigo), mono: true },
      { rotulo: 'Certificado', valor: (r) => t(r.nome) },
    ],
    campos: [
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    ],
  },
  'precos-colheita': {
    titulo: 'Preços de colheita',
    singular: 'preço de colheita',
    descricao: 'Valor por medida. Vale o mais específico: talhão, depois fazenda, depois empresa. Usado no pagamento (Fase 4).',
    colunas: [
      { rotulo: 'Safra', valor: (r) => sub(r, 'safra', 'codigo'), mono: true },
      { rotulo: 'Vale para', valor: (r) => (r.talhao ? `Talhão ${sub(r, 'talhao', 'codigo')} · ${sub(r, 'fazenda', 'codigo')}` : r.fazenda ? `Fazenda ${sub(r, 'fazenda', 'codigo')}` : 'Empresa toda') },
      { rotulo: 'Colheita', valor: (r) => (r.tipoColheita === 'MANUAL' ? 'Manual' : 'Semimecanizada') },
      { rotulo: 'R$ / medida', valor: (r) => Number(r.valorPorMedida).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), num: true },
      { rotulo: 'Vigência', valor: (r) => `${dataBr(r.vigenciaInicio)} a ${r.vigenciaFim ? dataBr(r.vigenciaFim) : 'em aberto'}` },
    ],
    campos: [
      { nome: 'safraId', rotulo: 'Safra', tipo: 'selecao', opcoes: 'safras', obrigatorio: true },
      { nome: 'tipoColheita', rotulo: 'Tipo de colheita', tipo: 'selecao', opcoes: [{ valor: 'MANUAL', rotulo: 'Manual' }, { valor: 'SEMIMECANIZADA', rotulo: 'Semimecanizada' }], obrigatorio: true, padrao: 'MANUAL' },
      { nome: 'fazendaId', rotulo: 'Fazenda', tipo: 'selecao', opcoes: 'fazendas', vazio: 'Todas (preço da empresa)' },
      { nome: 'talhaoId', rotulo: 'Talhão', tipo: 'selecao', opcoes: 'talhoes', vazio: 'Todos da fazenda', filtraPor: 'fazendaId' },
      { nome: 'valorPorMedida', rotulo: 'Valor por medida (R$)', tipo: 'decimal', obrigatorio: true },
      { nome: 'vigenciaInicio', rotulo: 'Vigência de', tipo: 'data', obrigatorio: true },
      { nome: 'vigenciaFim', rotulo: 'Vigência até', tipo: 'data', dica: 'Vazio = em aberto' },
    ],
  },
};
