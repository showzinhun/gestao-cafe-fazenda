import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { criar, listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, registrarCarga } from '@/servicos/movimentos';
import { curvaSecagem, movimentosEmSecagem, painelSecagem, registrarLeituras } from '@/servicos/secagem';
import { listarAlertas, marcarAlertaLido } from '@/servicos/alertas';
import { detalheMovimento } from '@/servicos/consultas';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const u = (email: string) => SEED.usuarios.find((x) => x.email === email)!.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: u('admin@alfa.exemplo'), perfil: 'ADMIN_EMPRESA' };
const apontador: Contexto = { empresaId: ALFA, usuarioId: u('apontador@alfa.exemplo'), perfil: 'APONTADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: u('admin@beta.exemplo'), perfil: 'ADMIN_EMPRESA' };
const NS = SEED.fazendas[0].id;
const T1 = SEED.talhoes[0].id;

let E: Record<string, string>;
let L: Record<string, string>;
let SAFRA: string;
let NAT: string;

beforeAll(async () => {
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  L = Object.fromEntries(((await listar(ctx, 'locais')) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  SAFRA = ((await listar(ctx, 'safras')) as { id: string; codigo: string }[]).find((s) => s.codigo === '2025/26')!.id;
  NAT = ((await listar(ctx, 'tipos-cafe')) as { id: string; codigo: string }[]).find((t) => t.codigo === 'NAT')!.id;
  // Terreiro só deste teste: não mexe na ocupação do TE-01 que outros testes conferem.
  const { registro } = await criar(ctx, 'locais', { etapaId: E.TERREIRO, codigo: 'TE-SEC', nome: 'Terreiro do teste de secagem', capacidade: '150', unidadeCapacidade: 'MEDIDA' });
  L['TE-SEC'] = registro.id as string;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

async function noTerreiro(medidas: string) {
  const { lote } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: NAT, quantidade: medidas });
  return abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: L['TE-SEC'], entradas: [{ loteId: lote.id, quantidade: medidas }] });
}
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe('painel de secagem (§7, passo 5 do §15)', () => {
  let movId: string;
  const leituras = [55, 40, 28, 18].map((umidade, i) => ({ id: randomUUID(), dataHora: horasAtras(48 - i * 12), umidade: String(umidade) }));

  it('passo 5: leituras 55 → 40 → 28 → 18 pelo celular; previsão de ponto com 3 ou mais leituras', async () => {
    const te = await noTerreiro('60');
    movId = te.movimento.id;
    expect((await movimentosEmSecagem(apontador)).map((m) => m.id)).toContain(movId);
    const r = await registrarLeituras(apontador, { dispositivoId: 'celular-1', leituras: leituras.map((l) => ({ ...l, movimentoId: movId, temperaturaMassa: '38,5' })) });
    expect(r.map((x) => x.situacao)).toEqual(['gravado', 'gravado', 'gravado', 'gravado']);
    const c = await curvaSecagem(ctx, movId);
    expect(c.leituras.map((l) => l.umidade)).toEqual(['55', '40', '28', '18']);
    expect([c.metaMin, c.metaMax]).toEqual(['11', '12.5']);
    expect(c.previsao!.horas).toBeGreaterThan(0);
    expect((await listarAlertas(ctx)).some((a) => a.chave === `PONTO_SECAGEM:${movId}`)).toBe(false);
  });

  it('RN-23 reenviar as mesmas leituras não duplica', async () => {
    const r = await registrarLeituras(apontador, { leituras: leituras.map((l) => ({ ...l, movimentoId: movId })) });
    expect(r.every((x) => x.situacao === 'repetido')).toBe(true);
    expect(await dono.leituraSecagem.count({ where: { movimentoId: movId } })).toBe(4);
  });

  it('passo 5: 12,0% entra na meta 11–12,5 → alerta PONTO_SECAGEM e cartão "no ponto"; sugere a umidade final', async () => {
    await registrarLeituras(apontador, { leituras: [{ id: randomUUID(), movimentoId: movId, dataHora: horasAtras(0.5), umidade: '12,0' }] });
    const alertas = await listarAlertas(ctx, { naoLidos: true });
    const ponto = alertas.find((a) => a.chave === `PONTO_SECAGEM:${movId}`)!;
    expect(ponto.tipo).toBe('PONTO_SECAGEM');
    expect(ponto.mensagem).toMatch(/12%.*meta 11–12,5%/);
    // Outra leitura na meta não repete o alerta.
    await registrarLeituras(apontador, { leituras: [{ id: randomUUID(), movimentoId: movId, dataHora: horasAtras(0.2), umidade: '11,8' }] });
    expect((await listarAlertas(ctx)).filter((a) => a.chave === `PONTO_SECAGEM:${movId}`)).toHaveLength(1);
    const painel = await painelSecagem(ctx);
    const cartao = painel.cartoes.find((c) => c.movimentos.some((m) => m.id === movId))!;
    expect(cartao.local).toMatch(/^TE-SEC/);
    expect(cartao.movimentos.find((m) => m.id === movId)).toMatchObject({ situacao: 'NO_PONTO', ultimaUmidade: '11.8', tendencia: 'caindo' });
    expect((await detalheMovimento(ctx, movId)).ultimaUmidade).toBe('11.8');
    await marcarAlertaLido(ctx, ponto.id);
    expect((await listarAlertas(ctx, { naoLidos: true })).some((a) => a.id === ponto.id)).toBe(false);
  });

  it('leitura só em etapa que monitora secagem, com movimento aberto e sem data futura', async () => {
    const { lote } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: NAT, quantidade: '5' });
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: lote.id, quantidade: '5' }] });
    const [r1, r2, r3] = await registrarLeituras(ctx, {
      leituras: [
        { id: randomUUID(), movimentoId: ld.movimento.id, dataHora: horasAtras(1), umidade: '50' },
        { id: randomUUID(), movimentoId: movId, dataHora: new Date(Date.now() + 86_400_000).toISOString(), umidade: '20' },
        { id: randomUUID(), movimentoId: movId, dataHora: horasAtras(1), umidade: '120' },
      ],
    });
    expect([r1!.situacao, r2!.situacao, r3!.situacao]).toEqual(['erro', 'erro', 'erro']);
    expect((r1 as { mensagem: string }).mensagem).toMatch(/não monitora secagem/);
  });

  it('SECAGEM_LONGA: movimento há mais de 5 dias gera alerta e cartão de atenção', async () => {
    const te = await noTerreiro('5');
    await dono.movimento.update({ where: { id: te.movimento.id }, data: { dataEntrada: new Date(Date.now() - 7 * 86_400_000) } });
    const painel = await painelSecagem(ctx);
    const m = painel.cartoes.flatMap((c) => c.movimentos).find((x) => x.id === te.movimento.id)!;
    expect(m.situacao).toBe('ATENCAO');
    expect((await listarAlertas(ctx)).some((a) => a.chave === `SECAGEM_LONGA:${te.movimento.id}`)).toBe(true);
  });

  it('CAPACIDADE: entrada que passa de 100% do local vai para a central de alertas', async () => {
    const r = await noTerreiro('200');
    expect(r.alertas.map((a) => a.codigo)).toEqual(['RN-24']);
    expect((await listarAlertas(ctx)).some((a) => a.tipo === 'CAPACIDADE' && a.entidadeId === r.movimento.id)).toBe(true);
  });

  it('RN-22 leituras e alertas não atravessam empresas', async () => {
    expect(await listarAlertas(ctxBeta)).toEqual([]);
    await expect(curvaSecagem(ctxBeta, movId)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect((await painelSecagem(ctxBeta)).cartoes.flatMap((c) => c.movimentos)).toEqual([]);
    const [r] = await registrarLeituras(ctxBeta, { leituras: [{ id: randomUUID(), movimentoId: movId, dataHora: horasAtras(1), umidade: '12' }] });
    expect(r!.situacao).toBe('erro');
  });
});
