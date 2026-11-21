import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { saldoDoLote, saldoLivre } from '@/dominio/lote';
import { comTransacao, ehUuid, type Contexto, type Tx } from './transacao';
import { dataLocal, dec } from './rastreio-base';

/**
 * Leituras para as telas da Fase 3 (§12 itens 6, 8, 10 e 12). Sem regra de negócio:
 * só montam o que as telas mostram, sempre dentro da empresa ativa (RLS).
 */

const txt = (v: { toString(): string } | null | undefined) => (v == null ? null : dec(v).toFixed(3));

// ================================================================ colheita (§12 item 6)

export async function listarCargas(ctx: Contexto, filtro: { data?: string } = {}) {
  return comTransacao(ctx, async (tx) => {
    const etapas = await tx.etapa.findMany({ where: { classe: 'COLHEITA' }, select: { id: true } });
    const inicio = filtro.data ? new Date(`${filtro.data}T00:00:00-03:00`) : undefined;
    const fim = inicio ? new Date(inicio.getTime() + 86_400_000) : undefined;
    const movs = await tx.movimento.findMany({
      where: { etapaId: { in: etapas.map((e) => e.id) }, ...(inicio ? { dataEntrada: { gte: inicio, lt: fim } } : {}) },
      include: {
        talhao: { select: { codigo: true, nome: true } },
        fazenda: { select: { codigo: true, nome: true } },
        lotes: { select: { id: true, codigo: true, quantidade: true, quantidadeUtilizada: true, status: true, tipoCafe: { select: { codigo: true } } } },
        carga: { select: { medidasApontadas: true, divergencia: true, divergenciaPerc: true, alertaDivergencia: true, tipoTransporte: true, operadorMaquina: true, _count: { select: { apontamentos: true } } } },
      },
      orderBy: [{ dataEntrada: 'desc' }, { numero: 'desc' }],
      take: 300,
    });
    return movs.map((m) => {
      const l = m.lotes[0];
      return {
        id: m.id, numero: m.numero, status: m.status, data: m.dataEntrada, modoColheita: m.modoColheita, quantidade: txt(m.qtdEntrada),
        fazenda: m.fazenda?.codigo ?? null, talhao: m.talhao ? `${m.talhao.codigo} · ${m.talhao.nome}` : null, observacao: m.observacao,
        carga: m.carga ? { apontadas: txt(m.carga.medidasApontadas), divergencia: txt(m.carga.divergencia), divergenciaPerc: m.carga.divergenciaPerc?.toString() ?? null, alerta: m.carga.alertaDivergencia, apontamentos: m.carga._count.apontamentos, transporte: m.carga.tipoTransporte, operador: m.carga.operadorMaquina } : null,
        lote: l ? { id: l.id, codigo: l.codigo, tipo: l.tipoCafe?.codigo ?? null, saldo: saldoDoLote({ quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada) }).toFixed(3), status: l.status } : null,
      };
    });
  });
}

// ================================================================ etapas e movimentos (§12 item 8)

/** Etapas operacionais com contagem de movimentos abertos e saldo parado. */
export async function resumoEtapas(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const etapas = await tx.etapa.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } });
    const abertos = await tx.movimento.groupBy({ by: ['etapaId'], where: { status: 'ABERTO' }, _count: true });
    const saldos = await tx.lote.groupBy({ by: ['etapaId', 'unidade'], where: { status: { in: ['ABERTO', 'PARCIAL'] } }, _sum: { quantidade: true, quantidadeUtilizada: true } });
    return etapas.map((e) => {
      const s = saldos.filter((x) => x.etapaId === e.id);
      return {
        id: e.id, codigo: e.codigo, nome: e.nome, classe: e.classe, prefixo: e.prefixoLote, unidade: e.unidadeSaida, monitoraSecagem: e.monitoraSecagem,
        abertos: abertos.find((a) => a.etapaId === e.id)?._count ?? 0,
        saldo: s.reduce((t, x) => t.plus(dec(x._sum.quantidade)).minus(dec(x._sum.quantidadeUtilizada)), new Decimal(0)).toFixed(3),
      };
    });
  });
}

