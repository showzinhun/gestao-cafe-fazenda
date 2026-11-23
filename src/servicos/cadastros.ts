import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { ErroNaoEncontrado, ErroValidacao } from '@/dominio/erros';
import { cnpjValido, cpfValido, formatarCpfCnpj, normalizarPlaca, placaValida, soDigitos } from '@/dominio/documentos';
import { codigoFazendaValido, normalizarCodigoFazenda, UFS } from '@/dominio/fazenda';
import { GeometriaInvalida, processarGeometria } from '@/dominio/geometria';
import { vigenciasSobrepostas } from '@/dominio/precos';
import { alertasDoTalhao } from './talhoes-alertas';

/**
 * Cadastros do §4.2 com um mesmo ciclo de vida: listar, obter, criar, alterar e inativar.
 * Nada é apagado (regra 4); toda escrita grava auditoria (RN-15); tudo dentro de comTransacao (RLS).
 */

// ------------------------------------------------------------------ campos comuns
const texto = (max = 160) => z.string().trim().min(1).max(max);
const opcional = (max = 160) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const id = z.string().uuid();
const idOpcional = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));
const decimal = (casas: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(/\./g, (m, i, s: string) => (s.includes(',') ? '' : m)).replace(',', '.'))
    .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Informe um número.')
    .transform((v) => new Prisma.Decimal(v).toDecimalPlaces(casas).toString());
const decimalOpcional = (casas: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : v))
    .pipe(z.union([z.null(), decimal(casas)]));
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato aaaa-mm-dd.');
const dataOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.union([z.null(), data]));
const comoData = (v: string) => new Date(v + 'T00:00:00Z');

export const PAPEIS = ['PRODUTOR', 'CLIENTE', 'OPERADOR', 'TRANSPORTADOR'] as const;

// ------------------------------------------------------------------ definições
type Dados = Record<string, unknown>;
interface Definicao {
  entidade: string;
  modelo: string;
  rotulo: string;
  campoAtivo: 'ativo' | 'ativa';
  ordem: Record<string, 'asc' | 'desc'>[];
  incluir?: Record<string, unknown>;
  esquema: z.ZodType<Dados>;
  /** Converte e valida contra outros cadastros da empresa. Lança ErroValidacao. */
  preparar?: (dados: Dados, tx: Tx, atual: Dados | null) => Promise<{ dados: Dados; avisos?: string[] }>;
  /** Depois de gravar (ex.: alertas que precisam do id). Devolve avisos extras. */
  depois?: (tx: Tx, ctx: Contexto, registro: Dados, atual: Dados | null) => Promise<string[]>;
  filtros?: readonly string[];
}

async function exigeRegistro(tx: Tx, modelo: string, id: unknown, mensagem: string, extra: Dados = {}) {
  if (id === null || id === undefined) return null;
  const r = await delegado(tx, modelo).findFirst({ where: { id, ...extra } });
  if (!r) throw new ErroValidacao(mensagem);
  return r;
}

