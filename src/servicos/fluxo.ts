import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { ErroNaoEncontrado, ErroValidacao } from '@/dominio/erros';
import { CLASSES, MODELOS_RESULTADO, normalizarPrefixo, REGRAS_CLASSE, validarEtapa, validarFluxo, type EtapaConfig, type Problema, type TransicaoConfig } from '@/dominio/fluxo';
import { modeloFluxo, type ModeloFluxo } from '@/dominio/modelos-fluxo';

/**
 * Fluxo configurável da empresa (§4.3, §5): etapas, tipos de resultado e transições.
 * Etapas nunca são apagadas, só desativadas (§5.2). Mudar transições não afeta movimentos já feitos.
 */
export interface Fluxo {
  etapas: (EtapaConfig & { ordem: number; locais: number })[];
  transicoes: (TransicaoConfig & { id: string })[];
  pendencias: Problema[];
}

const paraConfig = (e: {
  id: string; codigo: string; nome: string; classe: EtapaConfig['classe']; prefixoLote: string; unidadeEntrada: EtapaConfig['unidadeEntrada']; unidadeSaida: EtapaConfig['unidadeSaida'];
  modeloResultado: EtapaConfig['modeloResultado']; monitoraSecagem: boolean; umidadeMetaMin: Prisma.Decimal | null; umidadeMetaMax: Prisma.Decimal | null; exigeLocal: boolean; ativa: boolean; ordem: number;
  tiposResultado: { tipoCafeId: string; ordem: number }[]; _count?: { locais: number };
}) => ({
  id: e.id, codigo: e.codigo, nome: e.nome, classe: e.classe, prefixoLote: e.prefixoLote, unidadeEntrada: e.unidadeEntrada, unidadeSaida: e.unidadeSaida,
  modeloResultado: e.modeloResultado, monitoraSecagem: e.monitoraSecagem, umidadeMetaMin: e.umidadeMetaMin?.toString() ?? null, umidadeMetaMax: e.umidadeMetaMax?.toString() ?? null,
  exigeLocal: e.exigeLocal, ativa: e.ativa, ordem: e.ordem, locais: e._count?.locais ?? 0,
  tiposResultado: [...e.tiposResultado].sort((a, b) => a.ordem - b.ordem).map((t) => t.tipoCafeId),
});

async function lerFluxo(tx: Tx): Promise<Fluxo> {
  const [etapas, transicoes] = await Promise.all([
    tx.etapa.findMany({ include: { tiposResultado: true, _count: { select: { locais: true } } }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }),
    tx.fluxoTransicao.findMany({ orderBy: { criadoEm: 'asc' } }),
  ]);
  const es = etapas.map(paraConfig);
  const ts = transicoes.map((t) => ({ id: t.id, origem: t.etapaOrigemId, destino: t.etapaDestinoId, fazendaId: t.fazendaId }));
  return { etapas: es, transicoes: ts, pendencias: validarFluxo(es, ts) };
}

export async function obterFluxo(ctx: Contexto): Promise<Fluxo> {
  return comTransacao(ctx, lerFluxo);
}

function problemas(lista: Problema[]): never {
  throw new ErroValidacao(lista.map((p) => (p.etapa ? `${p.etapa}: ${p.mensagem}` : p.mensagem)).join(' '));
}

export const etapaSchema = z.object({
  codigo: z.string().trim().toUpperCase().transform((v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9_]/g, '_')),
  nome: z.string().trim().min(1).max(60),
  classe: z.enum(CLASSES),
  prefixoLote: z.string().transform(normalizarPrefixo),
  unidadeEntrada: z.enum(['MEDIDA', 'KG']),
  unidadeSaida: z.enum(['MEDIDA', 'KG']),
  modeloResultado: z.enum(MODELOS_RESULTADO),
  monitoraSecagem: z.coerce.boolean().default(false),
  umidadeMetaMin: z.union([z.string(), z.number(), z.null()]).optional().transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).replace(',', '.'))),
  umidadeMetaMax: z.union([z.string(), z.number(), z.null()]).optional().transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).replace(',', '.'))),
  exigeLocal: z.coerce.boolean().default(false),
  tiposResultado: z.array(z.string().uuid()).default([]),
});
export type EntradaEtapa = z.input<typeof etapaSchema>;

