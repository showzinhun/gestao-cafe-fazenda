import Decimal from 'decimal.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { certificadosDaFazenda, certificadosHerdados, comporTalhoes, conferirCertificadosEscolhidos, equivalentes, saldoLivre, type Composicao } from '@/dominio/lote';
import { calcularResultado, type ParametrosResultado } from '@/dominio/resultados';
import { divergenciaCarga } from '@/dominio/colheita';
import { qtd } from '@/dominio/quantidade';
import { auditar } from './auditoria';
import { emitirAlerta } from './alertas';
import { validarLoteParaContrato } from './regras-contrato';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import {
  certificadosAtivos, certificadosDeFazendas, codigoLivre, composicoes, dataLocal, dec, destinosDoLote, exigirFazendas, exigirMotivo, exigirTransicao,
  baixarLocal, exigirUnidade, fazendasPermitidas, somarLocal, zerarLocais, gravarLote, mapasFazenda, normalizarDecimal, proximoNumero, quantidadeSchema, transicoesDe, travarLotes, travarMovimento,
} from './rastreio-base';

/**
 * Movimentos genéricos por classe de etapa (§5.1, Fase 2). O código não conhece nomes de etapas:
 * só a classe e a configuração da empresa (regra 6). Tudo que mexe em quantidade roda numa
 * transação, com FOR UPDATE nos lotes (RN-01, regra 3), e grava auditoria (RN-15).
 */

const id = z.string().uuid();
const idOpcional = id.optional().nullable();
const texto = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export interface Alerta {
  codigo: string;
  mensagem: string;
}

// ================================================================ carga de colheita (§6.2)

const cargaSchema = z.object({
  etapaId: idOpcional,
  fazendaId: id,
  talhaoId: id,
  safraId: id,
  tipoCafeId: id,
  quantidade: quantidadeSchema,
  data: z.coerce.date().optional(),
  modoColheita: z.enum(['MANUAL', 'SEMIMECANIZADA', 'MECANICA']).default('MANUAL'),
  localId: idOpcional,
  turnoId: idOpcional,
  observacao: texto(),
  /** Apontamentos do dia e talhão que compõem a carga (§6.2). Colheita mecânica não tem. */
  apontamentoIds: z.array(id).default([]),
  tipoTransporte: texto(60),
  operadorMaquina: texto(120),
});

/** Cada carga gera um movimento COLHEITA já processado com 1 lote, 100% do talhão (§6.2, RN-09). */
export async function registrarCarga(ctx: Contexto, entrada: z.input<typeof cargaSchema>) {
  exigir(ctx, 'movimento.lancar');
  const d = cargaSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const etapa = d.etapaId
      ? await tx.etapa.findFirst({ where: { id: d.etapaId, ativa: true } })
      : await umaEtapaDaClasse(tx, 'COLHEITA');
    if (!etapa) throw new ErroNaoEncontrado('Etapa não encontrada.');
    if (etapa.classe !== 'COLHEITA') throw new ErroValidacao('Carga de colheita só entra numa etapa da classe Colheita.');
    exigirFazendas(await fazendasPermitidas(tx, ctx), [d.fazendaId]);
    const talhao = await tx.talhao.findFirst({ where: { id: d.talhaoId, ativo: true }, include: { fazenda: true } });
    if (!talhao) throw new ErroNaoEncontrado('Talhão não encontrado.');
    if (talhao.fazendaId !== d.fazendaId) throw new ErroValidacao('O talhão não é da fazenda informada.', 'talhaoId');
    const safra = await tx.safra.findFirst({ where: { id: d.safraId } });
    if (!safra) throw new ErroNaoEncontrado('Safra não encontrada.');
    const tipo = await tx.tipoCafe.findFirst({ where: { id: d.tipoCafeId, ativo: true } });
    if (!tipo) throw new ErroNaoEncontrado('Tipo de café não encontrado.');
    await conferirLocal(tx, etapa, d.localId ?? null);

    const quando = d.data ?? new Date();
    const q = d.quantidade;
    const numero = await proximoNumero(tx, ctx.empresaId, `movimento:${etapa.id}`);
    const mov = await tx.movimento.create({
      data: {
        empresaId: ctx.empresaId, etapaId: etapa.id, numero, fazendaId: d.fazendaId, safraId: safra.id, localId: d.localId ?? null, turnoId: d.turnoId ?? null,
        talhaoId: talhao.id, modoColheita: d.modoColheita, dataEntrada: quando, dataResultado: quando, status: 'PROCESSADO', observacao: d.observacao,
        unidade: etapa.unidadeSaida, qtdEntrada: q, qtdSaida: q, qtdPerda: '0', percQuebra: '0', criadoPor: ctx.usuarioId,
      },
    });
    const codigo = await codigoLivre(tx, { prefixo: etapa.prefixoLote, fazenda: talhao.fazenda.codigo, safra: safra.codigo, numero, tipo: tipo.codigo });
    const lote = await tx.lote.create({
      data: {
        empresaId: ctx.empresaId, codigo, movimentoId: mov.id, etapaId: etapa.id, fazendaId: d.fazendaId, safraId: safra.id, tipoCafeId: tipo.id,
        unidade: etapa.unidadeSaida, quantidade: q, origemTipo: 'COLHEITA', data: quando, criadoPor: ctx.usuarioId,
      },
    });
    await tx.loteTalhao.create({ data: { empresaId: ctx.empresaId, loteId: lote.id, talhaoId: talhao.id, percentual: '1', quantidadeEquivalente: q } });
    const certs = certificadosDaFazenda(d.fazendaId, await certificadosDeFazendas(tx, [d.fazendaId]), dataLocal(quando));
    if (certs.size) await tx.loteCertificado.createMany({ data: [...certs].map((c) => ({ empresaId: ctx.empresaId, loteId: lote.id, certificadoId: c })) });

    // Carga (§6.2): ligada aos apontamentos do dia e talhão, com a divergência medido − apontado.
    const dia = dataLocal(quando);
    const ids = [...new Set(d.apontamentoIds)];
    const apontamentos = ids.length ? await tx.apontamento.findMany({ where: { id: { in: ids } }, include: { cargas: { include: { carga: { include: { movimento: { select: { status: true } } } } } } } }) : [];
    if (apontamentos.length !== ids.length) throw new ErroNaoEncontrado('Apontamento não encontrado.');
    for (const a of apontamentos) {
      if (a.status === 'CANCELADO') throw new ErroValidacao('Há apontamento cancelado na carga.');
      if (a.talhaoId !== talhao.id || a.data.toISOString().slice(0, 10) !== dia)
        throw new ErroValidacao('Os apontamentos da carga precisam ser do mesmo talhão e do mesmo dia.');
      if (a.cargas.some((c) => c.carga.movimento.status !== 'ESTORNADO')) throw new ErroValidacao('Um dos apontamentos já está em outra carga.');
    }
    const apontadas = apontamentos.reduce((s, a) => s.plus(dec(a.medidas)), new Decimal(0));
    const empresa = await tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { configuracoes: true } });
    const limite = String((empresa?.configuracoes as Record<string, unknown> | null)?.limite_divergencia_carga ?? '0.05');
    const div = divergenciaCarga(q, apontadas, limite);
    const carga = await tx.cargaColheita.create({
      data: {
        empresaId: ctx.empresaId, data: new Date(`${dia}T00:00:00Z`), fazendaId: d.fazendaId, talhaoId: talhao.id, safraId: safra.id, tipoCafeId: tipo.id,
        tipoColheita: d.modoColheita, tipoTransporte: d.tipoTransporte, operadorMaquina: d.operadorMaquina, medidasMedidas: q, medidasApontadas: apontadas.toFixed(3),
        divergencia: div.diferenca.toFixed(3), divergenciaPerc: div.perc?.toFixed(6) ?? null, alertaDivergencia: div.alerta, movimentoId: mov.id, criadoPor: ctx.usuarioId,
      },
    });
    if (ids.length) await tx.cargaApontamento.createMany({ data: ids.map((apontamentoId) => ({ empresaId: ctx.empresaId, cargaId: carga.id, apontamentoId })) });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'CARGA', depois: { etapa: etapa.codigo, numero, talhao: talhao.codigo, quantidade: q, lote: codigo, apontadas: apontadas.toFixed(3), divergencia: div.diferenca.toFixed(3) } });
    const alertas: Alerta[] = div.alerta ? [{ codigo: 'DIVERGENCIA', mensagem: `Divergência de ${div.diferenca.toFixed(3)} medidas (${div.perc!.times(100).toFixed(1)}%) entre o medido e o apontado.` }] : [];
    if (div.alerta) await emitirAlerta(tx, ctx.empresaId, { tipo: 'DIVERGENCIA_CARGA', chave: `DIVERGENCIA_CARGA:${carga.id}`, entidade: 'movimento', entidadeId: mov.id, mensagem: `Carga ${talhao.codigo} nº ${numero}: ${alertas[0]!.mensagem}` });
    return { movimento: mov, lote, carga, alertas };
  });
}