export async function listarMovimentos(ctx: Contexto, etapaId: string, filtro: { status?: string; busca?: string } = {}) {
  if (!ehUuid(etapaId)) throw new ErroNaoEncontrado('Etapa não encontrada.');
  return comTransacao(ctx, async (tx) => {
    const etapa = await tx.etapa.findFirst({ where: { id: etapaId } });
    if (!etapa) throw new ErroNaoEncontrado('Etapa não encontrada.');
    const status = ['ABERTO', 'PROCESSADO', 'FINALIZADO', 'ESTORNADO'].includes(filtro.status ?? '') ? (filtro.status as Prisma.MovimentoWhereInput['status']) : undefined;
    const numero = filtro.busca && /^\d+$/.test(filtro.busca.trim()) ? Number(filtro.busca.trim()) : undefined;
    const movs = await tx.movimento.findMany({
      where: { etapaId, ...(status ? { status } : {}), ...(numero ? { numero } : {}) },
      include: {
        local: { select: { codigo: true } },
        fazenda: { select: { codigo: true } },
        lotes: { where: { status: { not: 'ESTORNADO' } }, select: { codigo: true } },
        _count: { select: { entradas: { where: { cancelada: false } } } },
      },
      orderBy: { numero: 'desc' },
      take: 300,
    });
    return {
      etapa: { id: etapa.id, nome: etapa.nome, classe: etapa.classe, prefixo: etapa.prefixoLote, unidadeEntrada: etapa.unidadeEntrada, unidadeSaida: etapa.unidadeSaida, exigeLocal: etapa.exigeLocal, modeloResultado: etapa.modeloResultado },
      movimentos: movs.map((m) => ({
        id: m.id, numero: m.numero, status: m.status, natureza: m.natureza, dataEntrada: m.dataEntrada, dataResultado: m.dataResultado, local: m.local?.codigo ?? null,
        fazenda: m.fazenda?.codigo ?? 'MIX', unidade: m.unidade, entrada: txt(m.qtdEntrada), saida: txt(m.qtdSaida), quebra: m.percQuebra?.toString() ?? null,
        rendimento: m.rendimento?.toString() ?? null, entradas: m._count.entradas, lotes: m.lotes.map((l) => l.codigo),
      })),
    };
  });
}

/** Composição por talhão de um conjunto de lotes, ponderada pela quantidade de cada um. */
async function composicaoDe(tx: Tx, partes: { loteId: string; quantidade: Decimal }[]) {
  const total = partes.reduce((s, p) => s.plus(p.quantidade), new Decimal(0));
  if (total.lte(0)) return [];
  const linhas = await tx.loteTalhao.findMany({ where: { loteId: { in: partes.map((p) => p.loteId) } }, include: { talhao: { select: { id: true, codigo: true, nome: true, fazenda: { select: { codigo: true, nome: true } } } } } });
  const porTalhao = new Map<string, { talhao: (typeof linhas)[number]['talhao']; pct: Decimal; quantidade: Decimal }>();
  for (const p of partes)
    for (const l of linhas.filter((x) => x.loteId === p.loteId)) {
      const atual = porTalhao.get(l.talhaoId) ?? { talhao: l.talhao, pct: new Decimal(0), quantidade: new Decimal(0) };
      atual.pct = atual.pct.plus(dec(l.percentual).times(p.quantidade).div(total));
      atual.quantidade = atual.quantidade.plus(dec(l.percentual).times(p.quantidade));
      porTalhao.set(l.talhaoId, atual);
    }
  return [...porTalhao.values()]
    .sort((a, b) => b.pct.comparedTo(a.pct))
    .map((x) => ({ talhaoId: x.talhao.id, talhao: x.talhao.codigo, nome: x.talhao.nome, fazenda: x.talhao.fazenda.codigo, percentual: x.pct.toFixed(4), quantidade: x.quantidade.toFixed(3) }));
}