/** Cria ou altera uma etapa. Valida as regras da classe e a unicidade de código e prefixo. */
export async function salvarEtapa(ctx: Contexto, idEtapa: string | null, entrada: EntradaEtapa) {
  exigir(ctx, 'fluxo.configurar');
  const d = etapaSchema.parse(entrada);
  if (!d.monitoraSecagem) Object.assign(d, { umidadeMetaMin: null, umidadeMetaMax: null });
  if (d.modeloResultado !== 'PERCENTUAL_POR_TIPO') d.tiposResultado = [];
  return comTransacao(ctx, async (tx) => {
    const atual = idEtapa ? await tx.etapa.findFirst({ where: { id: idEtapa }, include: { tiposResultado: true } }) : null;
    if (idEtapa && !atual) throw new ErroNaoEncontrado('Etapa não encontrada.');
    const config = { ...d, ativa: atual?.ativa ?? true };
    const p = validarEtapa(config);
    if (p.length) problemas(p);
    if (d.tiposResultado.length) {
      const n = await tx.tipoCafe.count({ where: { id: { in: d.tiposResultado }, ativo: true } });
      if (n !== d.tiposResultado.length) throw new ErroValidacao('Algum tipo de café escolhido não existe ou está inativo.');
    }
    const dup = await tx.etapa.findFirst({ where: { OR: [{ codigo: d.codigo }, { prefixoLote: d.prefixoLote }], ...(idEtapa ? { NOT: { id: idEtapa } } : {}) } });
    if (dup) throw new ErroValidacao(dup.codigo === d.codigo ? `O código ${d.codigo} já é da etapa ${dup.nome}.` : `O prefixo ${d.prefixoLote} já é da etapa ${dup.nome}.`);
    if (atual && atual.classe !== d.classe) {
      // Trocar a classe pode quebrar transições existentes: confere o fluxo com a mudança.
      const f = await lerFluxo(tx);
      const etapas = f.etapas.map((e) => (e.id === atual.id ? { ...e, ...d } : e));
      const graves = validarFluxo(etapas, f.transicoes).filter((x) => /não transfere|não recebe|recebe em medidas/.test(x.mensagem));
      if (graves.length) problemas(graves);
    }
    const { tiposResultado, ...campos } = d;
    const dadosEtapa = { ...campos, umidadeMetaMin: campos.umidadeMetaMin, umidadeMetaMax: campos.umidadeMetaMax, alteradoPor: ctx.usuarioId };
    const ordem = atual ? atual.ordem : ((await tx.etapa.aggregate({ _max: { ordem: true } }))._max.ordem ?? 0) + 10;
    const etapa = atual
      ? await tx.etapa.update({ where: { id: atual.id }, data: dadosEtapa })
      : await tx.etapa.create({ data: { ...dadosEtapa, empresaId: ctx.empresaId, ordem, criadoPor: ctx.usuarioId } });
    await tx.etapaTipoResultado.deleteMany({ where: { etapaId: etapa.id } });
    if (tiposResultado.length) await tx.etapaTipoResultado.createMany({ data: tiposResultado.map((t, i) => ({ empresaId: ctx.empresaId, etapaId: etapa.id, tipoCafeId: t, ordem: i })) });
    await auditar(tx, ctx, { entidade: 'etapa', entidadeId: etapa.id, acao: atual ? 'ALTERAR' : 'CRIAR', antes: atual ?? undefined, depois: { ...etapa, tiposResultado } });
    return etapa;
  });
}

/** Desativa ou reativa. A empresa precisa manter ao menos uma COLHEITA, ESTOQUE e SAIDA ativas (§5.2). */
export async function definirEtapaAtiva(ctx: Contexto, idEtapa: string, ativa: boolean) {
  exigir(ctx, 'fluxo.configurar');
  if (!ehUuid(idEtapa)) throw new ErroNaoEncontrado();
  return comTransacao(ctx, async (tx) => {
    const e = await tx.etapa.findFirst({ where: { id: idEtapa } });
    if (!e) throw new ErroNaoEncontrado('Etapa não encontrada.');
    if (!ativa && ['COLHEITA', 'ESTOQUE', 'SAIDA'].includes(e.classe)) {
      const outras = await tx.etapa.count({ where: { classe: e.classe, ativa: true, NOT: { id: e.id } } });
      if (outras === 0) throw new ErroValidacao(`${e.nome} é a única etapa ativa da classe ${e.classe}. O fluxo precisa de pelo menos uma.`);
    }
    const r = await tx.etapa.update({ where: { id: e.id }, data: { ativa, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'etapa', entidadeId: e.id, acao: ativa ? 'REATIVAR' : 'INATIVAR', antes: { ativa: e.ativa }, depois: { ativa } });
    return r;
  });
}

/** Muda a posição da etapa na lista (só apresentação). */
export async function moverEtapa(ctx: Contexto, idEtapa: string, direcao: -1 | 1) {
  exigir(ctx, 'fluxo.configurar');
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.etapa.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    const i = lista.findIndex((e) => e.id === idEtapa);
    if (i < 0) throw new ErroNaoEncontrado('Etapa não encontrada.');
    const j = i + direcao;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    for (const [k, e] of lista.entries()) if (e.ordem !== (k + 1) * 10) await tx.etapa.update({ where: { id: e.id }, data: { ordem: (k + 1) * 10 } });
  });
}

export const transicoesSchema = z.object({
  fazendaId: z.string().uuid().nullable().default(null),
  pares: z.array(z.tuple([z.string().uuid(), z.string().uuid()])),
});

