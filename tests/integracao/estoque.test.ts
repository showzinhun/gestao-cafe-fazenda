import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, estornarMovimento, lancarResultados, registrarCarga, removerEntrada } from '@/servicos/movimentos';
import { abrirInventario, aprovarInventario, cancelarInventario, obterInventario, registrarContagem, removerEntreLocais } from '@/servicos/estoque';
import { obterLote } from '@/servicos/lotes';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[0].id, perfil: 'ADMIN_EMPRESA' };
const ctxOperador: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[1].id, perfil: 'OPERADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: SEED.usuarios[2].id, perfil: 'ADMIN_EMPRESA' };
const NS = SEED.fazendas.find((f) => f.codigo === 'NS')!.id;
const T1 = SEED.talhoes.find((t) => t.codigo === 'T1')!.id;

let E: Record<string, string>;
let TIPO: Record<string, string>;
let PEN: Record<string, string>;
let LOCAL: Record<string, string>;
let SAFRA: string;

async function regra(p: Promise<unknown>, codigo: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroRegra);
  expect((e as ErroRegra).codigo).toBe(codigo);
}
const q = (v: { toString(): string } | null | undefined) => new Decimal(v?.toString() ?? '0').toFixed(3);
const noLocal = async (loteId: string) =>
  Object.fromEntries((await dono.loteLocal.findMany({ where: { loteId }, include: { local: true } })).map((l) => [l.local.codigo, q(l.quantidade)]));

beforeAll(async () => {
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  const mapa = async (r: 'tipos-cafe' | 'peneiras' | 'locais') => Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  TIPO = await mapa('tipos-cafe');
  PEN = await mapa('peneiras');
  LOCAL = await mapa('locais');
  SAFRA = ((await listar(ctx, 'safras')) as { id: string; codigo: string }[]).find((s) => s.codigo === '2025/26')!.id;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

/** Leva uma carga até o armazém, com o lote no local indicado. */
async function loteNoArmazem(kg: string, local = 'Q-01') {
  const { lote: ef } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: TIPO.NAT!, quantidade: '10' });
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: ef.id, quantidade: '10' }] });
  const { lotes: [lte] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: LOCAL['TU-01'], entradas: [{ loteId: lte!.id, quantidade: '10' }] });
  const { lotes: [ltu] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL[local], entradas: [{ loteId: ltu!.id, quantidade: '10' }] });
  const { lotes: [lar] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: kg, peneiraId: PEN['17'] }] } });
  return { lote: lar!, movimentoId: ar.movimento.id };
}

describe('saldo por local (RN-25)', () => {
  it('RN-25 o lote do estoque nasce no local do movimento e a soma dos locais é o saldo', async () => {
    const { lote } = await loteNoArmazem('600', 'Q-01');
    expect(await noLocal(lote.id)).toEqual({ 'Q-01': '600.000' });
  });

  it('RN-25 a conversão pode pôr cada lote num local diferente', async () => {
    const { lote: ef } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: TIPO.NAT!, quantidade: '10' });
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: LOCAL['TE-01'], entradas: [{ loteId: ef.id, quantidade: '10' }] });
    const { lotes: [lte] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: LOCAL['TU-01'], entradas: [{ loteId: lte!.id, quantidade: '10' }] });
    const { lotes: [ltu] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: LOCAL['Q-01'], entradas: [{ loteId: ltu!.id, quantidade: '10' }] });
    const r = await lancarResultados(ctx, ar.movimento.id, {
      parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '60', peneiraId: PEN['17'] }, { quantidade: '70', peneiraId: PEN['15'], localId: LOCAL['Q-02'] }] },
    });
    expect(await noLocal(r.lotes[0]!.id)).toEqual({ 'Q-01': '60.000' });
    expect(await noLocal(r.lotes[1]!.id)).toEqual({ 'Q-02': '70.000' });
    await expect(lancarResultados(ctx, (await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: (await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: TIPO.NAT!, quantidade: '1' })).lote.id, quantidade: '1' }] })).movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '1' }] } })).rejects.toThrow(/resultado/);
  });

  it('RN-25 remoção troca o local sem mudar o saldo; entrada em lote com dois locais exige o local', async () => {
    const { lote } = await loteNoArmazem('500', 'Q-01');
    await removerEntreLocais(ctx, { loteId: lote.id, localOrigemId: LOCAL['Q-01']!, localDestinoId: LOCAL['Q-02']!, quantidade: '200', motivo: 'organização da quadra' });
    expect(await noLocal(lote.id)).toEqual({ 'Q-01': '300.000', 'Q-02': '200.000' });
    expect((await obterLote(ctx, lote.id)).saldo).toBe('500.000');
    await regra(removerEntreLocais(ctx, { loteId: lote.id, localOrigemId: LOCAL['Q-02']!, localDestinoId: LOCAL['Q-01']!, quantidade: '201' }), 'RN-25');

    // 150 cabe nos dois locais: o usuário precisa dizer de qual sai.
    await regra(abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'REBENEFICIO', entradas: [{ loteId: lote.id, quantidade: '150' }] }), 'RN-25');
    const gs = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'REBENEFICIO', entradas: [{ loteId: lote.id, quantidade: '250', localId: LOCAL['Q-01'] }] });
    expect(await noLocal(lote.id)).toEqual({ 'Q-01': '50.000', 'Q-02': '200.000' });
    await removerEntrada(ctx, gs.movimento.id, lote.id);
    expect(await noLocal(lote.id)).toEqual({ 'Q-01': '300.000', 'Q-02': '200.000' });
    const gs2 = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'REBENEFICIO', entradas: [{ loteId: lote.id, quantidade: '100', localId: LOCAL['Q-02'] }] });
    await estornarMovimento(ctx, gs2.movimento.id, 'entrada errada');
    expect(await noLocal(lote.id)).toEqual({ 'Q-01': '300.000', 'Q-02': '200.000' });
  });

  it('RN-25 estornar o movimento do armazém zera o local dos lotes gerados', async () => {
    const { lote, movimentoId } = await loteNoArmazem('100', 'Q-02');
    await estornarMovimento(ctx, movimentoId, 'conversão errada');
    expect(await noLocal(lote.id)).toEqual({ 'Q-02': '0.000' });
  });
});