async function umaEtapaDaClasse(tx: Tx, classe: 'COLHEITA') {
  const es = await tx.etapa.findMany({ where: { classe, ativa: true } });
  if (es.length > 1) throw new ErroValidacao('A empresa tem mais de uma etapa de colheita: informe qual.', 'etapaId');
  return es[0] ?? null;
}

async function conferirLocal(tx: Tx, etapa: { id: string; nome: string; exigeLocal: boolean }, localId: string | null) {
  if (!localId) {
    if (etapa.exigeLocal) throw new ErroValidacao(`${etapa.nome} exige informar o local.`, 'localId');
    return null;
  }
  const local = await tx.local.findFirst({ where: { id: localId, ativo: true } });
  if (!local) throw new ErroNaoEncontrado('Local não encontrado.');
  if (local.etapaId !== etapa.id) throw new ErroValidacao(`O local ${local.codigo} não é de ${etapa.nome}.`, 'localId');
  return local;
}

// ================================================================ abrir movimento e entradas

const entradaLoteSchema = z.object({ loteId: id, quantidade: quantidadeSchema, reservaId: idOpcional, localId: idOpcional });
const abrirSchema = z.object({
  etapaId: id,
  localId: idOpcional,
  turnoId: idOpcional,
  dataEntrada: z.coerce.date().optional(),
  servicoTipo: z.enum(['BLEND', 'CATACAO', 'REBENEFICIO', 'REAPROVEITAMENTO']).optional().nullable(),
  contratoId: idOpcional,
  conferente: texto(120),
  operador: texto(120),
  observacao: texto(),
  entradas: z.array(entradaLoteSchema).min(1, 'Informe pelo menos um lote de entrada.'),
});

type Etapa = Prisma.EtapaGetPayload<object>;
type Mov = Prisma.MovimentoGetPayload<object>;