/**
 * Substitui as transições de um escopo (empresa toda ou uma fazenda). Bloqueia transições
 * incompatíveis com as classes; pendências gerais do fluxo voltam como aviso.
 */
export async function salvarTransicoes(ctx: Contexto, entrada: z.input<typeof transicoesSchema>) {
  exigir(ctx, 'fluxo.configurar');
  const { fazendaId, pares } = transicoesSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    if (fazendaId && !(await tx.fazenda.findFirst({ where: { id: fazendaId } }))) throw new ErroNaoEncontrado('Fazenda não encontrada.');
    const f = await lerFluxo(tx);
    const ids = new Set(f.etapas.map((e) => e.id));
    if (pares.some(([o, d]) => !ids.has(o) || !ids.has(d))) throw new ErroNaoEncontrado('Etapa não encontrada.');
    const unicos = [...new Map(pares.map(([o, d]) => [`${o}>${d}`, [o, d] as const])).values()];
    const novas: TransicaoConfig[] = [...f.transicoes.filter((t) => t.fazendaId !== fazendaId), ...unicos.map(([o, d]) => ({ origem: o, destino: d, fazendaId }))];
    const graves = validarFluxo(f.etapas, novas).filter((x) => /não transfere|não recebe|recebe em medidas|para ela mesma/.test(x.mensagem));
    if (graves.length) problemas(graves);
    const antes = f.transicoes.filter((t) => t.fazendaId === fazendaId).map((t) => [t.origem, t.destino]);
    await tx.fluxoTransicao.deleteMany({ where: { fazendaId } });
    if (unicos.length) await tx.fluxoTransicao.createMany({ data: unicos.map(([o, d]) => ({ empresaId: ctx.empresaId, etapaOrigemId: o, etapaDestinoId: d, fazendaId, criadoPor: ctx.usuarioId })) });
    await auditar(tx, ctx, { entidade: 'fluxo_transicao', entidadeId: fazendaId ?? 'empresa', acao: 'ALTERAR', antes, depois: unicos });
    return lerFluxo(tx);
  });
}

// ------------------------------------------------------------------ modelos prontos (§5.3)

type Gravador = Pick<Tx, 'etapa' | 'tipoCafe' | 'etapaTipoResultado' | 'fluxoTransicao'>;

/** Copia um modelo para a empresa. Usado na criação da empresa e quando o fluxo ainda está vazio. */
export async function copiarModelo(db: Gravador, empresaId: string, modelo: ModeloFluxo, usuarioId: string | null) {
  const tipos = await db.tipoCafe.findMany({ where: { empresaId } });
  const porCodigo = new Map(tipos.map((t) => [t.codigo, t.id]));
  const idEtapa = new Map<string, string>();
  for (const [i, e] of modelo.etapas.entries()) {
    const criada = await db.etapa.create({
      data: {
        empresaId, codigo: e.codigo, nome: e.nome, classe: e.classe, prefixoLote: e.prefixoLote, unidadeEntrada: e.unidadeEntrada, unidadeSaida: e.unidadeSaida,
        modeloResultado: e.modeloResultado, monitoraSecagem: e.monitoraSecagem ?? false, umidadeMetaMin: e.umidadeMetaMin ?? null, umidadeMetaMax: e.umidadeMetaMax ?? null,
        exigeLocal: e.exigeLocal ?? false, ordem: (i + 1) * 10, criadoPor: usuarioId,
      },
    });
    idEtapa.set(e.codigo, criada.id);
    const tr = (e.tiposResultado ?? []).map((c) => porCodigo.get(c)).filter((x): x is string => !!x);
    if (tr.length) await db.etapaTipoResultado.createMany({ data: tr.map((t, k) => ({ empresaId, etapaId: criada.id, tipoCafeId: t, ordem: k })) });
  }
  await db.fluxoTransicao.createMany({ data: modelo.transicoes.map(([o, d]) => ({ empresaId, etapaOrigemId: idEtapa.get(o)!, etapaDestinoId: idEtapa.get(d)!, criadoPor: usuarioId })) });
}

/** Aplica um modelo quando a empresa ainda não tem nenhuma etapa. */
export async function aplicarModelo(ctx: Contexto, codigoModelo: string) {
  exigir(ctx, 'fluxo.configurar');
  const modelo = modeloFluxo(codigoModelo);
  if (!modelo) throw new ErroValidacao('Modelo de fluxo desconhecido.');
  return comTransacao(ctx, async (tx) => {
    if (await tx.etapa.count()) throw new ErroValidacao('A empresa já tem etapas. Edite o fluxo atual em vez de aplicar um modelo.');
    await copiarModelo(tx, ctx.empresaId, modelo, ctx.usuarioId);
    await auditar(tx, ctx, { entidade: 'fluxo', entidadeId: ctx.empresaId, acao: 'APLICAR_MODELO', depois: { modelo: modelo.codigo } });
    return lerFluxo(tx);
  });
}

export const classeAceita = (classe: EtapaConfig['classe']) => REGRAS_CLASSE[classe];