describe('inventário (RN-29)', () => {
  it('RN-29 contar 1.190 onde o sistema tem 1.200: nada muda até aprovar; ao aprovar, ajuste de −10 kg', async () => {
    const { lote } = await loteNoArmazem('1200', 'Q-02');
    const inv = await abrirInventario(ctx, { localIds: [LOCAL['Q-02']!] });
    const det = await obterInventario(ctx, inv.id);
    const item = det.itens.find((i) => i.loteId === lote.id)!;
    expect(q(item.qtdSistema)).toBe('1200.000');
    await registrarContagem(ctx, inv.id, det.itens.map((i) => ({ itemId: i.id, qtdContada: i.id === item.id ? '1.190,000' : i.qtdSistema.toString() })));
    expect((await obterLote(ctx, lote.id)).saldo).toBe('1200.000');
    await expect(aprovarInventario(ctxOperador, inv.id)).rejects.toBeInstanceOf(ErroPermissao);
    const r = await aprovarInventario(ctx, inv.id);
    expect(r.ajustes).toHaveLength(1);
    const l = await obterLote(ctx, lote.id);
    expect([l.saldo, l.status]).toEqual(['1190.000', 'PARCIAL']);
    expect(await noLocal(lote.id)).toEqual({ 'Q-02': '1190.000' });
    const ajuste = await dono.movimento.findUniqueOrThrow({ where: { id: r.ajustes[0]! } });
    expect([ajuste.natureza, ajuste.status, q(ajuste.qtdPerda)]).toEqual(['AJUSTE_INVENTARIO', 'FINALIZADO', '10.000']);
    await expect(estornarMovimento(ctx, ajuste.id, 'tentativa de estorno')).rejects.toThrow(/não se estorna/);
    await regra(cancelarInventario(ctx, inv.id, 'depois de aprovado'), 'RN-29');
  });

  it('RN-29 sobra vira lote novo com a mesma origem; estoque mexido depois da abertura exige recontar', async () => {
    const { lote } = await loteNoArmazem('300', 'Q-01');
    const inv = await abrirInventario(ctx, { localIds: [LOCAL['Q-01']!] });
    await expect(abrirInventario(ctx, { localIds: [LOCAL['Q-01']!] })).rejects.toThrow(/já está aberto/);
    const det = await obterInventario(ctx, inv.id);
    await registrarContagem(ctx, inv.id, det.itens.map((i) => ({ itemId: i.id, qtdContada: i.loteId === lote.id ? '305' : i.qtdSistema.toString() })));
    const r = await aprovarInventario(ctx, inv.id);
    const novo = await dono.lote.findFirstOrThrow({ where: { movimentoId: r.ajustes[0]! }, include: { talhoes: true, certificados: true } });
    expect(q(novo.quantidade)).toBe('5.000');
    expect(novo.talhoes.map((t) => t.talhaoId)).toEqual([T1]);
    expect(novo.certificados).toHaveLength(1); // RFA herdado do lote contado
    expect(await noLocal(novo.id)).toEqual({ 'Q-01': '5.000' });

    const inv2 = await abrirInventario(ctx, { localIds: [LOCAL['Q-01']!] });
    const det2 = await obterInventario(ctx, inv2.id);
    await registrarContagem(ctx, inv2.id, det2.itens.map((i) => ({ itemId: i.id, qtdContada: i.loteId === lote.id ? '290' : i.qtdSistema.toString() })));
    await removerEntreLocais(ctx, { loteId: lote.id, localOrigemId: LOCAL['Q-01']!, localDestinoId: LOCAL['Q-02']!, quantidade: '1' });
    await regra(aprovarInventario(ctx, inv2.id), 'RN-29');
    await cancelarInventario(ctx, inv2.id, 'estoque mexido durante a contagem');
  });

  it('RN-22 inventário de uma empresa não existe para a outra', async () => {
    const inv = await abrirInventario(ctx, { localIds: [LOCAL['Q-02']!] });
    await expect(obterInventario(ctxBeta, inv.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(aprovarInventario(ctxBeta, inv.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await cancelarInventario(ctx, inv.id, 'teste de isolamento');
  });
});