/** Abre um movimento numa etapa, já com as entradas (lotes de etapas anteriores). */
export async function abrirMovimento(ctx: Contexto, entrada: z.input<typeof abrirSchema>) {
  exigir(ctx, 'movimento.lancar');
  const d = abrirSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const etapa = await tx.etapa.findFirst({ where: { id: d.etapaId, ativa: true } });
    if (!etapa) throw new ErroNaoEncontrado('Etapa não encontrada.');
    if (etapa.classe === 'COLHEITA') throw new ErroValidacao('A colheita recebe café pelas cargas, não por movimento com entradas.');
    if (d.servicoTipo && etapa.classe !== 'SERVICO') throw new ErroValidacao('Tipo de serviço só vale para etapas da classe Serviço.', 'servicoTipo');
    if (d.contratoId && etapa.classe !== 'SAIDA') throw new ErroValidacao('Contrato só vale para etapas da classe Saída.', 'contratoId');
    await conferirLocal(tx, etapa, d.localId ?? null);

    const loteIds = d.entradas.map((e) => e.loteId);
    await travarLotes(tx, loteIds);
    const primeiro = await tx.lote.findFirst({ where: { id: loteIds[0] } });
    if (!primeiro) throw new ErroNaoEncontrado('Lote não encontrado.');

    const numero = await proximoNumero(tx, ctx.empresaId, `movimento:${etapa.id}`);
    const mov = await tx.movimento.create({
      data: {
        empresaId: ctx.empresaId, etapaId: etapa.id, numero, safraId: primeiro.safraId, localId: d.localId ?? null, turnoId: d.turnoId ?? null,
        dataEntrada: d.dataEntrada ?? new Date(), servicoTipo: d.servicoTipo ?? null, contratoId: d.contratoId ?? null, conferente: d.conferente,
        operador: d.operador, observacao: d.observacao, unidade: primeiro.unidade, criadoPor: ctx.usuarioId,
      },
    });
    const r = await aplicarEntradas(tx, ctx, mov, etapa, d.entradas);
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'CRIAR', depois: { etapa: etapa.codigo, numero, entradas: d.entradas } });
    return { movimento: r.movimento, alertas: r.alertas, ocupacao: r.ocupacao };
  });
}

/** Acrescenta lotes a um movimento aberto. Lote que já está no movimento soma a quantidade. */
export async function adicionarEntradas(ctx: Contexto, movimentoId: string, entradas: z.input<typeof entradaLoteSchema>[]) {
  exigir(ctx, 'movimento.lancar');
  const lista = z.array(entradaLoteSchema).min(1).parse(entradas);
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Só se acrescentam entradas a um movimento aberto.');
    const r = await aplicarEntradas(tx, ctx, mov, mov.etapa, lista);
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'ENTRADA', depois: lista });
    return r;
  });
}

/** Tira um lote de um movimento aberto: a quantidade volta ao lote (a reserva usada fica liberada, RN-26). */
export async function removerEntrada(ctx: Contexto, movimentoId: string, loteId: string) {
  exigir(ctx, 'movimento.lancar');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Só se retiram entradas de um movimento aberto.');
    const e = await tx.movimentoEntrada.findFirst({ where: { movimentoId, loteId, cancelada: false } });
    if (!e) throw new ErroNaoEncontrado('Entrada não encontrada.');
    await travarLotes(tx, [loteId]);
    const lote = await tx.lote.findFirstOrThrow({ where: { id: loteId } });
    exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoLote(tx, [lote]));
    await gravarLote(tx, ctx, lote, { utilizada: dec(lote.quantidadeUtilizada).minus(dec(e.quantidade)) });
    if (e.localOrigemId) await somarLocal(tx, ctx.empresaId, loteId, e.localOrigemId, dec(e.quantidade));
    await tx.movimentoEntrada.update({ where: { id: e.id }, data: { cancelada: true, alteradoPor: ctx.usuarioId } });
    const atualizado = await recalcularMovimento(tx, ctx, mov.id);
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'RETIRAR_ENTRADA', antes: { lote: lote.codigo, quantidade: e.quantidade } });
    return atualizado;
  });
}

/** Fazendas de um lote: a dele, ou as da composição quando é MIX. */
async function fazendasDoLote(tx: Tx, lotes: { id: string; fazendaId: string | null }[]): Promise<string[]> {
  const mix = lotes.filter((l) => !l.fazendaId).map((l) => l.id);
  const r = lotes.flatMap((l) => (l.fazendaId ? [l.fazendaId] : []));
  if (mix.length) {
    const talhoes = await tx.loteTalhao.findMany({ where: { loteId: { in: mix } }, select: { talhaoId: true } });
    r.push(...(await mapasFazenda(tx, talhoes.map((t) => t.talhaoId))).doTalhao.values());
  }
  return [...new Set(r)];
}

/**
 * Valida e grava as entradas (RN-01, RN-04, RN-07, RN-11, RN-13, RN-16) e confere a capacidade do local (RN-24).
 * Chamada dentro da transação, com o movimento já travado ou recém-criado.
 */
