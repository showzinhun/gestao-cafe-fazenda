import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, lancarResultados, registrarCarga } from '@/servicos/movimentos';
import { buscar, consultarEstoque, detalheMovimento, listarCargas, listarMovimentos, lotesParaEntrada, rastrearLote, type NoRastreio } from '@/servicos/consultas';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const ALFA = SEED.empresas.alfa.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[0].id, perfil: 'ADMIN_EMPRESA' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: SEED.usuarios[2].id, perfil: 'ADMIN_EMPRESA' };
const NS = SEED.fazendas.find((f) => f.codigo === 'NS')!.id;
const T1 = SEED.talhoes.find((t) => t.codigo === 'T1')!.id;
const T2 = SEED.talhoes.find((t) => t.codigo === 'T2')!.id;

let E: Record<string, string>;
const mapa: Record<string, Record<string, string>> = {};
const cadeia: Record<string, string> = {};

beforeAll(async () => {
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
  for (const r of ['tipos-cafe', 'peneiras', 'locais', 'certificados', 'safras'] as const)
    mapa[r] = Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  const safraId = mapa.safras!['2025/26']!;
  const c1 = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId, tipoCafeId: mapa['tipos-cafe']!.NAT!, quantidade: '40' });
  const c2 = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T2, safraId, tipoCafeId: mapa['tipos-cafe']!.NAT!, quantidade: '20' });
  cadeia.EF1 = c1.lote.id;
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: mapa.locais!['TE-01'], entradas: [{ loteId: c1.lote.id, quantidade: '40' }, { loteId: c2.lote.id, quantidade: '20' }] });
  cadeia.TE = te.movimento.id;
  const { lotes: [lte] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '0.9' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: mapa.locais!['TU-01'], entradas: [{ loteId: lte!.id, quantidade: '54' }] });
  const { lotes: [ltu] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: mapa.locais!['Q-01'], entradas: [{ loteId: ltu!.id, quantidade: '54' }] });
  const { lotes: [lar] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '720', peneiraId: mapa.peneiras!['16'] }] } });
  cadeia.AR = lar!.id;
  cadeia.ARcodigo = lar!.codigo;
});
afterAll(async () => prisma.$disconnect());

const codigos = (n: NoRastreio): string[] => [n.lote.codigo, ...n.filhos.flatMap(codigos)];

