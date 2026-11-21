import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { criar, listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { alterarUsuario } from '@/servicos/usuarios';
import { abrirMovimento, adicionarEntradas, apagarResultados, estornarMovimento, finalizarSaida, lancarResultados, obterMovimento, reabrirSaida, registrarCarga, removerEntrada } from '@/servicos/movimentos';
import { alterarLote, definirCertificadosLote, obterLote } from '@/servicos/lotes';
import { cancelarReserva, criarReserva } from '@/servicos/reservas';
import { ErroNaoEncontrado, ErroRegra } from '@/dominio/erros';
import { kgParaSacas } from '@/dominio/quantidade';
import { SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[0].id, perfil: 'ADMIN_EMPRESA' };
const ctxOperador: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[1].id, perfil: 'OPERADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: SEED.usuarios[2].id, perfil: 'ADMIN_EMPRESA' };
const NS = SEED.fazendas.find((f) => f.codigo === 'NS')!.id;
const BV = SEED.fazendas.find((f) => f.codigo === 'BV')!.id;
const T1 = SEED.talhoes.find((t) => t.codigo === 'T1')!.id;
const T2 = SEED.talhoes.find((t) => t.codigo === 'T2')!.id;
const CONTRATO = '0c000000-0000-4000-8000-000000000001'; // contrato fictício (o módulo comercial vem na Fase 5)

/** Espera um ErroRegra com o código indicado. */
async function regra(p: Promise<unknown>, codigo: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroRegra);
  expect((e as ErroRegra).codigo).toBe(codigo);
  return e as ErroRegra;
}
const q = (v: { toString(): string } | null | undefined) => new Decimal(v?.toString() ?? '0').toFixed(3);

let E: Record<string, string>; // etapa por código
let TIPO: Record<string, string>;
let PEN: Record<string, string>;
let LOCAL: Record<string, string>;
let SAFRA: string;
let CERT: Record<string, string>;

beforeAll(async () => {
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  const mapa = async (r: 'tipos-cafe' | 'peneiras' | 'locais' | 'certificados') => Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  TIPO = await mapa('tipos-cafe');
  PEN = await mapa('peneiras');
  LOCAL = await mapa('locais');
  CERT = await mapa('certificados');
  SAFRA = ((await listar(ctx, 'safras')) as { id: string; codigo: string }[]).find((s) => s.codigo === '2025/26')!.id;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

const carga = (talhaoId: string, quantidade: string, extra: Partial<Parameters<typeof registrarCarga>[1]> = {}, c = ctx) =>
  registrarCarga(c, { fazendaId: talhaoId === T1 || talhaoId === T2 ? NS : BV, talhaoId, safraId: SAFRA, tipoCafeId: TIPO.NAT!, quantidade, ...extra });

/** Leva uma carga até o armazém pelos atalhos Colheita → Terreiro → Tulha → Armazém. */
async function ateArmazem(talhaoId: string, medidas: string, kg: string, extra: Partial<Parameters<typeof registrarCarga>[1]> = {}) {
  const { lote: ef } = await carga(talhaoId, medidas, extra);
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: ef.id, quantidade: medidas }] });
  const { lotes: [lte] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: LOCAL['TU-01'], entradas: [{ loteId: lte!.id, quantidade: medidas }] });
  const { lotes: [ltu] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL['Q-02'], entradas: [{ loteId: ltu!.id, quantidade: medidas }] });
  const { lotes: [lar] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: kg, peneiraId: PEN['17'] }] } });
  return lar!;
}

// ======================================================================= §15, passos 3–8 e 13