export async function aplicarEntradas(tx: Tx, ctx: Contexto, mov: Mov, etapa: Etapa, novas: z.output<typeof entradaLoteSchema>[]) {
  if (new Set(novas.map((e) => e.loteId)).size !== novas.length) throw new ErroValidacao('O mesmo lote aparece duas vezes nas entradas.');
  await travarLotes(tx, novas.map((e) => e.loteId));
  const lotes = await tx.lote.findMany({ where: { id: { in: novas.map((e) => e.loteId) } }, include: { etapa: true } });
  if (lotes.length !== new Set(novas.map((e) => e.loteId)).size) throw new ErroNaoEncontrado('Lote não encontrado.');
  const porId = new Map(lotes.map((l) => [l.id, l]));
  const geradores = await tx.movimento.findMany({ where: { id: { in: lotes.map((l) => l.movimentoId) } }, select: { id: true, status: true } });
  const statusGerador = new Map(geradores.map((g) => [g.id, g.status]));

  exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoLote(tx, lotes));
  const transicoes = await transicoesDe(tx, lotes.map((l) => l.etapaId));
  const ativas = await tx.movimentoEntrada.findMany({ where: { movimentoId: mov.id, cancelada: false }, include: { lote: { select: { safraId: true, unidade: true } } } });
  const blend = etapa.classe === 'SERVICO' && mov.servicoTipo === 'BLEND';
  const unidade = ativas[0]?.lote.unidade ?? mov.unidade;
  // Sem entradas ainda (ex.: embarque criado a partir do contrato), vale a safra do primeiro lote.
  const safraBase = ativas[0]?.lote.safraId ?? porId.get(novas[0]!.loteId)!.safraId;

  for (const n of novas) {
    const l = porId.get(n.loteId)!;
    if (l.status === 'ESTORNADO' || statusGerador.get(l.movimentoId) === 'ESTORNADO') throw new ErroRegra('RN-05', `O lote ${l.codigo} foi estornado.`);
    if (l.etapaId === etapa.id) throw new ErroRegra('RN-16', `O lote ${l.codigo} já é de ${etapa.nome}.`);
    exigirTransicao(transicoes, l.etapa, etapa, l.fazendaId);
    exigirUnidade(l, etapa);
    if (l.unidade !== unidade) throw new ErroRegra('RN-11', 'Não se misturam lotes em medidas e em kg no mesmo movimento.');
    if (etapa.classe === 'SAIDA' && mov.contratoId) await validarLoteParaContrato(tx, mov.contratoId, l.id);
    if (!blend && l.safraId !== safraBase) throw new ErroRegra('RN-13', `O lote ${l.codigo} é de outra safra. Só um serviço do tipo Blend mistura safras.`);

    const q = new Decimal(n.quantidade);
    const reserva = await reservaParaEntrada(tx, n.reservaId ?? null, l.id, mov, etapa);
    const daReserva = reserva ? Decimal.min(q, dec(reserva.quantidade)) : new Decimal(0);
    const livre = saldoLivre({ quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada), quantidadeReservada: dec(l.quantidadeReservada) });
    if (q.gt(livre.plus(daReserva)))
      throw new ErroRegra(dec(l.quantidadeReservada).gt(0) ? 'RN-07' : 'RN-01', `O lote ${l.codigo} tem ${livre.plus(daReserva).toFixed(3)} disponível${dec(l.quantidadeReservada).gt(0) ? ' (o resto está reservado)' : ''}; pedido ${q.toFixed(3)}.`);

    if (reserva) {
      const resta = qtd(dec(reserva.quantidade).minus(daReserva));
      await tx.reserva.update({
        where: { id: reserva.id },
        data: resta.gt(0) ? { quantidade: resta.toFixed(3), alteradoPor: ctx.usuarioId } : { status: 'CONSUMIDA', consumidaEm: new Date(), alteradoPor: ctx.usuarioId },
      });
    }
    await gravarLote(tx, ctx, l, { utilizada: dec(l.quantidadeUtilizada).plus(q), reservada: dec(l.quantidadeReservada).minus(daReserva) });

    const existente = await tx.movimentoEntrada.findUnique({ where: { movimentoId_loteId: { movimentoId: mov.id, loteId: l.id } } });
    // Estoque: a entrada sai de um local (RN-25).
    let localOrigemId: string | null = null;
    if (l.etapa.classe === 'ESTOQUE') {
      const anterior = existente && !existente.cancelada ? existente.localOrigemId : null;
      if (anterior && n.localId && n.localId !== anterior) throw new ErroValidacao(`O lote ${l.codigo} já entrou neste movimento por outro local.`);
      localOrigemId = await baixarLocal(tx, l, n.localId ?? anterior, q);
    }
    const origemReserva = reserva?.finalidade ?? 'NENHUMA';
    if (existente)
      await tx.movimentoEntrada.update({
        where: { id: existente.id },
        data: {
          quantidade: (existente.cancelada ? q : dec(existente.quantidade).plus(q)).toFixed(3), cancelada: false, localOrigemId, alteradoPor: ctx.usuarioId,
          ...(reserva ? { reservaId: reserva.id, origemReserva } : {}),
        },
      });
    else
      await tx.movimentoEntrada.create({
        data: { empresaId: ctx.empresaId, movimentoId: mov.id, loteId: l.id, quantidade: q.toFixed(3), unidade: l.unidade, origemReserva, reservaId: reserva?.id ?? null, localOrigemId, criadoPor: ctx.usuarioId },
      });
  }

  const movimento = await recalcularMovimento(tx, ctx, mov.id);
  const { alertas, ocupacao } = await conferirCapacidade(tx, ctx, movimento);
  return { movimento, alertas, ocupacao };
}

/** A reserva que a entrada consome: a informada, ou a do contrato/movimento quando houver (RN-07, RN-26). */
async function reservaParaEntrada(tx: Tx, reservaId: string | null, loteId: string, mov: Mov, etapa: Etapa) {
  const reserva = reservaId
    ? await tx.reserva.findFirst({ where: { id: reservaId } })
    : await tx.reserva.findFirst({
        where: { loteId, status: 'ATIVA', OR: [{ movimentoId: mov.id }, ...(mov.contratoId ? [{ finalidade: 'CONTRATO' as const, contratoId: mov.contratoId }] : [])] },
        orderBy: { criadoEm: 'asc' },
      });
  if (!reserva) {
    if (reservaId) throw new ErroNaoEncontrado('Reserva não encontrada.');
    return null;
  }
  if (reserva.loteId !== loteId || reserva.status !== 'ATIVA') throw new ErroRegra('RN-07', 'A reserva não está ativa para este lote.');
  if (reserva.finalidade === 'CONTRATO' && (etapa.classe !== 'SAIDA' || reserva.contratoId !== mov.contratoId))
    throw new ErroRegra('RN-07', 'A reserva de contrato só é usada pelo embarque do mesmo contrato.');
  if (reserva.movimentoId && reserva.movimentoId !== mov.id) throw new ErroRegra('RN-07', 'Esses kg estão reservados para outro movimento.');
  return reserva;
}

