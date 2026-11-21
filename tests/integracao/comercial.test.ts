import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, estornarMovimento, lancarResultados, registrarCarga } from '@/servicos/movimentos';
import { obterLote } from '@/servicos/lotes';
import { cancelarReserva } from '@/servicos/reservas';
import { assinarContrato, criarContrato, obterContrato, painelComercial, registrarAmostra, registrarFixacao, reservarParaContrato, retornoAmostra } from '@/servicos/contratos';
import { adicionarNota, alterarLogistica, criarEmbarque, desfazerProgramacao, finalizarEmbarque, obterEmbarque, programarEmbarque, reabrirEmbarque, registrarCarregamento } from '@/servicos/embarques';
import { listarAlertas } from '@/servicos/alertas';
import { gerarRomaneioPdf } from '@/lib/pdf-romaneio';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const u = (email: string) => SEED.usuarios.find((x) => x.email === email)!.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: u('admin@alfa.exemplo'), perfil: 'ADMIN_EMPRESA' };
const operador: Contexto = { empresaId: ALFA, usuarioId: u('operador@alfa.exemplo'), perfil: 'OPERADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: u('admin@beta.exemplo'), perfil: 'ADMIN_EMPRESA' };
const CLIENTE = SEED.parceiros.find((p) => p.nome.startsWith('Exportadora'))!.id;
const NS = SEED.fazendas[0].id;
const T1 = SEED.talhoes[0].id;

let E: Record<string, string>;
let L: Record<string, string>;
let P: Record<string, string>;
let C: Record<string, string>;
let SAFRA: string;
let NAT: string;

async function regra(p: Promise<unknown>, codigo: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroRegra);
  expect((e as ErroRegra).codigo).toBe(codigo);
  return e as ErroRegra;
}

beforeAll(async () => {
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  const m = async (r: 'locais' | 'peneiras' | 'certificados' | 'safras' | 'tipos-cafe') => Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  [L, P, C] = [await m('locais'), await m('peneiras'), await m('certificados')];
  SAFRA = (await m('safras'))['2025/26']!;
  NAT = (await m('tipos-cafe')).NAT!;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

/** Lote no armazém (RFA herdado da NS), com a peneira indicada. */
async function loteAR(kg: string, peneira = '17') {
  const { lote: ef } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: NAT, quantidade: '10' });
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: L['TE-01'], entradas: [{ loteId: ef.id, quantidade: '10' }] });
  const { lotes: [a] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: L['TU-01'], entradas: [{ loteId: a!.id, quantidade: '10' }] });
  const { lotes: [b] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: L['Q-01'], entradas: [{ loteId: b!.id, quantidade: '10' }] });
  const { lotes: [c] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: kg, peneiraId: P[peneira] }] } });
  return c!;
}
const contrato = async (extra: Partial<Parameters<typeof criarContrato>[1]> = {}, assinar = true) => {
  const c = await criarContrato(ctx, { clienteId: CLIENTE, quantidadeSacas: '15', tipoPreco: 'FIXO', precoPorSaca: '1800,00', certificadoIds: [C.RFA!], exigeEudr: true, ...extra });
  if (assinar) await assinarContrato(ctx, c.id);
  return c;
};