const DEF = {
  parceiros: {
    entidade: 'parceiro',
    modelo: 'parceiro',
    rotulo: 'parceiro',
    campoAtivo: 'ativo',
    ordem: [{ nome: 'asc' }],
    esquema: z.object({
      tipoPessoa: z.enum(['F', 'J']),
      nome: texto(),
      razaoSocial: opcional(),
      cpfCnpj: opcional(20),
      pais: z.string().trim().length(2).toUpperCase().default('BR'),
      papeis: z.array(z.enum(PAPEIS)).min(1, 'Escolha pelo menos um papel.'),
      codigoErp: opcional(40),
    }),
    async preparar(d) {
      const doc = d.cpfCnpj as string | null;
      if (doc && d.pais === 'BR') {
        const ok = d.tipoPessoa === 'F' ? cpfValido(doc) : cnpjValido(doc);
        if (!ok) throw new ErroValidacao(d.tipoPessoa === 'F' ? 'CPF inválido.' : 'CNPJ inválido.', 'cpfCnpj');
        d.cpfCnpj = formatarCpfCnpj(doc);
      }
      return { dados: d };
    },
  },
  fazendas: {
    entidade: 'fazenda',
    modelo: 'fazenda',
    rotulo: 'fazenda',
    campoAtivo: 'ativo',
    ordem: [{ codigo: 'asc' }],
    incluir: {
      produtor: { select: { id: true, nome: true, cpfCnpj: true } },
      _count: { select: { talhoes: true } },
      certificados: { select: { status: true, validadeInicio: true, validadeFim: true, parcial: true, certificado: { select: { codigo: true } } } },
    },
    esquema: z.object({
      codigo: texto(4),
      nome: texto(120),
      produtorId: idOpcional,
      municipio: opcional(120),
      uf: z.enum(UFS).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
      pais: z.string().trim().length(2).toUpperCase().default('BR'),
      car: opcional(80),
      ie: opcional(30),
    }),
    async preparar(d, tx) {
      d.codigo = normalizarCodigoFazenda(String(d.codigo));
      if (!codigoFazendaValido(d.codigo as string)) throw new ErroValidacao('O código da fazenda deve ter de 2 a 4 letras.', 'codigo');
      if (d.produtorId) await exigeRegistro(tx, 'parceiro', d.produtorId, 'Escolha um produtor cadastrado (parceiro com papel Produtor).', { papeis: { has: 'PRODUTOR' } });
      return { dados: d };
    },
  },
  talhoes: {
    entidade: 'talhao',
    modelo: 'talhao',
    rotulo: 'talhão',
    campoAtivo: 'ativo',
    ordem: [{ codigo: 'asc' }],
    filtros: ['fazendaId'],
    esquema: z.object({
      fazendaId: id,
      codigo: texto(10),
      nome: texto(120),
      areaHaInformada: decimalOpcional(4),
      variedade: opcional(80),
      anoPlantio: z.coerce.number().int().min(1900).max(2100).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
      geometria: z.unknown().optional(),
    }),
    async preparar(d, tx, atual) {
      await exigeRegistro(tx, 'fazenda', d.fazendaId, 'Fazenda não encontrada.');
      d.codigo = String(d.codigo).toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9-]{1,10}$/.test(d.codigo as string)) throw new ErroValidacao('O código do talhão aceita letras, números e hífen (até 10).', 'codigo');
      const avisos: string[] = [];
      if (d.geometria === null) {
        Object.assign(d, { geometria: Prisma.DbNull, geometriaTipo: null, areaHaCalculada: null });
      } else if (d.geometria !== undefined) {
        try {
          const g = processarGeometria(d.geometria, (d.areaHaInformada as string | null) ?? (atual?.areaHaInformada ? String(atual.areaHaInformada) : null));
          Object.assign(d, { geometria: g.geometria, geometriaTipo: g.tipo, areaHaCalculada: g.areaHa });
          avisos.push(...g.avisos);
        } catch (e) {
          if (e instanceof GeometriaInvalida) throw new ErroValidacao(e.message, 'geometria');
          throw e;
        }
      } else delete d.geometria;
      return { dados: d, avisos };
    },
    depois: alertasDoTalhao,
  },
  safras: {
    entidade: 'safra',
    modelo: 'safra',
    rotulo: 'safra',
    campoAtivo: 'ativa',
    ordem: [{ dataInicio: 'desc' }],
    esquema: z.object({ codigo: z.string().trim().regex(/^\d{4}\/\d{2}$/, 'Use o formato 2025/26.'), dataInicio: data, dataFim: data }),
    async preparar(d) {
      if (String(d.dataFim) <= String(d.dataInicio)) throw new ErroValidacao('O fim da safra deve ser depois do início.', 'dataFim');
      Object.assign(d, { dataInicio: comoData(d.dataInicio as string), dataFim: comoData(d.dataFim as string) });
      return { dados: d };
    },
  },
  'tipos-cafe': {
    entidade: 'tipo_cafe',
    modelo: 'tipoCafe',
    rotulo: 'tipo de café',
    campoAtivo: 'ativo',
    ordem: [{ codigo: 'asc' }],
    esquema: z.object({ codigo: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, 'De 2 a 4 letras.'), nome: texto(80) }),
  },
  peneiras: {
    entidade: 'peneira',
    modelo: 'peneira',
    rotulo: 'peneira',
    campoAtivo: 'ativo',
    ordem: [{ ordem: 'asc' }, { codigo: 'asc' }],
    esquema: z.object({ codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9/]{1,6}$/, 'Até 6 letras, números ou /.'), descricao: texto(80), ordem: z.coerce.number().int().min(0).max(999).default(0) }),
  },
  locais: {
    entidade: 'local',
    modelo: 'local',
    rotulo: 'local',
    campoAtivo: 'ativo',
    ordem: [{ codigo: 'asc' }],
    filtros: ['etapaId', 'fazendaId'],
    incluir: { etapa: { select: { id: true, nome: true, classe: true } }, fazenda: { select: { id: true, codigo: true } } },
    esquema: z.object({
      etapaId: id,
      fazendaId: idOpcional,
      codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, 'De 2 a 12 letras, números ou hífen.'),
      nome: texto(80),
      capacidade: decimalOpcional(3),
      unidadeCapacidade: z.enum(['M2', 'MEDIDA', 'KG', 'SACA']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
    }),
    async preparar(d, tx) {
      await exigeRegistro(tx, 'etapa', d.etapaId, 'Etapa não encontrada.');
      if (d.fazendaId) await exigeRegistro(tx, 'fazenda', d.fazendaId, 'Fazenda não encontrada.');
      if (d.capacidade && !d.unidadeCapacidade) throw new ErroValidacao('Informe a unidade da capacidade.', 'unidadeCapacidade');
      return { dados: d };
    },
  },
  turnos: {
    entidade: 'turno',
    modelo: 'turno',
    rotulo: 'turno',
    campoAtivo: 'ativo',
    ordem: [{ nome: 'asc' }],
    esquema: z.object({ nome: texto(40) }),
  },
  motoristas: {
    entidade: 'motorista',
    modelo: 'motorista',
    rotulo: 'motorista',
    campoAtivo: 'ativo',
    ordem: [{ nome: 'asc' }],
    incluir: { transportador: { select: { id: true, nome: true } } },
    esquema: z.object({ nome: texto(), cpf: opcional(20), cnh: opcional(20), placaPadrao: opcional(10), transportadorId: idOpcional, telefone: opcional(30) }),
    async preparar(d, tx) {
      if (d.cpf) {
        if (!cpfValido(d.cpf as string)) throw new ErroValidacao('CPF inválido.', 'cpf');
        d.cpf = formatarCpfCnpj(d.cpf as string);
      }
      if (d.cnh) d.cnh = soDigitos(d.cnh as string);
      if (d.placaPadrao) {
        if (!placaValida(d.placaPadrao as string)) throw new ErroValidacao('Placa inválida (ex.: ABC1D23).', 'placaPadrao');
        d.placaPadrao = normalizarPlaca(d.placaPadrao as string);
      }
      if (d.transportadorId) await exigeRegistro(tx, 'parceiro', d.transportadorId, 'Escolha uma transportadora cadastrada (parceiro com papel Transportador).', { papeis: { has: 'TRANSPORTADOR' } });
      return { dados: d };
    },
  },
  certificados: {
    entidade: 'certificado',
    modelo: 'certificado',
    rotulo: 'certificado',
    campoAtivo: 'ativo',
    ordem: [{ codigo: 'asc' }],
    esquema: z.object({ codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, 'De 2 a 6 letras ou números.'), nome: texto(80) }),
  },
  'precos-colheita': {
    entidade: 'tabela_preco_colheita',
    modelo: 'tabelaPrecoColheita',
    rotulo: 'preço de colheita',
    campoAtivo: 'ativo',
    ordem: [{ vigenciaInicio: 'desc' }],
    incluir: { safra: { select: { codigo: true } }, fazenda: { select: { codigo: true } }, talhao: { select: { codigo: true } } },
    esquema: z.object({
      safraId: id,
      fazendaId: idOpcional,
      talhaoId: idOpcional,
      tipoColheita: z.enum(['MANUAL', 'SEMIMECANIZADA']),
      valorPorMedida: decimal(2),
      vigenciaInicio: data,
      vigenciaFim: dataOpcional,
    }),
    async preparar(d, tx, atual) {
      await exigeRegistro(tx, 'safra', d.safraId, 'Safra não encontrada.');
      if (d.talhaoId) {
        const t = (await exigeRegistro(tx, 'talhao', d.talhaoId, 'Talhão não encontrado.')) as { fazendaId: string };
        if (d.fazendaId && d.fazendaId !== t.fazendaId) throw new ErroValidacao('O talhão não é da fazenda escolhida.', 'talhaoId');
        d.fazendaId = t.fazendaId;
      } else if (d.fazendaId) await exigeRegistro(tx, 'fazenda', d.fazendaId, 'Fazenda não encontrada.');
      if (!(Number(d.valorPorMedida) > 0)) throw new ErroValidacao('O valor por medida deve ser maior que zero.', 'valorPorMedida');
      if (d.vigenciaFim && String(d.vigenciaFim) < String(d.vigenciaInicio)) throw new ErroValidacao('O fim da vigência não pode ser antes do início.', 'vigenciaFim');
      const mesmos = (await tx.tabelaPrecoColheita.findMany({
        where: { safraId: d.safraId as string, tipoColheita: d.tipoColheita as 'MANUAL', fazendaId: (d.fazendaId as string) ?? null, talhaoId: (d.talhaoId as string) ?? null, ativo: true, ...(atual ? { NOT: { id: atual.id as string } } : {}) },
      })) as { vigenciaInicio: Date; vigenciaFim: Date | null }[];
      const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
      if (mesmos.some((m) => vigenciasSobrepostas({ vigenciaInicio: iso(m.vigenciaInicio)!, vigenciaFim: iso(m.vigenciaFim) }, { vigenciaInicio: d.vigenciaInicio as string, vigenciaFim: (d.vigenciaFim as string) ?? null }))) {
        throw new ErroValidacao('Já existe um preço para essa safra, tipo e local com vigência no mesmo período.', 'vigenciaInicio');
      }
      Object.assign(d, { vigenciaInicio: comoData(d.vigenciaInicio as string), vigenciaFim: d.vigenciaFim ? comoData(d.vigenciaFim as string) : null });
      return { dados: d };
    },
  },
} satisfies Record<string, Definicao>;