/** Totais, fazenda (ou MIX) e safra do movimento a partir das entradas ativas (RN-13). */
async function recalcularMovimento(tx: Tx, ctx: Contexto, movimentoId: string) {
  const es = await tx.movimentoEntrada.findMany({ where: { movimentoId, cancelada: false }, include: { lote: { select: { id: true, fazendaId: true, safraId: true, unidade: true } } } });
  const total = es.reduce((s, e) => s.plus(dec(e.quantidade)), new Decimal(0));
  const fazendas = await fazendasDoLote(tx, es.map((e) => e.lote));
  const porSafra = new Map<string, Decimal>();
  for (const e of es) porSafra.set(e.lote.safraId, (porSafra.get(e.lote.safraId) ?? new Decimal(0)).plus(dec(e.quantidade)));
  const safras = [...porSafra.entries()].sort((a, b) => b[1].comparedTo(a[1]));
  return tx.movimento.update({
    where: { id: movimentoId },
    data: {
      qtdEntrada: qtd(total).toFixed(3),
      fazendaId: fazendas.length === 1 && es.every((e) => e.lote.fazendaId) ? fazendas[0]! : null,
      ...(safras.length ? { safraId: safras[0]![0] } : {}),
      ...(es.length ? { unidade: es[0]!.lote.unidade } : {}),
      misturaSafras: safras.length > 1 ? safras.map(([safraId, q]) => ({ safraId, quantidade: q.toFixed(3) })) : Prisma.DbNull,
      alteradoPor: ctx.usuarioId,
    },
  });
}

// ================================================================ capacidade do local (RN-24)

/** Ocupação = entradas dos movimentos abertos + saldo dos lotes gerados ali; no estoque, o saldo por local (RN-25). */
export async function ocupacaoDoLocal(tx: Tx, localId: string): Promise<Decimal> {
  const abertas = await tx.movimentoEntrada.aggregate({ _sum: { quantidade: true }, where: { cancelada: false, movimento: { localId, status: 'ABERTO' } } });
  const lotes = await tx.lote.findMany({
    where: { status: { not: 'ESTORNADO' }, etapa: { classe: { not: 'ESTOQUE' } }, movimento: { localId, status: { in: ['PROCESSADO', 'FINALIZADO'] } } },
    select: { quantidade: true, quantidadeUtilizada: true },
  });
  const noEstoque = await tx.loteLocal.aggregate({ _sum: { quantidade: true }, where: { localId } });
  return lotes.reduce((s, l) => s.plus(dec(l.quantidade)).minus(dec(l.quantidadeUtilizada)), dec(abertas._sum.quantidade).plus(dec(noEstoque._sum.quantidade)));
}

async function conferirCapacidade(tx: Tx, ctx: Contexto, mov: Mov): Promise<{ alertas: Alerta[]; ocupacao: { localId: string; percentual: string } | null }> {
  if (!mov.localId) return { alertas: [], ocupacao: null };
  const local = await tx.local.findFirstOrThrow({ where: { id: mov.localId } });
  if (!local.capacidade || !local.unidadeCapacidade) return { alertas: [], ocupacao: null };
  let ocupado = await ocupacaoDoLocal(tx, local.id);
  const u = local.unidadeCapacidade;
  if (u === 'M2' || (u === 'MEDIDA' && mov.unidade !== 'MEDIDA') || ((u === 'KG' || u === 'SACA') && mov.unidade !== 'KG')) return { alertas: [], ocupacao: null };
  if (u === 'SACA') ocupado = ocupado.div(60);
  const pct = ocupado.div(dec(local.capacidade)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const ocupacao = { localId: local.id, percentual: pct.toFixed(4) };
  if (pct.lte(1)) return { alertas: [], ocupacao };
  const mensagem = `O local ${local.codigo} fica com ${pct.times(100).toFixed(1)}% da capacidade (${ocupado.toFixed(3)} de ${dec(local.capacidade).toFixed(3)}).`;
  const empresa = await tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { configuracoes: true } });
  if ((empresa?.configuracoes as Record<string, unknown> | null)?.bloquear_capacidade === true) throw new ErroRegra('RN-24', `${mensagem} A empresa bloqueia entradas acima da capacidade.`);
  await emitirAlerta(tx, ctx.empresaId, { tipo: 'CAPACIDADE', chave: `CAPACIDADE:${mov.id}`, entidade: 'movimento', entidadeId: mov.id, mensagem, severidade: 'AVISO' });
  return { alertas: [{ codigo: 'RN-24', mensagem }], ocupacao };
}

// ================================================================ resultados

const decimalTexto = z.union([z.string(), z.number()]).transform(normalizarDecimal);
const resultadoSchema = z.object({
  parametros: z.discriminatedUnion('modelo', [
    z.object({ modelo: z.literal('PERCENTUAL_POR_TIPO'), resultados: z.array(z.object({ tipoCafeId: id, percentual: decimalTexto })).min(1) }),
    z.object({ modelo: z.literal('CAFE_E_PERDA'), fator: decimalTexto.optional(), fatores: z.array(z.object({ tipoCafeId: id.nullable(), fator: decimalTexto })).optional() }),
    z.object({ modelo: z.literal('CONVERSAO_ESTOQUE'), lotes: z.array(z.object({ quantidade: decimalTexto, tipoCafeId: idOpcional, peneiraId: idOpcional, localId: idOpcional })).min(1) }),
    z.object({ modelo: z.literal('POR_PENEIRA'), lotes: z.array(z.object({ quantidade: decimalTexto, peneiraId: id, tipoCafeId: idOpcional })).min(1) }),
  ]),
  umidadeFinal: decimalTexto.refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v), 'Umidade entre 0 e 99,99%.').optional().nullable(),
  certificadoIds: z.array(id).optional(),
  dataSaidaLocal: z.coerce.date().optional(),
});