describe('passo 10 do §15: contrato e reserva', () => {
  let ar: { id: string; codigo: string };
  let ct: { id: string; codigo: string };

  it('contrato nasce rascunho (não reserva), assina e reserva 900 kg → EM_EXECUCAO; saldo 1.200 e reserva 900', async () => {
    ar = await loteAR('1200');
    ct = await contrato({}, false);
    expect(ct.codigo).toMatch(/^CT-\d{4}-\d{4}$/);
    await expect(reservarParaContrato(ctx, ct.id, [{ loteId: ar.id, quantidade: '900' }])).rejects.toThrow(/rascunho/);
    await assinarContrato(ctx, ct.id);
    const r = await reservarParaContrato(ctx, ct.id, [{ loteId: ar.id, quantidade: '900' }]);
    expect(r.avisos[0]).toMatch(/Sem amostra/);
    const c = await obterContrato(ctx, ct.id);
    expect([c.status, c.saldos.kg, c.saldos.reservado, c.saldos.aReservar]).toEqual(['EM_EXECUCAO', '900.000', '900.000', '0.000']);
    const l = await obterLote(ctx, ar.id);
    expect([l.saldo, l.quantidadeReservada.toString()]).toEqual(['1200.000', '900']);
  });

  it('RN-07 mais 400 kg para outro contrato é bloqueado; o contrato não reserva além do saldo', async () => {
    const outro = await contrato();
    await regra(reservarParaContrato(ctx, outro.id, [{ loteId: ar.id, quantidade: '400' }]), 'RN-07');
    const extra = await loteAR('500');
    await regra(reservarParaContrato(ctx, ct.id, [{ loteId: extra.id, quantidade: '1' }]), 'RN-07');
  });

  it('RN-17 lote sem o certificado exigido ou abaixo da peneira mínima não reserva', async () => {
    const aaa = await contrato({ certificadoIds: [C.RFA!, C.AAA!] });
    await regra(reservarParaContrato(ctx, aaa.id, [{ loteId: ar.id, quantidade: '10' }]), 'RN-17');
    const p16 = await contrato({ peneiraMinId: P['16'] });
    const miudo = await loteAR('100', '15');
    await regra(reservarParaContrato(ctx, p16.id, [{ loteId: miudo.id, quantidade: '10' }]), 'RN-17');
    await expect(reservarParaContrato(ctx, p16.id, [{ loteId: ar.id, quantidade: '10' }])).resolves.toBeTruthy();
  });

  it('amostra: a aprovação é informativa e aparece ao reservar', async () => {
    const lote = await loteAR('300');
    const a = await registrarAmostra(ctx, { clienteId: CLIENTE, loteId: lote.id, pesoG: 300, dataEnvio: '2026-06-01' });
    await retornoAmostra(ctx, a.id, { status: 'REPROVADA', comentario: 'bebida dura' });
    const c = await contrato({ quantidadeSacas: '5' });
    const r = await reservarParaContrato(ctx, c.id, [{ loteId: lote.id, quantidade: '100' }]);
    expect(r.avisos).toEqual([`Amostra do lote ${lote.codigo}: reprovada.`]);
  });

  it('fixação de preço (A_FIXAR): sacas fixadas, preço médio e limite da quantidade', async () => {
    const c = await contrato({ tipoPreco: 'A_FIXAR', precoPorSaca: null, diferencial: '-15', referenciaBolsa: 'KC Mar/27', quantidadeSacas: '20' });
    await registrarFixacao(ctx, c.id, { data: '2026-06-01', sacas: '5', precoPorSaca: '1.800,00' });
    await registrarFixacao(ctx, c.id, { data: '2026-06-10', sacas: '10', precoPorSaca: '1900' });
    await expect(registrarFixacao(ctx, c.id, { data: '2026-06-11', sacas: '6', precoPorSaca: '1900' })).rejects.toThrow(/passam da quantidade/);
    expect((await obterContrato(ctx, c.id)).resumoFixacoes).toEqual({ fixadas: '15', precoMedio: '1866.67', aFixar: '5' });
  });
});