export async function detalheMovimento(ctx: Contexto, movimentoId: string) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Movimento não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const m = await tx.movimento.findFirst({
      where: { id: movimentoId },
      include: {
        etapa: { include: { tiposResultado: { include: { tipoCafe: { select: { id: true, codigo: true, nome: true } } }, orderBy: { ordem: 'asc' } } } },
        local: { select: { id: true, codigo: true, nome: true, capacidade: true, unidadeCapacidade: true } },
        fazenda: { select: { codigo: true, nome: true } },
        safra: { select: { codigo: true } },
        talhao: { select: { codigo: true, nome: true } },
        entradas: {
          where: { cancelada: false },
          include: { lote: { select: { id: true, codigo: true, unidade: true, tipoCafeId: true, tipoCafe: { select: { codigo: true } }, etapa: { select: { nome: true } } } } },
          orderBy: { criadoEm: 'asc' },
        },
        lotes: {
          include: {
            tipoCafe: { select: { codigo: true, nome: true } }, peneira: { select: { codigo: true } },
            certificados: { where: { removidoEm: null }, include: { certificado: { select: { codigo: true } } } },
            locais: { where: { quantidade: { gt: 0 } }, include: { local: { select: { codigo: true } } } },
          },
          orderBy: { codigo: 'asc' },
        },
      },
    });
    if (!m) throw new ErroNaoEncontrado('Movimento não encontrado.');
    const locaisOrigem = new Map((await tx.local.findMany({ where: { id: { in: m.entradas.map((e) => e.localOrigemId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } })).map((l) => [l.id, l.codigo]));
    const ativos = m.lotes.filter((l) => l.status !== 'ESTORNADO');
    const composicao = ativos.length
      ? await composicaoDe(tx, ativos.map((l) => ({ loteId: l.id, quantidade: dec(l.quantidade) })))
      : await composicaoDe(tx, m.entradas.map((e) => ({ loteId: e.loteId, quantidade: dec(e.quantidade) })));
    const historico = await tx.auditoria.findMany({ where: { entidadeId: m.id }, orderBy: { data: 'asc' } });
    const nomes = new Map((await tx.usuarioEmpresa.findMany({ where: { usuarioId: { in: [...new Set(historico.map((h) => h.usuarioId).filter((x): x is string => !!x))] } }, include: { usuario: { select: { id: true, nome: true } } } })).map((v) => [v.usuario.id, v.usuario.nome]));
    const quem = (id: string | null) => (id ? (nomes.get(id) ?? 'usuário') : null);
    const evento = (acao: string) => historico.filter((h) => h.acao === acao).at(-1);
    const linhaDoTempo = [
      { etapa: m.etapa.classe === 'COLHEITA' ? 'Carga' : 'Entrada', feita: true, quando: m.dataEntrada, quem: quem(m.criadoPor) },
      ...(m.etapa.classe === 'SAIDA'
        ? [{ etapa: 'Finalizada', feita: m.status === 'FINALIZADO', quando: m.finalizadoEm, quem: quem(m.finalizadoPor) }]
        : [{ etapa: 'Resultado', feita: m.status === 'PROCESSADO' || m.status === 'FINALIZADO' || (m.status === 'ESTORNADO' && !!m.dataResultado), quando: m.dataResultado, quem: quem(evento('RESULTADO')?.usuarioId ?? (m.etapa.classe === 'COLHEITA' ? m.criadoPor : null)) }]),
      ...(m.status === 'ESTORNADO' ? [{ etapa: 'Estornado', feita: true, quando: m.estornadoEm, quem: quem(m.estornadoPor) }] : []),
    ];
    return {
      id: m.id, numero: m.numero, status: m.status, natureza: m.natureza, unidade: m.unidade, servicoTipo: m.servicoTipo, modoColheita: m.modoColheita,
      dataEntrada: m.dataEntrada, dataResultado: m.dataResultado, observacao: m.observacao, motivoEstorno: m.motivoEstorno,
      etapa: { id: m.etapa.id, nome: m.etapa.nome, classe: m.etapa.classe, prefixo: m.etapa.prefixoLote, modeloResultado: m.etapa.modeloResultado, unidadeEntrada: m.etapa.unidadeEntrada, unidadeSaida: m.etapa.unidadeSaida, monitoraSecagem: m.etapa.monitoraSecagem, exigeLocal: m.etapa.exigeLocal, tiposResultado: m.etapa.tiposResultado.map((t) => t.tipoCafe) },
      local: m.local ? { id: m.local.id, codigo: m.local.codigo, nome: m.local.nome } : null,
      fazenda: m.fazenda?.codigo ?? 'MIX', safra: m.safra.codigo, talhao: m.talhao ? `${m.talhao.codigo} · ${m.talhao.nome}` : null,
      quantidades: { entrada: txt(m.qtdEntrada), saida: txt(m.qtdSaida), perda: txt(m.qtdPerda), quebra: m.percQuebra?.toString() ?? null, rendimento: m.rendimento?.toString() ?? null, umidadeFinal: m.umidadeFinal?.toString() ?? null },
      entradas: m.entradas.map((e) => ({ id: e.id, loteId: e.loteId, codigo: e.lote.codigo, etapa: e.lote.etapa.nome, tipo: e.lote.tipoCafe?.codigo ?? null, tipoCafeId: e.lote.tipoCafeId, quantidade: txt(e.quantidade), unidade: e.unidade, local: e.localOrigemId ? (locaisOrigem.get(e.localOrigemId) ?? null) : null, reserva: e.origemReserva })),
      lotes: m.lotes.map((l) => ({
        id: l.id, codigo: l.codigo, status: l.status, tipo: l.tipoCafe?.codigo ?? null, peneira: l.peneira?.codigo ?? null, unidade: l.unidade, quantidade: txt(l.quantidade),
        percentual: l.percentual?.toString() ?? null, saldo: saldoDoLote({ quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada) }).toFixed(3),
        certificados: l.certificados.map((c) => c.certificado.codigo), locais: l.locais.map((x) => ({ codigo: x.local.codigo, quantidade: dec(x.quantidade).toFixed(3) })),
      })),
      composicao,
      linhaDoTempo,
      historico: historico.map((h) => ({ id: h.id, acao: h.acao, quando: h.data, quem: quem(h.usuarioId), depois: h.depois })),
    };
  });
}