/** Lança os resultados conforme o modelo da etapa e gera os lotes (PROCESSADO). */
export async function lancarResultados(ctx: Contexto, movimentoId: string, entrada: z.input<typeof resultadoSchema>) {
  exigir(ctx, 'movimento.lancar');
  const d = resultadoSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    const etapa = mov.etapa;
    if (mov.status === 'PROCESSADO') throw new ErroValidacao('O movimento já tem resultados. Apague os resultados para lançar de novo.');
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Só se lançam resultados num movimento aberto.');
    if (etapa.classe === 'SAIDA') throw new ErroValidacao('A saída não gera lotes: finalize o movimento.');
    if (d.certificadoIds && etapa.classe !== 'ESTOQUE') throw new ErroValidacao('Os certificados só são escolhidos na etapa de estoque (§10).');
    // Estoque: cada lote gerado fica num local da etapa (RN-25). Padrão: o local do movimento.
    const locaisDosLotes = d.parametros.modelo === 'CONVERSAO_ESTOQUE' ? d.parametros.lotes.map((l) => l.localId ?? mov.localId) : [];
    if (etapa.classe === 'ESTOQUE') {
      if (!locaisDosLotes.length || locaisDosLotes.some((x) => !x)) throw new ErroValidacao('Informe o local de cada lote do estoque.', 'localId');
      const validos = await tx.local.count({ where: { id: { in: locaisDosLotes as string[] }, etapaId: etapa.id, ativo: true } });
      if (validos !== new Set(locaisDosLotes).size) throw new ErroValidacao(`Local que não é de ${etapa.nome}.`, 'localId');
    }

    const es = await tx.movimentoEntrada.findMany({ where: { movimentoId, cancelada: false }, include: { lote: true } });
    if (!es.length) throw new ErroValidacao('O movimento não tem entradas.');
    await travarLotes(tx, es.map((e) => e.loteId));
    exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoLote(tx, es.map((e) => e.lote)));

    const tipos = (await tx.etapaTipoResultado.findMany({ where: { etapaId: etapa.id } })).map((t) => t.tipoCafeId);
    const calc = calcularResultado({
      modelo: etapa.modeloResultado, unidadeEntrada: mov.unidade, tiposPermitidos: tipos,
      entradas: es.map((e) => ({ id: e.id, quantidade: dec(e.quantidade), tipoCafeId: e.lote.tipoCafeId })),
      parametros: d.parametros as ParametrosResultado,
    });

    // Cadastros usados no resultado.
    const tipoIds = [...new Set(calc.saidas.map((s) => s.tipoCafeId).filter((x): x is string => !!x))];
    const peneiraIds = [...new Set(calc.saidas.map((s) => s.peneiraId).filter((x): x is string => !!x))];
    const tiposCafe = new Map((await tx.tipoCafe.findMany({ where: { id: { in: tipoIds } } })).map((t) => [t.id, t.codigo]));
    const peneiras = new Map((await tx.peneira.findMany({ where: { id: { in: peneiraIds } } })).map((p) => [p.id, p.codigo]));
    if (tiposCafe.size !== tipoIds.length) throw new ErroNaoEncontrado('Tipo de café não encontrado.');
    if (peneiras.size !== peneiraIds.length) throw new ErroNaoEncontrado('Peneira não encontrada.');

    const comp = await composicoes(tx, es.map((e) => e.loteId));
    const certsOrigem = await certificadosAtivos(tx, es.map((e) => e.loteId));
    const todosTalhoes = [...new Set([...comp.values()].flatMap((c) => [...c.keys()]))];
    const mapas = await mapasFazenda(tx, todosTalhoes);
    const certsFaz = await certificadosDeFazendas(tx, [...new Set(mapas.doTalhao.values())]);
    const safra = await tx.safra.findFirstOrThrow({ where: { id: mov.safraId } });
    const agora = new Date();
    const hoje = dataLocal(agora);
    const porEntrada = new Map(es.map((e) => [e.id, e]));
    const nomeCert = new Map((await tx.certificado.findMany()).map((c) => [c.id, c.codigo]));

    const gerados = [];
    for (const [i, s] of calc.saidas.entries()) {
      const fontes = s.fontes.map((f) => porEntrada.get(f)!);
      const composicao: Composicao = comporTalhoes(fontes.map((f) => ({ quantidade: dec(f.quantidade), composicao: comp.get(f.loteId)! })));
      const fazendas = [...new Set([...composicao.keys()].map((t) => mapas.doTalhao.get(t)!))];
      const permitidos = certificadosHerdados({ origens: fontes.map((f) => certsOrigem.get(f.loteId)!), fazendas, certificadosFazendas: certsFaz, data: hoje });
      let certs = [...permitidos];
      if (d.certificadoIds) {
        conferirCertificadosEscolhidos(permitidos, d.certificadoIds, (c) => nomeCert.get(c) ?? 'certificado desconhecido');
        certs = d.certificadoIds;
      }
      let tipoCafeId = s.tipoCafeId;
      if (!tipoCafeId && etapa.modeloResultado === 'CONVERSAO_ESTOQUE') {
        const ts = new Set(fontes.map((f) => f.lote.tipoCafeId));
        if (ts.size === 1 && [...ts][0]) tipoCafeId = [...ts][0]!;
      }
      const tipoCodigo = tipoCafeId ? (tiposCafe.get(tipoCafeId) ?? (await tx.tipoCafe.findFirstOrThrow({ where: { id: tipoCafeId } })).codigo) : null;
      const fazendaId = fazendas.length === 1 ? fazendas[0]! : null;
      const codigo = await codigoLivre(tx, {
        prefixo: etapa.prefixoLote, fazenda: fazendaId ? mapas.codigo.get(fazendaId)! : null, safra: safra.codigo, numero: mov.numero,
        tipo: tipoCodigo, peneira: s.peneiraId ? peneiras.get(s.peneiraId)! : null,
      });
      const lote = await tx.lote.create({
        data: {
          empresaId: ctx.empresaId, codigo, movimentoId: mov.id, etapaId: etapa.id, fazendaId, safraId: mov.safraId, tipoCafeId, peneiraId: s.peneiraId,
          unidade: etapa.unidadeSaida, quantidade: s.quantidade.toFixed(3), percentual: s.percentual?.toFixed(6) ?? null,
          umidade: d.umidadeFinal ?? null, origemTipo: 'PROCESSO', fontes: s.fontes, data: agora, criadoPor: ctx.usuarioId,
        },
      });
      await tx.loteTalhao.createMany({
        data: equivalentes(composicao, s.quantidade).map((x) => ({ empresaId: ctx.empresaId, loteId: lote.id, talhaoId: x.talhaoId, percentual: x.percentual.toFixed(10), quantidadeEquivalente: x.quantidade.toFixed(3) })),
      });
      if (certs.length) await tx.loteCertificado.createMany({ data: certs.map((c) => ({ empresaId: ctx.empresaId, loteId: lote.id, certificadoId: c })) });
      if (etapa.classe === 'ESTOQUE') await somarLocal(tx, ctx.empresaId, lote.id, locaisDosLotes[i]!, s.quantidade);
      gerados.push(lote);
    }

    const atualizado = await tx.movimento.update({
      where: { id: mov.id },
      data: {
        status: 'PROCESSADO', dataResultado: agora, dataSaidaLocal: d.dataSaidaLocal ?? null, qtdSaida: calc.saida.toFixed(3),
        qtdPerda: calc.perda?.toFixed(3) ?? null, percQuebra: calc.percQuebra?.toFixed(6) ?? null, rendimento: calc.rendimento?.toFixed(3) ?? null,
        umidadeFinal: d.umidadeFinal ?? null, alteradoPor: ctx.usuarioId,
      },
    });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'RESULTADO', depois: { parametros: d.parametros, lotes: gerados.map((l) => ({ codigo: l.codigo, quantidade: l.quantidade })) } });
    return { movimento: atualizado, lotes: gerados };
  });
}