describe('cenário de aceitação §15 (passos 3–8 e 13)', () => {
  const s: Record<string, { id: string; codigo: string }> = {};
  const m: Record<string, string> = {};

  it('passo 3: cargas C1 (T1, NAT, 100) e C2 (T2, mecânica, 50) geram EF1 e EF2', async () => {
    const c1 = await carga(T1, '100');
    const c2 = await carga(T2, '50', { modoColheita: 'MECANICA' });
    s.EF1 = c1.lote;
    s.EF2 = c2.lote;
    expect(c1.movimento.status).toBe('PROCESSADO');
    expect(c1.lote.codigo).toMatch(/^EF-NS-2526-\d{6}-NAT$/);
    const ef1 = await obterLote(ctx, c1.lote.id);
    expect(q(ef1.quantidade)).toBe('100.000');
    expect(ef1.talhoes.map((t) => [t.talhao.codigo, t.percentual.toString()])).toEqual([['T1', '1']]);
    expect(ef1.certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
  });

  it('passo 4: lavador LD#1 com EF1 + EF2 (150) → VER 30, BOI 45, CD 60, perda 15 (quebra 10%), composição T1 66,67% / T2 33,33%', async () => {
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: s.EF1!.id, quantidade: '100' }, { loteId: s.EF2!.id, quantidade: '50' }] });
    m.LD = ld.movimento.id;
    const r = await lancarResultados(ctx, m.LD, {
      parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: TIPO.VER!, percentual: '0,20' }, { tipoCafeId: TIPO.BOI!, percentual: '0.30' }, { tipoCafeId: TIPO.CD!, percentual: '0.40' }] },
    });
    expect(r.lotes.map((l) => q(l.quantidade))).toEqual(['30.000', '45.000', '60.000']);
    expect(q(r.movimento.qtdPerda)).toBe('15.000');
    expect(r.movimento.percQuebra!.toString()).toBe('0.1');
    for (const l of r.lotes) {
      const d = await obterLote(ctx, l.id);
      expect(d.talhoes.map((t) => [t.talhao.codigo, new Decimal(t.percentual.toString()).toFixed(4)])).toEqual([['T1', '0.6667'], ['T2', '0.3333']]);
      expect(d.certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
    }
    s.CD = r.lotes.find((l) => l.tipoCafeId === TIPO.CD)!;
    s.BOI = r.lotes.find((l) => l.tipoCafeId === TIPO.BOI)!;
    expect((await obterLote(ctx, s.EF1!.id)).status).toBe('UTILIZADO');
  });

  it('passo 5: terreiro TE#1 (120 medidas) recebe CD 60 e BOI 45 → ocupação 87,5%; fator 0,90 → CD 54,0 e BOI 40,5', async () => {
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: s.CD!.id, quantidade: '60' }, { loteId: s.BOI!.id, quantidade: '45' }] });
    m.TE = te.movimento.id;
    expect(te.ocupacao?.percentual).toBe('0.8750');
    expect(te.alertas).toEqual([]);
    const r = await lancarResultados(ctx, m.TE, { parametros: { modelo: 'CAFE_E_PERDA', fator: '0,90' }, umidadeFinal: '12,0' });
    expect(r.lotes.map((l) => [l.tipoCafeId, q(l.quantidade)])).toEqual([[TIPO.CD, '54.000'], [TIPO.BOI, '40.500']]);
    expect(r.lotes[0]!.codigo).toMatch(/^TE-NS-2526-\d{6}-CD$/);
    s.TE_CD = r.lotes[0]!;
    s.TE_BOI = r.lotes[1]!;
  });

  it('passo 6: secador SE#1 com 94,5 → fator 0,95 → 89,775', async () => {
    const se = await abrirMovimento(ctx, { etapaId: E.SECADOR!, localId: LOCAL['SE-01'], entradas: [{ loteId: s.TE_CD!.id, quantidade: '54' }, { loteId: s.TE_BOI!.id, quantidade: '40.5' }] });
    const r = await lancarResultados(ctx, se.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '0.95' } });
    expect(q(r.movimento.qtdSaida)).toBe('89.775');
    s.SE_CD = r.lotes[0]!;
    s.SE_BOI = r.lotes[1]!;
  });

  it('passo 7: tulha TU#1 com 89,775 → fator 1,0 → 89,775', async () => {
    const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: LOCAL['TU-01'], entradas: [{ loteId: s.SE_CD!.id, quantidade: '51.3' }, { loteId: s.SE_BOI!.id, quantidade: '38.475' }] });
    const r = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    expect(q(r.movimento.qtdSaida)).toBe('89.775');
    expect(r.movimento.percQuebra!.toString()).toBe('0');
    s.TU_CD = r.lotes[0]!;
    s.TU_BOI = r.lotes[1]!;
  });

  it('passo 8: armazém com 1.200 kg peneira 17 → 20 sacas, rendimento 13,367 kg/medida, só RFA; AAA bloqueado (RN-08)', async () => {
    const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL['Q-01'], entradas: [{ loteId: s.TU_CD!.id, quantidade: '51.3' }, { loteId: s.TU_BOI!.id, quantidade: '38.475' }] });
    m.AR = ar.movimento.id;
    await regra(
      lancarResultados(ctx, m.AR, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '1200', peneiraId: PEN['17'] }] }, certificadoIds: [CERT.RFA!, CERT.AAA!] }),
      'RN-08',
    );
    const r = await lancarResultados(ctx, m.AR, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '1.200,000', peneiraId: PEN['17'] }] } });
    const lar = r.lotes[0]!;
    s.AR = lar;
    expect(lar.codigo).toMatch(/^AR-NS-2526-\d{6}-P17$/);
    expect(lar.unidade).toBe('KG');
    expect(q(lar.quantidade)).toBe('1200.000');
    expect(kgParaSacas(lar.quantidade.toString()).toString()).toBe('20');
    expect(r.movimento.rendimento!.toString()).toBe('13.367');
    const d = await obterLote(ctx, lar.id);
    expect(d.certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
    expect(d.talhoes.map((t) => [t.talhao.codigo, q(t.quantidadeEquivalente)])).toEqual([['T1', '800.000'], ['T2', '400.000']]);
    await regra(definirCertificadosLote(ctx, lar.id, [CERT.RFA!, CERT.AAA!]), 'RN-08');
  });

  it('reserva do contrato: 900 kg do AR; mais 400 kg para outro contrato é bloqueado (RN-07)', async () => {
    await criarReserva(ctx, { loteId: s.AR!.id, quantidade: '900', finalidade: 'CONTRATO', contratoId: CONTRATO });
    const d = await obterLote(ctx, s.AR!.id);
    expect([d.saldo, d.saldoLivre]).toEqual(['1200.000', '300.000']);
    await regra(criarReserva(ctx, { loteId: s.AR!.id, quantidade: '400', finalidade: 'CONTRATO', contratoId: '0c000000-0000-4000-8000-000000000002' }), 'RN-07');
  });

  it('saída EB#1 do contrato consome a reserva e finaliza: AR parcial com saldo 300', async () => {
    const eb = await abrirMovimento(ctx, { etapaId: E.EMBARQUE!, contratoId: CONTRATO, entradas: [{ loteId: s.AR!.id, quantidade: '900' }] });
    m.EB = eb.movimento.id;
    await finalizarSaida(ctx, m.EB);
    const d = await obterLote(ctx, s.AR!.id);
    expect(d.status).toBe('PARCIAL');
    expect([d.saldo, d.saldoLivre, q(d.quantidadeReservada)]).toEqual(['300.000', '300.000', '0.000']);
    const reservas = await dono.reserva.findMany({ where: { loteId: s.AR!.id } });
    expect(reservas.map((r) => r.status)).toEqual(['CONSUMIDA']);
  });

  it('passo 13: estornar LD#1 → RN-05; estornar EB#1 → RN-14; a Beta não acessa o lote AR (RN-22)', async () => {
    const e = await regra(estornarMovimento(ctx, m.LD!, 'teste de estorno'), 'RN-05');
    expect(e.message).toMatch(/Terreiro/);
    await regra(estornarMovimento(ctx, m.EB!, 'teste de estorno'), 'RN-14');
    await expect(obterLote(ctxBeta, s.AR!.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(obterMovimento(ctxBeta, m.EB!)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(abrirMovimento(ctxBeta, { etapaId: (await obterFluxo(ctxBeta)).etapas.find((x) => x.classe === 'SAIDA')!.id, entradas: [{ loteId: s.AR!.id, quantidade: '1' }] })).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });

  it('RN-14 só o administrador reabre a saída finalizada, com motivo', async () => {
    await regra(reabrirSaida(ctxOperador, m.EB!, 'conferência'), 'RN-14');
    const r = await reabrirSaida(ctx, m.EB!, 'correção da nota');
    expect(r.status).toBe('ABERTO');
    expect((await finalizarSaida(ctx, m.EB!)).status).toBe('FINALIZADO');
  });

  it('RN-15 cada passo gravou auditoria com autoria do servidor', async () => {
    const a = await dono.auditoria.findMany({ where: { empresaId: ALFA, entidadeId: { in: [m.LD!, m.TE!, m.AR!, m.EB!] } } });
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.every((x) => x.usuarioId === ctx.usuarioId)).toBe(true);
    expect(a.map((x) => x.acao)).toEqual(expect.arrayContaining(['CRIAR', 'RESULTADO', 'FINALIZAR', 'REABRIR']));
  });
});