export type Recurso = keyof typeof DEF;
export const RECURSOS = Object.keys(DEF) as Recurso[];
export const ehRecurso = (r: string): r is Recurso => r in DEF;
export const rotuloRecurso = (r: Recurso) => DEF[r].rotulo;

// ------------------------------------------------------------------ acesso genérico ao delegado do Prisma
interface Delegado {
  findMany(a: unknown): Promise<Dados[]>;
  findFirst(a: unknown): Promise<Dados | null>;
  create(a: unknown): Promise<Dados>;
  update(a: unknown): Promise<Dados>;
}
function delegado(tx: Tx, modelo: string): Delegado {
  return (tx as unknown as Record<string, Delegado>)[modelo]!;
}

function erroDeBanco(e: unknown, rotulo: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ErroValidacao(`Já existe um ${rotulo} com esse código ou documento.`);
  }
  throw e;
}

const def = (r: Recurso): Definicao => DEF[r] as Definicao;

// ------------------------------------------------------------------ operações
export async function listar(ctx: Contexto, recurso: Recurso, opcoes: { incluirInativos?: boolean; filtro?: Record<string, string> } = {}) {
  const d = def(recurso);
  const where: Dados = {};
  if (!opcoes.incluirInativos) where[d.campoAtivo] = true;
  for (const [k, v] of Object.entries(opcoes.filtro ?? {})) {
    if (!d.filtros?.includes(k)) continue;
    if (!ehUuid(v)) return [];
    where[k] = v;
  }
  return comTransacao(ctx, (tx) => delegado(tx, d.modelo).findMany({ where, orderBy: d.ordem, include: d.incluir }));
}