/** Lotes que podem entrar num movimento da etapa: saldo livre e transição configurada (RN-16). */
export async function lotesParaEntrada(ctx: Contexto, etapaId: string) {
  if (!ehUuid(etapaId)) throw new ErroNaoEncontrado('Etapa não encontrada.');
  return comTransacao(ctx, async (tx) => {
    const origens = await tx.fluxoTransicao.findMany({ where: { etapaDestinoId: etapaId }, select: { etapaOrigemId: true, fazendaId: true } });
    const todas = await tx.fluxoTransicao.findMany({ where: { etapaOrigemId: { in: origens.map((o) => o.etapaOrigemId) } }, select: { etapaOrigemId: true, etapaDestinoId: true, fazendaId: true } });
    const lotes = await tx.lote.findMany({
      where: { etapaId: { in: [...new Set(origens.map((o) => o.etapaOrigemId))] }, status: { in: ['ABERTO', 'PARCIAL'] } },
      include: { etapa: { select: { nome: true } }, tipoCafe: { select: { codigo: true } }, peneira: { select: { codigo: true } }, fazenda: { select: { codigo: true } }, locais: { where: { quantidade: { gt: 0 } }, include: { local: { select: { id: true, codigo: true } } } } },
      orderBy: { codigo: 'asc' },
      take: 500,
    });
    // Regra da fazenda substitui a da empresa para aquela origem (§5.2).
    const permitido = (l: (typeof lotes)[number]) => {
      const daFazenda = l.fazendaId ? todas.filter((t) => t.etapaOrigemId === l.etapaId && t.fazendaId === l.fazendaId) : [];
      const base = daFazenda.length ? daFazenda : todas.filter((t) => t.etapaOrigemId === l.etapaId && t.fazendaId === null);
      return base.some((t) => t.etapaDestinoId === etapaId);
    };
    return lotes.filter(permitido).map((l) => {
      const base = { quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada), quantidadeReservada: dec(l.quantidadeReservada) };
      return {
        id: l.id, codigo: l.codigo, etapa: l.etapa.nome, tipo: l.tipoCafe?.codigo ?? null, peneira: l.peneira?.codigo ?? null, fazenda: l.fazenda?.codigo ?? 'MIX', unidade: l.unidade,
        saldo: saldoDoLote(base).toFixed(3), livre: saldoLivre(base).toFixed(3), locais: l.locais.map((x) => ({ id: x.local.id, codigo: x.local.codigo, quantidade: dec(x.quantidade).toFixed(3) })),
      };
    }).filter((l) => dec(l.livre).gt(0));
  });
}