// ================================================================ apagar resultados e estorno (RN-05, RN-06)

/** Confere que nenhum lote gerado foi usado ou reservado; senão aponta o movimento a estornar antes. */
async function exigirLotesSemUso(tx: Tx, movimentoId: string, codigo: 'RN-05' | 'RN-06') {
  const lotes = await tx.lote.findMany({ where: { movimentoId, status: { not: 'ESTORNADO' } } });
  await travarLotes(tx, lotes.map((l) => l.id));
  const frescos = await tx.lote.findMany({ where: { id: { in: lotes.map((l) => l.id) } } });
  const usados = frescos.filter((l) => dec(l.quantidadeUtilizada).gt(0));
  if (usados.length) {
    const onde = await destinosDoLote(tx, usados.map((l) => l.id));
    throw new ErroRegra(codigo, `O lote ${usados.map((l) => l.codigo).join(', ')} já foi usado em ${onde}. Estorne esse movimento antes.`);
  }
  const reservados = frescos.filter((l) => dec(l.quantidadeReservada).gt(0));
  if (reservados.length) throw new ErroRegra(codigo, `O lote ${reservados.map((l) => l.codigo).join(', ')} tem reserva ativa. Cancele a reserva antes.`);
  return frescos;
}

/** PROCESSADO → ABERTO: os lotes gerados ficam estornados e as entradas continuam (RN-06). */
export async function apagarResultados(ctx: Contexto, movimentoId: string, motivo: string) {
  exigir(ctx, 'movimento.estornar');
  const m = exigirMotivo(motivo);
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.natureza !== 'NORMAL') throw new ErroValidacao('Ajuste de inventário não se altera.');
    if (mov.etapa.classe === 'COLHEITA') throw new ErroValidacao('A carga de colheita não tem resultados a apagar: estorne a carga.');
    if (mov.status !== 'PROCESSADO') throw new ErroValidacao('Só se apagam resultados de um movimento processado.');
    const lotes = await exigirLotesSemUso(tx, mov.id, 'RN-06');
    for (const l of lotes) {
      await gravarLote(tx, ctx, l, { estornado: true });
      await zerarLocais(tx, l.id);
    }
    const atualizado = await tx.movimento.update({
      where: { id: mov.id },
      data: { status: 'ABERTO', dataResultado: null, qtdSaida: null, qtdPerda: null, percQuebra: null, rendimento: null, umidadeFinal: null, alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'APAGAR_RESULTADOS', antes: { lotes: lotes.map((l) => l.codigo) }, depois: { motivo: m } });
    return atualizado;
  });
}

/**
 * Estorno LIFO (RN-05): só sem uso nem reserva dos lotes gerados. Lotes gerados → ESTORNADO,
 * origens recebem a quantidade de volta, reservas feitas para o movimento são liberadas. Nada é apagado.
 */