describe('passos 12 e 15 do §15: embarque em etapas', () => {
  let ar: { id: string; codigo: string };
  let ct: { id: string; codigo: string };
  let eb: string;

  beforeAll(async () => {
    ar = await loteAR('1200');
    ct = await contrato();
    await reservarParaContrato(ctx, ct.id, [{ loteId: ar.id, quantidade: '900' }]);
  });

  it('RN-26 programar puxa a reserva do contrato para o embarque; desfazer libera', async () => {
    eb = (await criarEmbarque(ctx, { contratoId: ct.id, dataVenda: '2026-06-20' })).id;
    await programarEmbarque(ctx, eb);
    let e = await obterEmbarque(ctx, eb);
    expect([e.programadoKg, e.reservasDoContrato.length]).toEqual(['900.000', 0]);
    expect((await dono.reserva.findMany({ where: { loteId: ar.id }, orderBy: { criadoEm: 'asc' } })).map((r) => [r.finalidade, r.status])).toEqual([['CONTRATO', 'CONSUMIDA'], ['EMBARQUE', 'ATIVA']]);
    await desfazerProgramacao(ctx, eb, 'troca de caminhão');
    expect((await obterLote(ctx, ar.id)).saldoLivre).toBe('1200.000');
    // Volta a programar com o lote livre, informado na mão (mesmas validações do contrato).
    await programarEmbarque(ctx, eb, [{ loteId: ar.id, quantidade: '900' }]);
    e = await obterEmbarque(ctx, eb);
    expect(e.programadoKg).toBe('900.000');
  });

  it('RN-27 sem carregamento não finaliza; 15.905 − 15.000 = 905 kg (0,56%) exige motivo', async () => {
    await regra(finalizarEmbarque(ctx, eb), 'RN-27');
    const carga = { placa: 'ABC1D23', lacres: ['L-001', 'L-002'], pesoBruto: '15.905', tara: '15.000', motoristaId: null };
    await regra(registrarCarregamento(ctx, eb, { ...carga, pesoBruto: '15905', tara: '15000' }), 'RN-27');
    const r = await registrarCarregamento(ctx, eb, { ...carga, pesoBruto: '15905', tara: '15000', motivoDiferenca: 'umidade da sacaria' });
    expect([r.liquido, r.diferenca, r.perc]).toEqual(['905.000', '5.000', '0.005556']);
    const e = await obterEmbarque(ctx, eb);
    expect([e.kgEntradas, e.carregamento?.lacres]).toEqual(['900', ['L-001', 'L-002']]);
  });

  it('passo 12: notas, finalizar → contrato CONCLUIDO; lote AR parcial com saldo 300; reservas consumidas; romaneio', async () => {
    await adicionarNota(ctx, eb, { numeroNota: '1234', serie: '1', dataEmissao: '2026-06-20', qtdKg: '900', chaveNfe: '3526 0611 2223 3300 0181 5500 1000 0012 3410 0000 1234' });
    const r = await finalizarEmbarque(ctx, eb);
    expect([r.movimento.status, r.statusContrato]).toEqual(['FINALIZADO', 'CONCLUIDO']);
    const l = await obterLote(ctx, ar.id);
    expect([l.status, l.saldo]).toEqual(['PARCIAL', '300.000']);
    expect((await dono.reserva.findMany({ where: { loteId: ar.id } })).every((x) => x.status !== 'ATIVA')).toBe(true);
    const e = await obterEmbarque(ctx, eb);
    expect(e.notas[0]).toMatchObject({ numero: '1234', sacas: '15' });
    const pdf = await gerarRomaneioPdf('Alfa Agro', e);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('passo 13 e RN-14: estornar o embarque é bloqueado; só o admin reabre; com DDS não reabre', async () => {
    await regra(estornarMovimento(ctx, eb, 'teste de estorno'), 'RN-14');
    await expect(adicionarNota(ctx, eb, { numeroNota: '9', dataEmissao: '2026-06-21', qtdKg: '1' })).rejects.toThrow(/RN-14/);
    await regra(reabrirEmbarque(operador, eb, 'conferência'), 'RN-14');
    await reabrirEmbarque(ctx, eb, 'correção da nota');
    expect((await obterContrato(ctx, ct.id)).status).toBe('EM_EXECUCAO');
    await finalizarEmbarque(ctx, eb);
    await alterarLogistica(ctx, eb, { numeroDds: 'DDS-FICTICIA-0001' });
    await regra(reabrirEmbarque(ctx, eb, 'depois da DDS'), 'RN-14');
  });

  it('permissões: operador não programa embarque nem reserva para contrato', async () => {
    await expect(criarEmbarque(operador, { contratoId: ct.id })).rejects.toBeInstanceOf(ErroPermissao);
    await expect(reservarParaContrato(operador, ct.id, [{ loteId: ar.id, quantidade: '1' }])).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe('painel comercial e alertas', () => {
  it('alerta CONTRATO_PRAZO quando faltam até 15 dias e há saldo; estoque por certificado e peneira', async () => {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const fim = new Date(Date.parse(`${hoje}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10);
    const c = await contrato({ prazoEmbarqueInicio: hoje, prazoEmbarqueFim: fim });
    const p = await painelComercial(ctx);
    expect(p.aEmbarcar.find((x) => x.id === c.id)).toMatchObject({ dias: 10, saldo: '900.000' });
    expect((await listarAlertas(ctx)).find((a) => a.chave === `CONTRATO_PRAZO:${c.id}`)!.mensagem).toMatch(/faltam 10 dia/);
    expect(p.estoque.some((g) => g.certificados === 'RFA' && g.peneira === '17')).toBe(true);
    expect(p.porStatus.CONCLUIDO).toBeGreaterThanOrEqual(1);
  });

  it('cancelar reserva de contrato libera o lote', async () => {
    const l = await loteAR('200');
    const c = await contrato({ quantidadeSacas: '3' });
    const { reservas } = await reservarParaContrato(ctx, c.id, [{ loteId: l.id, quantidade: '150' }]);
    await cancelarReserva(ctx, reservas[0]!.id, 'cliente mudou o lote');
    expect((await obterLote(ctx, l.id)).saldoLivre).toBe('200.000');
  });

  it('RN-22 contratos e embarques não atravessam empresas', async () => {
    const c = await contrato();
    await expect(obterContrato(ctxBeta, c.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(criarEmbarque(ctxBeta, { contratoId: c.id })).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect((await painelComercial(ctxBeta)).aEmbarcar).toEqual([]);
  });
});