// ================================================================ estoque (§12 item 10)

export interface FiltroEstoque {
  etapaId?: string;
  safraId?: string;
  fazendaId?: string; // 'MIX' para lotes de várias fazendas
  peneiraId?: string;
  certificadoId?: string;
  localId?: string;
  situacao?: 'livre' | 'reservado';
  busca?: string;
}

export async function consultarEstoque(ctx: Contexto, f: FiltroEstoque = {}) {
  return comTransacao(ctx, async (tx) => {
    const where: Prisma.LoteWhereInput = {
      status: { in: ['ABERTO', 'PARCIAL'] },
      ...(f.etapaId ? { etapaId: f.etapaId } : { etapa: { classe: 'ESTOQUE' } }),
      ...(f.safraId ? { safraId: f.safraId } : {}),
      ...(f.fazendaId === 'MIX' ? { fazendaId: null } : f.fazendaId ? { fazendaId: f.fazendaId } : {}),
      ...(f.peneiraId ? { peneiraId: f.peneiraId } : {}),
      ...(f.certificadoId ? { certificados: { some: { certificadoId: f.certificadoId, removidoEm: null } } } : {}),
      ...(f.localId ? { locais: { some: { localId: f.localId, quantidade: { gt: 0 } } } } : {}),
      ...(f.situacao === 'reservado' ? { quantidadeReservada: { gt: 0 } } : {}),
      ...(f.busca?.trim() ? { codigo: { contains: f.busca.trim().toUpperCase() } } : {}),
    };
    const lotes = await tx.lote.findMany({
      where,
      include: {
        etapa: { select: { id: true, nome: true, classe: true } }, safra: { select: { codigo: true } }, fazenda: { select: { codigo: true } },
        tipoCafe: { select: { codigo: true } }, peneira: { select: { codigo: true } },
        certificados: { where: { removidoEm: null }, include: { certificado: { select: { codigo: true } } } },
        locais: { where: { quantidade: { gt: 0 } }, include: { local: { select: { id: true, codigo: true } } } },
        reservas: { where: { status: 'ATIVA' }, select: { finalidade: true, quantidade: true } },
      },
      orderBy: { codigo: 'asc' },
      take: 1000,
    });
    const linhas = lotes.map((l) => {
      const base = { quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada), quantidadeReservada: dec(l.quantidadeReservada) };
      return {
        id: l.id, codigo: l.codigo, etapa: l.etapa.nome, etapaId: l.etapa.id, classe: l.etapa.classe, safra: l.safra.codigo, fazenda: l.fazenda?.codigo ?? 'MIX',
        tipo: l.tipoCafe?.codigo ?? null, peneira: l.peneira?.codigo ?? null, unidade: l.unidade, data: dataLocal(l.data), umidade: l.umidade?.toString() ?? null,
        saldo: saldoDoLote(base).toFixed(3), livre: saldoLivre(base).toFixed(3), reservado: dec(l.quantidadeReservada).toFixed(3),
        reservas: l.reservas.map((r) => `${r.finalidade.toLowerCase()} ${dec(r.quantidade).toFixed(3)}`),
        certificados: l.certificados.map((c) => c.certificado.codigo), locais: l.locais.map((x) => ({ id: x.local.id, codigo: x.local.codigo, quantidade: dec(x.quantidade).toFixed(3) })),
      };
    });
    const filtradas = f.situacao === 'livre' ? linhas.filter((l) => dec(l.livre).gt(0)) : linhas;
    const total = (campo: 'saldo' | 'livre' | 'reservado', unidade: 'KG' | 'MEDIDA') => filtradas.filter((l) => l.unidade === unidade).reduce((s, l) => s.plus(l[campo]), new Decimal(0)).toFixed(3);
    return { lotes: filtradas, totais: { kg: { saldo: total('saldo', 'KG'), livre: total('livre', 'KG'), reservado: total('reservado', 'KG') }, medidas: { saldo: total('saldo', 'MEDIDA') } } };
  });
}