export async function obter(ctx: Contexto, recurso: Recurso, idRegistro: string) {
  if (!ehUuid(idRegistro)) throw new ErroNaoEncontrado();
  const d = def(recurso);
  const r = await comTransacao(ctx, (tx) => delegado(tx, d.modelo).findFirst({ where: { id: idRegistro }, include: d.incluir }));
  if (!r) throw new ErroNaoEncontrado(`${d.rotulo[0]!.toUpperCase() + d.rotulo.slice(1)} não encontrado.`);
  return r;
}

export async function criar(ctx: Contexto, recurso: Recurso, entrada: unknown) {
  exigir(ctx, 'cadastros.editar');
  const d = def(recurso);
  const bruto = d.esquema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const { dados, avisos = [] } = d.preparar ? await d.preparar({ ...bruto }, tx, null) : { dados: bruto };
    let r: Dados;
    try {
      r = await delegado(tx, d.modelo).create({ data: { ...dados, empresaId: ctx.empresaId, criadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId } });
    } catch (e) {
      erroDeBanco(e, d.rotulo);
    }
    await auditar(tx, ctx, { entidade: d.entidade, entidadeId: String(r.id), acao: 'CRIAR', depois: r });
    if (d.depois) avisos.push(...(await d.depois(tx, ctx, r, null)));
    return { registro: r, avisos };
  });
}