describe('consultas das telas da Fase 3', () => {
  it('rastreabilidade para cima chega às cargas de T1 e T2, com os talhões para o mapa', async () => {
    const r = await rastrearLote(ctx, cadeia.AR!, 'cima');
    const todos = codigos(r.arvore);
    expect(todos.filter((c) => c.startsWith('EF-'))).toHaveLength(2);
    expect(r.origens.map((o) => [o.codigo, o.percentual])).toEqual([['T1', '0.6667'], ['T2', '0.3333']]);
    expect(r.origens[0]!.geometria).toBeTruthy();
  });

  it('café e perda: cada lote rastreia só as entradas do seu tipo (D-02)', async () => {
    const safraId = mapa.safras!['2025/26']!;
    const { lote: ef } = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId, tipoCafeId: mapa['tipos-cafe']!.NAT!, quantidade: '10' });
    const ld = await abrirMovimento(ctx, { etapaId: E.LAVADOR!, entradas: [{ loteId: ef.id, quantidade: '10' }] });
    const r = await lancarResultados(ctx, ld.movimento.id, { parametros: { modelo: 'PERCENTUAL_POR_TIPO', resultados: [{ tipoCafeId: mapa['tipos-cafe']!.CD!, percentual: '0.5' }, { tipoCafeId: mapa['tipos-cafe']!.BOI!, percentual: '0.5' }] } });
    const [cd, boi] = [r.lotes.find((l) => l.tipoCafeId === mapa['tipos-cafe']!.CD)!, r.lotes.find((l) => l.tipoCafeId === mapa['tipos-cafe']!.BOI)!];
    const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: mapa.locais!['TE-01'], entradas: [{ loteId: cd.id, quantidade: '5' }, { loteId: boi.id, quantidade: '5' }] });
    const rt = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
    const teCd = rt.lotes.find((l) => l.tipoCafeId === mapa['tipos-cafe']!.CD)!;
    const cima = codigos((await rastrearLote(ctx, teCd.id, 'cima')).arvore);
    expect(cima).toContain(cd.codigo);
    expect(cima).not.toContain(boi.codigo);
    const baixo = codigos((await rastrearLote(ctx, boi.id, 'baixo')).arvore);
    expect(baixo).not.toContain(teCd.codigo);
  });

  it('rastreabilidade para baixo vai da carga até o lote do armazém', async () => {
    const r = await rastrearLote(ctx, cadeia.EF1!, 'baixo');
    expect(codigos(r.arvore)).toContain(cadeia.ARcodigo);
    expect(r.arvore.filhos[0]!.quantidadeLigacao).toBe('40.000');
  });

  it('estoque filtra por certificado, peneira e local; totais em kg', async () => {
    const com = await consultarEstoque(ctx, { certificadoId: mapa.certificados!.RFA, peneiraId: mapa.peneiras!['16'], localId: mapa.locais!['Q-01'] });
    const l = com.lotes.find((x) => x.id === cadeia.AR)!;
    expect([l.saldo, l.certificados, l.locais.map((x) => x.codigo)]).toEqual(['720.000', ['RFA'], ['Q-01']]);
    expect((await consultarEstoque(ctx, { certificadoId: mapa.certificados!.AAA })).lotes.find((x) => x.id === cadeia.AR)).toBeUndefined();
    expect((await consultarEstoque(ctx, { busca: cadeia.ARcodigo })).lotes).toHaveLength(1);
  });

  it('detalhe do movimento traz linha do tempo, entradas, composição e histórico', async () => {
    const d = await detalheMovimento(ctx, cadeia.TE!);
    expect(d.linhaDoTempo.map((x) => [x.etapa, x.feita])).toEqual([['Entrada', true], ['Resultado', true]]);
    expect(d.linhaDoTempo[1]!.quem).toBe('Ana Admin');
    expect(d.entradas).toHaveLength(2);
    expect(d.composicao.map((c) => c.talhao)).toEqual(['T1', 'T2']);
    expect(d.historico.map((h) => h.acao)).toEqual(['CRIAR', 'RESULTADO']);
    const lista = await listarMovimentos(ctx, E.TERREIRO!, { status: 'PROCESSADO' });
    expect(lista.movimentos.some((m) => m.id === cadeia.TE)).toBe(true);
  });

  it('lotes para entrada respeitam a transição (RN-16) e o saldo livre', async () => {
    const paraTulha = await lotesParaEntrada(ctx, E.TULHA!);
    expect(paraTulha.every((l) => ['Terreiro', 'Secador'].includes(l.etapa))).toBe(true);
    const paraServico = await lotesParaEntrada(ctx, E.SERVICO!);
    expect(paraServico.find((l) => l.id === cadeia.AR)?.locais.map((x) => x.codigo)).toEqual(['Q-01']);
  });

  it('busca por código de lote, nº de movimento e talhão; cargas do dia', async () => {
    const d = await detalheMovimento(ctx, cadeia.TE!);
    expect((await buscar(ctx, `TE#${d.numero}`)).movimentos.map((m) => m.id)).toEqual([cadeia.TE]);
    expect((await buscar(ctx, 'T2')).lotes.length).toBeGreaterThan(0);
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    expect((await listarCargas(ctx, { data: hoje })).length).toBeGreaterThanOrEqual(2);
  });

  it('RN-22 consultas não atravessam empresas', async () => {
    await expect(rastrearLote(ctxBeta, cadeia.AR!, 'cima')).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(detalheMovimento(ctxBeta, cadeia.TE!)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect((await consultarEstoque(ctxBeta)).lotes).toEqual([]);
    expect((await buscar(ctxBeta, cadeia.ARcodigo!)).lotes).toEqual([]);
  });
});