// ================================================================ rastreabilidade (§12 item 12)

export interface NoRastreio {
  lote: { id: string; codigo: string; quantidade: string; unidade: string; status: string; etapa: string };
  movimento: { id: string; etapa: string; numero: number; status: string } | null;
  /** Quanto deste lote foi para (ou veio do) nó pai. */
  quantidadeLigacao: string | null;
  talhao?: { codigo: string; fazenda: string } | null;
  filhos: NoRastreio[];
}

const LIMITE_PROFUNDIDADE = 40;

/** Árvore para cima (origens até a colheita) ou para baixo (destinos até a saída). */
export async function rastrearLote(ctx: Contexto, loteId: string, direcao: 'cima' | 'baixo') {
  if (!ehUuid(loteId)) throw new ErroNaoEncontrado('Lote não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const raiz = await tx.lote.findFirst({ where: { id: loteId } });
    if (!raiz) throw new ErroNaoEncontrado('Lote não encontrado.');
    const visitados = new Set<string>();
    const no = async (id: string, ligacao: string | null, nivel: number): Promise<NoRastreio> => {
      const l = await tx.lote.findFirstOrThrow({ where: { id }, include: { etapa: { select: { nome: true } }, movimento: { include: { etapa: { select: { nome: true, prefixoLote: true } }, talhao: { select: { codigo: true, fazenda: { select: { codigo: true } } } } } } } });
      const base: NoRastreio = {
        lote: { id: l.id, codigo: l.codigo, quantidade: dec(l.quantidade).toFixed(3), unidade: l.unidade, status: l.status, etapa: l.etapa.nome },
        movimento: { id: l.movimento.id, etapa: l.movimento.etapa.nome, numero: l.movimento.numero, status: l.movimento.status },
        quantidadeLigacao: ligacao,
        talhao: l.movimento.talhao ? { codigo: l.movimento.talhao.codigo, fazenda: l.movimento.talhao.fazenda.codigo } : null,
        filhos: [],
      };
      if (visitados.has(id) || nivel >= LIMITE_PROFUNDIDADE) return base;
      visitados.add(id);
      if (direcao === 'cima') {
        const es = await tx.movimentoEntrada.findMany({ where: { movimentoId: l.movimentoId, cancelada: false, ...(l.fontes.length ? { id: { in: l.fontes } } : {}) }, orderBy: { criadoEm: 'asc' } });
        for (const e of es) base.filhos.push(await no(e.loteId, dec(e.quantidade).toFixed(3), nivel + 1));
      } else {
        const es = await tx.movimentoEntrada.findMany({
          where: { loteId: id, cancelada: false, movimento: { status: { not: 'ESTORNADO' } } },
          include: { movimento: { include: { etapa: { select: { nome: true } }, lotes: { where: { status: { not: 'ESTORNADO' } }, select: { id: true, fontes: true } } } } },
          orderBy: { criadoEm: 'asc' },
        });
        for (const e of es) {
          if (!e.movimento.lotes.length) {
            // Saída ou movimento ainda aberto: a folha é o próprio movimento.
            base.filhos.push({
              lote: { id: `mov-${e.movimento.id}`, codigo: `${e.movimento.etapa.nome} #${e.movimento.numero}`, quantidade: dec(e.quantidade).toFixed(3), unidade: e.unidade, status: e.movimento.status, etapa: e.movimento.etapa.nome },
              movimento: { id: e.movimento.id, etapa: e.movimento.etapa.nome, numero: e.movimento.numero, status: e.movimento.status },
              quantidadeLigacao: dec(e.quantidade).toFixed(3), filhos: [],
            });
          } else for (const g of e.movimento.lotes.filter((x) => !x.fontes.length || x.fontes.includes(e.id))) base.filhos.push(await no(g.id, dec(e.quantidade).toFixed(3), nivel + 1));
        }
      }
      return base;
    };
    const arvore = await no(raiz.id, null, 0);
    // Talhões de origem com geometria, para o mapa.
    const comp = await tx.loteTalhao.findMany({
      where: { loteId: raiz.id },
      include: { talhao: { select: { id: true, codigo: true, nome: true, geometria: true, geometriaTipo: true, areaHaCalculada: true, fazenda: { select: { codigo: true, nome: true } } } } },
      orderBy: { percentual: 'desc' },
    });
    const origens = comp.map((c) => ({
      id: c.talhao.id, codigo: c.talhao.codigo, nome: c.talhao.nome, fazenda: c.talhao.fazenda.codigo, percentual: dec(c.percentual).toFixed(4),
      quantidade: dec(c.quantidadeEquivalente).toFixed(3), geometria: c.talhao.geometria, geometriaTipo: c.talhao.geometriaTipo, areaHa: c.talhao.areaHaCalculada?.toString() ?? null,
    }));
    return { lote: { id: raiz.id, codigo: raiz.codigo }, direcao, arvore, origens };
  });
}