export async function alterar(ctx: Contexto, recurso: Recurso, idRegistro: string, entrada: unknown) {
  exigir(ctx, 'cadastros.editar');
  if (!ehUuid(idRegistro)) throw new ErroNaoEncontrado();
  const d = def(recurso);
  return comTransacao(ctx, async (tx) => {
    const atual = await delegado(tx, d.modelo).findFirst({ where: { id: idRegistro } });
    if (!atual) throw new ErroNaoEncontrado();
    // Alteração completa: o formulário envia todos os campos; os ausentes mantêm o valor atual.
    const base = Object.fromEntries(Object.keys((d.esquema as unknown as z.ZodObject<z.ZodRawShape>).shape).map((k) => [k, atual[k] instanceof Prisma.Decimal ? String(atual[k]) : atual[k] instanceof Date ? (atual[k] as Date).toISOString().slice(0, 10) : atual[k]]));
    if ('geometria' in base) delete base.geometria; // a geometria só muda quando enviada
    const bruto = d.esquema.parse({ ...base, ...(entrada as Dados) });
    const { dados, avisos = [] } = d.preparar ? await d.preparar({ ...bruto }, tx, atual) : { dados: bruto };
    let r: Dados;
    try {
      r = await delegado(tx, d.modelo).update({ where: { id: idRegistro }, data: { ...dados, alteradoPor: ctx.usuarioId } });
    } catch (e) {
      erroDeBanco(e, d.rotulo);
    }
    await auditar(tx, ctx, { entidade: d.entidade, entidadeId: idRegistro, acao: 'ALTERAR', antes: atual, depois: r });
    if (d.depois) avisos.push(...(await d.depois(tx, ctx, r, atual)));
    return { registro: r, avisos };
  });
}

export async function definirAtivo(ctx: Contexto, recurso: Recurso, idRegistro: string, ativo: boolean) {
  exigir(ctx, 'cadastros.editar');
  if (!ehUuid(idRegistro)) throw new ErroNaoEncontrado();
  const d = def(recurso);
  return comTransacao(ctx, async (tx) => {
    const atual = await delegado(tx, d.modelo).findFirst({ where: { id: idRegistro } });
    if (!atual) throw new ErroNaoEncontrado();
    const r = await delegado(tx, d.modelo).update({ where: { id: idRegistro }, data: { [d.campoAtivo]: ativo, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: d.entidade, entidadeId: idRegistro, acao: ativo ? 'REATIVAR' : 'INATIVAR', antes: { [d.campoAtivo]: atual[d.campoAtivo] }, depois: { [d.campoAtivo]: ativo } });
    return r;
  });
}

// ------------------------------------------------------------------ opções para as listas de escolha
export type FonteOpcao = 'etapas' | 'fazendas' | 'safras' | 'talhoes' | 'transportadores' | 'produtores' | 'tiposCafe' | 'peneiras' | 'certificados' | 'locais';

/** Itens ativos para selects das telas (valor, rótulo e grupo para seleções dependentes). */
export async function listarOpcoes(ctx: Contexto, fontes: readonly FonteOpcao[]) {
  return comTransacao(ctx, async (tx) => {
    const r: Partial<Record<FonteOpcao, { valor: string; rotulo: string; grupo?: string }[]>> = {};
    for (const f of new Set(fontes)) {
      if (f === 'etapas') r[f] = (await tx.etapa.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } })).map((e) => ({ valor: e.id, rotulo: e.nome, grupo: e.classe }));
      if (f === 'fazendas') r[f] = (await tx.fazenda.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } })).map((e) => ({ valor: e.id, rotulo: `${e.codigo} · ${e.nome}` }));
      if (f === 'safras') r[f] = (await tx.safra.findMany({ where: { ativa: true }, orderBy: { dataInicio: 'desc' } })).map((e) => ({ valor: e.id, rotulo: e.codigo }));
      if (f === 'talhoes') r[f] = (await tx.talhao.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } })).map((e) => ({ valor: e.id, rotulo: `${e.codigo} · ${e.nome}`, grupo: e.fazendaId }));
      if (f === 'transportadores' || f === 'produtores') {
        const papel = f === 'transportadores' ? 'TRANSPORTADOR' : 'PRODUTOR';
        r[f] = (await tx.parceiro.findMany({ where: { ativo: true, papeis: { has: papel } }, orderBy: { nome: 'asc' } })).map((e) => ({ valor: e.id, rotulo: e.cpfCnpj ? `${e.nome} · ${e.cpfCnpj}` : e.nome }));
      }
      if (f === 'peneiras') r[f] = (await tx.peneira.findMany({ where: { ativo: true }, orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] })).map((e) => ({ valor: e.id, rotulo: e.codigo }));
      if (f === 'certificados') r[f] = (await tx.certificado.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } })).map((e) => ({ valor: e.id, rotulo: e.codigo }));
      if (f === 'locais') r[f] = (await tx.local.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } })).map((e) => ({ valor: e.id, rotulo: `${e.codigo} · ${e.nome}`, grupo: e.etapaId }));
      if (f === 'tiposCafe') r[f] = (await tx.tipoCafe.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } })).map((e) => ({ valor: e.id, rotulo: `${e.codigo} · ${e.nome}` }));
    }
    return r as Record<FonteOpcao, { valor: string; rotulo: string; grupo?: string }[]>;
  });
}