// ======================================================================= regras

describe('regras de rastreabilidade', () => {
  it('RN-01 entrada acima do saldo é recusada', async () => {
    const { lote } = await carga(T1, '10');
    await regra(abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '10.001' }] }), 'RN-01');
  });

  it('RN-01 concorrência: duas entradas simultâneas sobre o mesmo saldo, só uma passa', async () => {
    const { lote } = await carga(T1, '100');
    const tentar = () => abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '80' }] });
    const r = await Promise.allSettled([tentar(), tentar(), tentar()]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    for (const x of r.filter((x) => x.status === 'rejected')) expect(((x as PromiseRejectedResult).reason as ErroRegra).codigo).toBe('RN-01');
    expect(q((await obterLote(ctx, lote.id)).quantidadeUtilizada)).toBe('80.000');
  });

  it('RN-02 o status acompanha o uso e a retirada da entrada devolve o saldo', async () => {
    const { lote } = await carga(T1, '50');
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '20' }] });
    expect((await obterLote(ctx, lote.id)).status).toBe('PARCIAL');
    await adicionarEntradas(ctx, ld.movimento.id, [{ loteId: lote.id, quantidade: '30' }]);
    expect((await obterLote(ctx, lote.id)).status).toBe('UTILIZADO');
    expect(q((await obterMovimento(ctx, ld.movimento.id)).qtdEntrada)).toBe('50.000');
    await removerEntrada(ctx, ld.movimento.id, lote.id);
    expect((await obterLote(ctx, lote.id)).status).toBe('ABERTO');
  });

  it('RN-03 lote parcial não muda de tipo; a mensagem aponta o movimento de destino', async () => {
    const { lote } = await carga(T1, '40');
    await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '10' }] });
    const e = await regra(alterarLote(ctx, lote.id, { tipoCafeId: TIPO.CAT! }), 'RN-03');
    expect(e.message).toMatch(/Lavador/);
    await expect(alterarLote(ctx, lote.id, { observacao: 'conferido' })).resolves.toBeTruthy();
  });

  it('RN-04 operador só lança nas fazendas liberadas; movimento com lote de outra fazenda também é bloqueado', async () => {
    await alterarUsuario(ctx, ctxOperador.usuarioId, { perfil: 'OPERADOR', ativo: true, fazendaIds: [NS] });
    await regra(registrarCarga(ctxOperador, { fazendaId: BV, talhaoId: T1, safraId: SAFRA, tipoCafeId: TIPO.NAT!, quantidade: '5' }), 'RN-04');
    const { lote } = await carga(T1, '5', {}, ctxOperador);
    await alterarUsuario(ctx, ctxOperador.usuarioId, { perfil: 'OPERADOR', ativo: true, fazendaIds: [BV] });
    await regra(abrirMovimento(ctxOperador, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '5' }] }), 'RN-04');
    await alterarUsuario(ctx, ctxOperador.usuarioId, { perfil: 'OPERADOR', ativo: true, fazendaIds: [NS] });
  });

  it('RN-05 estorno em cadeia na ordem inversa devolve as quantidades e não apaga nada', async () => {
    const { lote: ef, movimento: carga1 } = await carga(T2, '20');
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: ef.id, quantidade: '20' }] });
    const { lotes } = await lancarResultados(ctx, ld.movimento.id, { parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: TIPO.CD!, percentual: '0.9' }] } });
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: lotes[0]!.id, quantidade: '18' }] });
    await regra(estornarMovimento(ctx, ld.movimento.id, 'erro de lançamento'), 'RN-05');
    await regra(estornarMovimento(ctx, carga1.id, 'erro de lançamento'), 'RN-05');
    await estornarMovimento(ctx, te.movimento.id, 'erro de lançamento');
    expect((await obterLote(ctx, lotes[0]!.id)).status).toBe('ABERTO');
    await estornarMovimento(ctx, ld.movimento.id, 'erro de lançamento');
    expect((await obterLote(ctx, lotes[0]!.id)).status).toBe('ESTORNADO');
    expect((await obterLote(ctx, ef.id)).status).toBe('ABERTO');
    await estornarMovimento(ctx, carga1.id, 'carga duplicada');
    expect((await obterLote(ctx, ef.id)).status).toBe('ESTORNADO');
    const mov = await obterMovimento(ctx, ld.movimento.id);
    expect([mov.status, mov.motivoEstorno, mov.entradas.length]).toEqual(['ESTORNADO', 'erro de lançamento', 1]);
    await expect(estornarMovimento(ctx, te.movimento.id, 'de novo')).rejects.toThrow(/já está estornado/);
  });

  it('RN-06 apagar resultados volta o movimento a aberto; o relançamento gera lotes com sufixo', async () => {
    const { lote: ef } = await carga(T1, '30');
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: ef.id, quantidade: '30' }] });
    const p = { parametros: { modelo: 'PERCENTUAL_POR_TIPO' as const, resultados: [{ tipoCafeId: TIPO.VER!, percentual: '0.5' }] } };
    const r1 = await lancarResultados(ctx, ld.movimento.id, p);
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: r1.lotes[0]!.id, quantidade: '1' }] });
    await regra(apagarResultados(ctx, ld.movimento.id, 'percentual errado'), 'RN-06');
    await estornarMovimento(ctx, te.movimento.id, 'percentual errado');
    const aberto = await apagarResultados(ctx, ld.movimento.id, 'percentual errado');
    expect([aberto.status, aberto.qtdSaida]).toEqual(['ABERTO', null]);
    expect((await obterLote(ctx, r1.lotes[0]!.id)).status).toBe('ESTORNADO');
    const r2 = await lancarResultados(ctx, ld.movimento.id, { parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: TIPO.VER!, percentual: '0.6' }] } });
    expect(r2.lotes[0]!.codigo).toBe(`${r1.lotes[0]!.codigo}-2`);
    expect(q(r2.lotes[0]!.quantidade)).toBe('18.000');
  });

  it('RN-07 reserva não passa do saldo livre; cancelar libera; reserva de contrato não serve a outro movimento', async () => {
    const { lote } = await carga(T1, '10');
    const r = await criarReserva(ctx, { loteId: lote.id, quantidade: '8', finalidade: 'TRANSFERENCIA' });
    await regra(criarReserva(ctx, { loteId: lote.id, quantidade: '3', finalidade: 'TRANSFERENCIA' }), 'RN-07');
    await regra(abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '3' }] }), 'RN-07');
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '10', reservaId: r.id }] });
    expect(ld.movimento.qtdEntrada.toString()).toBe('10');
    expect((await dono.reserva.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('CONSUMIDA');

    const ar = await ateArmazem(T1, '10', '130');
    const rc = await criarReserva(ctx, { loteId: ar.id, quantidade: '100', finalidade: 'CONTRATO', contratoId: CONTRATO });
    await regra(abrirMovimento(ctx, { etapaId: E.SERVICO!, entradas: [{ loteId: ar.id, quantidade: '100', reservaId: rc.id }] }), 'RN-07');
    await cancelarReserva(ctx, rc.id, 'contrato desistiu');
    expect((await obterLote(ctx, ar.id)).saldoLivre).toBe('130.000');
  });

  it('RN-09 RN-13 blend de duas fazendas e duas safras: lote MIX com composição ponderada e safra predominante', async () => {
    const b1 = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'B1', nome: 'Boa Vista 1', areaHaInformada: '3', geometria: { type: 'Point', coordinates: [-47.01, -18.95] } });
    const { registro: safraAnt } = await criar(ctx, 'safras', { codigo: '2024/25', dataInicio: '2024-05-01', dataFim: '2025-04-30' });
    const ns = await ateArmazem(T1, '20', '300');
    const bv = await ateArmazem(b1.registro.id as string, '10', '100', { fazendaId: BV, safraId: safraAnt.id as string });
    await regra(abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'REBENEFICIO', entradas: [{ loteId: ns.id, quantidade: '300' }, { loteId: bv.id, quantidade: '100' }] }), 'RN-13');
    const gs = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'BLEND', entradas: [{ loteId: ns.id, quantidade: '300' }, { loteId: bv.id, quantidade: '100' }] });
    expect(gs.movimento.fazendaId).toBeNull();
    expect(gs.movimento.safraId).toBe(SAFRA);
    expect(gs.movimento.misturaSafras).toHaveLength(2);
    const r = await lancarResultados(ctx, gs.movimento.id, { parametros: { modelo: 'POR_PENEIRA', lotes: [{ quantidade: '380', peneiraId: PEN['17']! }] } });
    const l = await obterLote(ctx, r.lotes[0]!.id);
    expect(l.codigo).toMatch(/^GS-MIX-2526-\d{6}-P17$/);
    expect(l.fazendaId).toBeNull();
    expect(l.talhoes.map((t) => [t.talhao.codigo, new Decimal(t.percentual.toString()).toFixed(2), q(t.quantidadeEquivalente)])).toEqual([['T1', '0.75', '285.000'], ['B1', '0.25', '95.000']]);
    expect(l.certificados).toEqual([]); // BV não tem RFA: o lote não herda (RN-08)
    expect(r.movimento.percQuebra!.toString()).toBe('0.05');

    // RN-11: medidas e kg não se misturam no mesmo movimento do armazém.
    const { lote: ef } = await carga(T1, '5');
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: ef.id, quantidade: '5' }] });
    const { lotes: [lte] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: LOCAL['TU-01'], entradas: [{ loteId: lte!.id, quantidade: '5' }] });
    const { lotes: [ltu] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    await regra(abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL['Q-02'], entradas: [{ loteId: r.lotes[0]!.id, quantidade: '10' }, { loteId: ltu!.id, quantidade: '5' }] }), 'RN-11');
  });

  it('RN-10 a volta do serviço para o estoque em kg registra quebra, não rendimento', async () => {
    const ar = await ateArmazem(T2, '10', '200');
    const gs = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'REBENEFICIO', entradas: [{ loteId: ar.id, quantidade: '200' }] });
    const { lotes } = await lancarResultados(ctx, gs.movimento.id, { parametros: { modelo: 'POR_PENEIRA', lotes: [{ quantidade: '120', peneiraId: PEN['17']! }, { quantidade: '70', peneiraId: PEN['15']! }] } });
    const volta = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL['Q-02'], entradas: lotes.map((l) => ({ loteId: l.id, quantidade: l.quantidade.toString() })) });
    const r = await lancarResultados(ctx, volta.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '189', peneiraId: PEN['17']! }] } });
    expect([r.movimento.rendimento, r.movimento.percQuebra?.toString()]).toEqual([null, '0.005263']);
  });

  it('RN-12 soma dos percentuais acima de 1 é recusada no lançamento', async () => {
    const { lote } = await carga(T1, '10');
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '10' }] });
    await regra(lancarResultados(ctx, ld.movimento.id, { parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: TIPO.CD!, percentual: '0.7' }, { tipoCafeId: TIPO.BOI!, percentual: '0.4' }] } }), 'RN-12');
  });

  it('RN-16 entrada sem transição configurada é recusada', async () => {
    const { lote } = await carga(T1, '10');
    await regra(abrirMovimento(ctx, { etapaId: E.SECADOR!, localId: LOCAL['SE-01'], entradas: [{ loteId: lote.id, quantidade: '10' }] }), 'RN-16');
  });

  it('RN-24 passar da capacidade do local gera alerta; bloqueia se a empresa configurar', async () => {
    const { lote } = await carga(T1, '130');
    const r = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: lote.id, quantidade: '130' }] });
    expect(r.alertas.map((a) => a.codigo)).toEqual(['RN-24']);
    await estornarMovimento(ctx, r.movimento.id, 'teste de capacidade');
    const antes = await dono.empresa.findUniqueOrThrow({ where: { id: ALFA } });
    await dono.empresa.update({ where: { id: ALFA }, data: { configuracoes: { ...(antes.configuracoes as object), bloquear_capacidade: true } } });
    try {
      await regra(abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: lote.id, quantidade: '130' }] }), 'RN-24');
      expect((await obterLote(ctx, lote.id)).status).toBe('ABERTO');
    } finally {
      await dono.empresa.update({ where: { id: ALFA }, data: { configuracoes: antes.configuracoes as object } });
    }
  });

  it('RN-08 no estoque o certificado pode sair (com motivo) e voltar, mas nunca entrar um novo', async () => {
    const ar = await ateArmazem(T1, '5', '60');
    expect((await obterLote(ctx, ar.id)).certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
    await expect(definirCertificadosLote(ctx, ar.id, [])).rejects.toThrow(/motivo/);
    await definirCertificadosLote(ctx, ar.id, [], 'vendido como convencional');
    expect((await obterLote(ctx, ar.id)).certificados).toEqual([]);
    await definirCertificadosLote(ctx, ar.id, [CERT.RFA!]);
    expect((await obterLote(ctx, ar.id)).certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
    await regra(definirCertificadosLote(ctx, ar.id, [CERT.RFA!, CERT['4C']!]), 'RN-08');
  });

  it('RN-22 movimentos, lotes e reservas de uma empresa não existem para a outra', async () => {
    const { lote, movimento } = await carga(T1, '3');
    const r = await criarReserva(ctx, { loteId: lote.id, quantidade: '1', finalidade: 'TRANSFERENCIA' });
    const { comTransacao } = await import('@/servicos/transacao');
    const vistos = await comTransacao(ctxBeta, async (tx) => [await tx.lote.count(), await tx.movimento.count(), await tx.reserva.count(), await tx.loteTalhao.count()]);
    expect(vistos).toEqual([0, 0, 0, 0]);
    await expect(cancelarReserva(ctxBeta, r.id, 'tentativa indevida')).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(estornarMovimento(ctxBeta, movimento.id, 'tentativa indevida')).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(alterarLote(ctxBeta, lote.id, { observacao: 'x' })).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(comTransacao(ctxBeta, (tx) => tx.lote.updateMany({ where: { id: lote.id }, data: { observacao: 'invadido' } }))).resolves.toMatchObject({ count: 0 });
  });
});