/** Busca rápida (§12): código de lote, nº de movimento ("TE#12" ou "TE-12") ou talhão. */
export async function buscar(ctx: Contexto, termo: string) {
  const t = termo.trim().toUpperCase();
  if (t.length < 2) return { lotes: [], movimentos: [] };
  return comTransacao(ctx, async (tx) => {
    const mov = /^([A-Z]{2,3})\s*[#-]\s*(\d+)$/.exec(t);
    const movimentos = mov
      ? await tx.movimento.findMany({ where: { numero: Number(mov[2]), etapa: { prefixoLote: mov[1] } }, include: { etapa: { select: { nome: true, prefixoLote: true } } }, take: 5 })
      : [];
    const lotes = await tx.lote.findMany({
      where: { OR: [{ codigo: { contains: t } }, { talhoes: { some: { talhao: { codigo: t } } } }] },
      select: { id: true, codigo: true, status: true, unidade: true, quantidade: true, etapa: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
    return {
      movimentos: movimentos.map((m) => ({ id: m.id, rotulo: `${m.etapa.nome} ${m.etapa.prefixoLote}#${m.numero}`, status: m.status })),
      lotes: lotes.map((l) => ({ id: l.id, codigo: l.codigo, status: l.status, etapa: l.etapa.nome, quantidade: dec(l.quantidade).toFixed(3), unidade: l.unidade })),
    };
  });
}