export async function estornarMovimento(ctx: Contexto, movimentoId: string, motivo: string) {
  exigir(ctx, 'movimento.estornar');
  const m = exigirMotivo(motivo, 'o motivo do estorno');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status === 'ESTORNADO') throw new ErroValidacao('O movimento já está estornado.');
    if (mov.natureza !== 'NORMAL') throw new ErroValidacao('Ajuste de inventário não se estorna: faça um novo inventário.');
    if (mov.status === 'FINALIZADO') throw new ErroRegra('RN-14', 'Saída finalizada não se estorna. Só o administrador pode reabrir, com motivo.');
    const lotes = await exigirLotesSemUso(tx, mov.id, 'RN-05');
    const es = await tx.movimentoEntrada.findMany({ where: { movimentoId, cancelada: false }, include: { lote: true } });
    exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoLote(tx, [...es.map((e) => e.lote), ...lotes]));
    const reservas = await tx.reserva.findMany({ where: { movimentoId, status: 'ATIVA' } });
    await travarLotes(tx, [...es.map((e) => e.loteId), ...reservas.map((r) => r.loteId)]);

    for (const l of lotes) {
      await gravarLote(tx, ctx, l, { estornado: true });
      await zerarLocais(tx, l.id);
    }
    for (const e of es) {
      const origem = await tx.lote.findFirstOrThrow({ where: { id: e.loteId } });
      await gravarLote(tx, ctx, origem, { utilizada: dec(origem.quantidadeUtilizada).minus(dec(e.quantidade)) });
      if (e.localOrigemId) await somarLocal(tx, ctx.empresaId, e.loteId, e.localOrigemId, dec(e.quantidade));
    }
    for (const r of reservas) {
      const l = await tx.lote.findFirstOrThrow({ where: { id: r.loteId } });
      await gravarLote(tx, ctx, l, { reservada: dec(l.quantidadeReservada).minus(dec(r.quantidade)) });
      await tx.reserva.update({ where: { id: r.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: `Estorno do movimento: ${m}`, alteradoPor: ctx.usuarioId } });
    }
    const atualizado = await tx.movimento.update({
      where: { id: mov.id },
      data: { status: 'ESTORNADO', estornadoEm: new Date(), estornadoPor: ctx.usuarioId, motivoEstorno: m, alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'ESTORNAR', antes: { status: mov.status, lotes: lotes.map((l) => l.codigo) }, depois: { motivo: m } });
    return atualizado;
  });
}

// ================================================================ saída (classe SAIDA, RN-14)

/** Finaliza a saída: as entradas já baixaram o saldo; o movimento fica imutável (RN-14). */
export async function finalizarSaida(ctx: Contexto, movimentoId: string) {
  exigir(ctx, 'movimento.fechar');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.etapa.classe !== 'SAIDA') throw new ErroValidacao('Só movimentos de saída são finalizados.');
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Só se finaliza uma saída aberta.');
    if (dec(mov.qtdEntrada).lte(0)) throw new ErroValidacao('A saída não tem entradas.');
    const es = await tx.movimentoEntrada.findMany({ where: { movimentoId, cancelada: false }, include: { lote: true } });
    exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDoLote(tx, es.map((e) => e.lote)));
    const agora = new Date();
    const atualizado = await tx.movimento.update({
      where: { id: mov.id },
      data: { status: 'FINALIZADO', qtdSaida: mov.qtdEntrada, qtdPerda: '0', percQuebra: '0', dataResultado: agora, finalizadoEm: agora, finalizadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'FINALIZAR', depois: { quantidade: mov.qtdEntrada } });
    return atualizado;
  });
}

/** Só o administrador reabre uma saída finalizada, com motivo (RN-14). A DDS entra na Fase 7. */
export async function reabrirSaida(ctx: Contexto, movimentoId: string, motivo: string) {
  if (ctx.perfil !== 'ADMIN_EMPRESA') throw new ErroRegra('RN-14', 'Só o administrador da empresa reabre uma saída finalizada.');
  const m = exigirMotivo(motivo, 'o motivo da reabertura');
  return comTransacao(ctx, async (tx) => {
    const mov = await travarMovimento(tx, movimentoId);
    if (mov.status !== 'FINALIZADO') throw new ErroValidacao('A saída não está finalizada.');
    const det = await tx.embarqueDetalhe.findFirst({ where: { movimentoId } });
    if (det?.numeroDds) throw new ErroRegra('RN-14', `A DDS ${det.numeroDds} já foi informada: o embarque não pode ser reaberto.`);
    const atualizado = await tx.movimento.update({
      where: { id: mov.id },
      data: { status: 'ABERTO', qtdSaida: null, qtdPerda: null, percQuebra: null, dataResultado: null, finalizadoEm: null, finalizadoPor: null, alteradoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'REABRIR', antes: { status: 'FINALIZADO', finalizadoEm: mov.finalizadoEm }, depois: { motivo: m } });
    return atualizado;
  });
}

// ================================================================ consulta

export async function obterMovimento(ctx: Contexto, movimentoId: string) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Movimento não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const mov = await tx.movimento.findFirst({
      where: { id: movimentoId },
      include: {
        etapa: { select: { id: true, codigo: true, nome: true, classe: true, prefixoLote: true } },
        entradas: { where: { cancelada: false }, include: { lote: { select: { id: true, codigo: true, unidade: true } } } },
        lotes: { orderBy: { codigo: 'asc' } },
      },
    });
    if (!mov) throw new ErroNaoEncontrado('Movimento não encontrado.');
    return mov;
  });
}

/** DELETE /api/movimentos/{id}/entradas/{entradaId} (§14). */
export async function removerEntradaPorId(ctx: Contexto, movimentoId: string, entradaId: string) {
  if (!ehUuid(movimentoId) || !ehUuid(entradaId)) throw new ErroNaoEncontrado('Entrada não encontrada.');
  const e = await comTransacao(ctx, (tx) => tx.movimentoEntrada.findFirst({ where: { id: entradaId, movimentoId, cancelada: false }, select: { loteId: true } }));
  if (!e) throw new ErroNaoEncontrado('Entrada não encontrada.');
  return removerEntrada(ctx, movimentoId, e.loteId);
}
