import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { alterar, criar, definirAtivo, listar as listarBruto, obter, RECURSOS } from '@/servicos/cadastros';
import { obterFluxo, salvarEtapa, salvarTransicoes } from '@/servicos/fluxo';
import { criarEmpresa } from '@/servicos/plataforma';
import { adicionarUsuario, alterarUsuario, definirPermissao, listarUsuarios } from '@/servicos/usuarios';
import { permissoesEfetivas } from '@/servicos/acesso';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { retangulo, SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const BETA = SEED.empresas.beta.id;
const ctxAlfa: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[0].id, perfil: 'ADMIN_EMPRESA' };
const ctxBeta: Contexto = { empresaId: BETA, usuarioId: SEED.usuarios[2].id, perfil: 'ADMIN_EMPRESA' };

type Linha = { id: string; codigo?: string } & Record<string, unknown>;
const listar = async (...a: Parameters<typeof listarBruto>) => (await listarBruto(...a)) as Linha[];

afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

const etapaDoFluxo = async (ctx: Contexto, codigo: string) => (await obterFluxo(ctx)).etapas.find((e) => e.codigo === codigo)!;
const entradaDe = (e: Awaited<ReturnType<typeof etapaDoFluxo>>) => ({
  codigo: e.codigo, nome: e.nome, classe: e.classe, prefixoLote: e.prefixoLote, unidadeEntrada: e.unidadeEntrada, unidadeSaida: e.unidadeSaida,
  modeloResultado: e.modeloResultado, monitoraSecagem: e.monitoraSecagem, umidadeMetaMin: e.umidadeMetaMin, umidadeMetaMax: e.umidadeMetaMax,
  exigeLocal: e.exigeLocal, tiposResultado: e.tiposResultado,
});

describe('cenário de preparação (§15, Fase 1): empresa com "Via úmida completa", fluxo editado, NS, T1 e T2', () => {
  let ctx: Contexto;

  beforeAll(async () => {
    const empresa = await criarEmpresa(dono, {
      nome: 'Gama Cafés (fictícia)', modelo: 'VIA_UMIDA',
      admin: { nome: 'Gabi Gama', email: 'admin@gama.exemplo', senha: 'senha-de-teste-123' },
    });
    const u = await dono.usuario.findUniqueOrThrow({ where: { email: 'admin@gama.exemplo' } });
    ctx = { empresaId: empresa.id, usuarioId: u.id, perfil: 'ADMIN_EMPRESA' };
  });

  it('a empresa nasce com o modelo copiado, sem pendências, e cadastros básicos', async () => {
    const f = await obterFluxo(ctx);
    expect(f.etapas.map((e) => e.prefixoLote)).toEqual(['EF', 'LD', 'TE', 'SE', 'TU', 'AR', 'GS', 'EB']);
    expect(f.transicoes.length).toBeGreaterThanOrEqual(12);
    expect(f.pendencias).toEqual([]);
    expect((await listar(ctx, 'tipos-cafe')).map((t) => t.codigo)).toEqual(expect.arrayContaining(['VER', 'BOI', 'CD']));
    expect((await listar(ctx, 'turnos')).length).toBe(3);
    const lavador = f.etapas.find((e) => e.codigo === 'LAVADOR')!;
    expect(lavador.tiposResultado.length).toBe(3);
  });

  it('o fluxo é da empresa: editar não afeta o modelo nem outras empresas', async () => {
    const te = await etapaDoFluxo(ctx, 'TERREIRO');
    await salvarEtapa(ctx, te.id, { ...entradaDe(te), umidadeMetaMin: '10,5', umidadeMetaMax: '12' });
    expect((await etapaDoFluxo(ctx, 'TERREIRO')).umidadeMetaMin).toBe('10.5');
    expect((await etapaDoFluxo(ctxAlfa, 'TERREIRO')).umidadeMetaMin).toBe('11');
  });

  it('§5.2 transição impossível não é salva (embarque não transfere; medidas não entram no serviço)', async () => {
    const f = await obterFluxo(ctx);
    const id = (c: string) => f.etapas.find((e) => e.codigo === c)!.id;
    const pares = f.transicoes.filter((t) => t.fazendaId === null).map((t) => [t.origem, t.destino] as [string, string]);
    await expect(salvarTransicoes(ctx, { fazendaId: null, pares: [...pares, [id('EMBARQUE'), id('ARMAZEM')]] })).rejects.toBeInstanceOf(ErroValidacao);
    await expect(salvarTransicoes(ctx, { fazendaId: null, pares: [...pares, [id('TULHA'), id('SERVICO')]] })).rejects.toThrow(/recebe em kg/);
    expect((await obterFluxo(ctx)).transicoes.length).toBe(f.transicoes.length);
  });

  it('§5.2 sem caminho até uma etapa vira pendência, não bloqueio', async () => {
    const f = await obterFluxo(ctx);
    const tulha = f.etapas.find((e) => e.codigo === 'TULHA')!.id;
    const pares = f.transicoes.filter((t) => t.fazendaId === null && t.destino !== tulha).map((t) => [t.origem, t.destino] as [string, string]);
    const r = await salvarTransicoes(ctx, { fazendaId: null, pares });
    expect(r.pendencias.map((p) => p.etapa)).toContain('Tulha');
    await salvarTransicoes(ctx, { fazendaId: null, pares: f.transicoes.filter((t) => t.fazendaId === null).map((t) => [t.origem, t.destino]) });
    expect((await obterFluxo(ctx)).pendencias).toEqual([]);
  });

  it('§5.2 não deixa a empresa sem etapa ativa de colheita, estoque ou saída', async () => {
    const eb = await etapaDoFluxo(ctx, 'EMBARQUE');
    const { definirEtapaAtiva } = await import('@/servicos/fluxo');
    await expect(definirEtapaAtiva(ctx, eb.id, false)).rejects.toBeInstanceOf(ErroValidacao);
  });

  it('§5.2 prefixo do lote é único na empresa', async () => {
    const se = await etapaDoFluxo(ctx, 'SECADOR');
    await expect(salvarEtapa(ctx, se.id, { ...entradaDe(se), prefixoLote: 'TE' })).rejects.toThrow(/prefixo TE/);
  });

  it('cadastra o produtor, a fazenda NS e os talhões T1 e T2 com polígono', async () => {
    const { registro: produtor } = await criar(ctx, 'parceiros', { tipoPessoa: 'F', nome: 'José Nascente (fictício)', cpfCnpj: '123.456.789-09', papeis: ['PRODUTOR'] });
    const { registro: ns } = await criar(ctx, 'fazendas', { codigo: 'NS', nome: 'Fazenda Nascente', produtorId: produtor.id, municipio: 'Patrocínio', uf: 'MG', car: 'MG-FICTICIO-NS' });
    const t1 = await criar(ctx, 'talhoes', { fazendaId: ns.id, codigo: 'T1', nome: 'Talhão 1', areaHaInformada: '12', geometria: retangulo(-46.99, -18.94, 400, 300) });
    const t2 = await criar(ctx, 'talhoes', { fazendaId: ns.id, codigo: 'T2', nome: 'Talhão 2', areaHaInformada: '8', geometria: { type: 'Feature', properties: {}, geometry: retangulo(-46.99, -18.9435, 400, 200) } });
    expect(t1.avisos).toEqual([]);
    expect(new Decimal(String(t1.registro.areaHaCalculada)).toDecimalPlaces(0).toNumber()).toBe(12);
    expect(new Decimal(String(t2.registro.areaHaCalculada)).toDecimalPlaces(0).toNumber()).toBe(8);
    expect((await listar(ctx, 'talhoes', { filtro: { fazendaId: String(ns.id) } })).map((t) => t.codigo)).toEqual(['T1', 'T2']);
    const auditados = await dono.auditoria.count({ where: { empresaId: ctx.empresaId, entidade: { in: ['parceiro', 'fazenda', 'talhao'] } } });
    expect(auditados).toBeGreaterThanOrEqual(4);
  });

  it('talhão repetido na mesma fazenda e polígono inválido são recusados', async () => {
    const ns = (await listar(ctx, 'fazendas')).find((f) => f.codigo === 'NS')!;
    await expect(criar(ctx, 'talhoes', { fazendaId: ns.id, codigo: 'T1', nome: 'De novo' })).rejects.toBeInstanceOf(ErroValidacao);
    const laco = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
    await expect(criar(ctx, 'talhoes', { fazendaId: ns.id, codigo: 'T9', nome: 'Laço', geometria: laco })).rejects.toBeInstanceOf(ErroValidacao);
  });

  it('documento inválido e fazenda com produtor sem papel de produtor são recusados', async () => {
    await expect(criar(ctx, 'parceiros', { tipoPessoa: 'F', nome: 'Errado', cpfCnpj: '123.456.789-00', papeis: ['PRODUTOR'] })).rejects.toThrow(/CPF inválido/);
    const { registro: cliente } = await criar(ctx, 'parceiros', { tipoPessoa: 'J', nome: 'Cliente (fictício)', cpfCnpj: '11.444.777/0001-61', papeis: ['CLIENTE'] });
    await expect(criar(ctx, 'fazendas', { codigo: 'ZZ', nome: 'Sem produtor', produtorId: cliente.id })).rejects.toBeInstanceOf(ErroValidacao);
  });

  it('cadastro inativado não some (RN de não apagar) e volta a aparecer ao reativar', async () => {
    const t2 = (await listar(ctx, 'talhoes')).find((t) => t.codigo === 'T2')!;
    await definirAtivo(ctx, 'talhoes', t2.id, false);
    expect((await listar(ctx, 'talhoes')).map((t) => t.codigo)).not.toContain('T2');
    expect((await listar(ctx, 'talhoes', { incluirInativos: true })).map((t) => t.codigo)).toContain('T2');
    await definirAtivo(ctx, 'talhoes', t2.id, true);
  });

  it('preço de colheita: vigências sobrepostas no mesmo escopo são recusadas', async () => {
    const { registro: safra } = await criar(ctx, 'safras', { codigo: '2025/26', dataInicio: '2025-05-01', dataFim: '2026-04-30' });
    const ns = (await listar(ctx, 'fazendas')).find((f) => f.codigo === 'NS')!;
    const base = { safraId: safra.id, fazendaId: ns.id, tipoColheita: 'MANUAL', valorPorMedida: '12,00' };
    await criar(ctx, 'precos-colheita', { ...base, vigenciaInicio: '2025-05-01', vigenciaFim: '2025-07-31' });
    await expect(criar(ctx, 'precos-colheita', { ...base, vigenciaInicio: '2025-07-01' })).rejects.toThrow(/mesmo período/);
    await expect(criar(ctx, 'precos-colheita', { ...base, vigenciaInicio: '2025-08-01' })).resolves.toBeTruthy();
  });
});

describe('isolamento dos cadastros e do fluxo (RN-22)', () => {
  it.each(RECURSOS.map((r) => [r]))('RN-22 %s: a outra empresa não vê, não lê e não altera', async (recurso) => {
    const daBeta = await listar(ctxBeta, recurso, { incluirInativos: true });
    const daAlfa = await listar(ctxAlfa, recurso, { incluirInativos: true });
    const idsAlfa = new Set(daAlfa.map((r) => r.id));
    expect(daBeta.some((r) => idsAlfa.has(r.id))).toBe(false);
    const alvo = daBeta[0] ?? daAlfa[0];
    if (!alvo) return;
    const [dona, outra] = daBeta[0] ? [ctxBeta, ctxAlfa] : [ctxAlfa, ctxBeta];
    await expect(obter(outra, recurso, alvo.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(alterar(outra, recurso, alvo.id, {})).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(definirAtivo(outra, recurso, alvo.id, false)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(obter(dona, recurso, alvo.id)).resolves.toMatchObject({ id: alvo.id });
  });

  it('RN-22 fluxo: cada empresa vê só as próprias etapas e não usa etapa da outra', async () => {
    const a = await obterFluxo(ctxAlfa);
    const b = await obterFluxo(ctxBeta);
    expect(a.etapas.length).toBe(8);
    expect(b.etapas.length).toBe(4);
    const pares: [string, string][] = [[b.etapas[0]!.id, b.etapas[1]!.id]];
    await expect(salvarTransicoes(ctxAlfa, { fazendaId: null, pares })).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(salvarEtapa(ctxAlfa, b.etapas[0]!.id, entradaDe(b.etapas[0]!))).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });

  it('RN-22 usuários: a lista é da empresa e o vínculo de outra empresa dá 404', async () => {
    const emails = (await listarUsuarios(ctxAlfa)).map((u) => u.email);
    expect(emails).toContain('admin@alfa.exemplo');
    expect(emails).not.toContain('admin@beta.exemplo');
    await expect(alterarUsuario(ctxAlfa, SEED.usuarios[2].id, { perfil: 'CONSULTA', ativo: true, fazendaIds: [] })).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('usuários, acessos por fazenda e permissões', () => {
  const ctxOperador: Contexto = { empresaId: ALFA, usuarioId: SEED.usuarios[1].id, perfil: 'OPERADOR' };

  it('operador não configura o fluxo nem gerencia usuários (403)', async () => {
    const op = { ...ctxOperador, permissoes: await permissoesEfetivas(ctxOperador) };
    const te = await etapaDoFluxo(ctxAlfa, 'TERREIRO');
    await expect(salvarEtapa(op, te.id, entradaDe(te))).rejects.toBeInstanceOf(ErroPermissao);
    await expect(definirPermissao(op, { perfil: 'OPERADOR', permissao: 'cadastros.editar', permitido: true })).rejects.toBeInstanceOf(ErroPermissao);
  });

  it('a matriz da empresa liga e desliga permissões do perfil, e o servidor respeita', async () => {
    await definirPermissao(ctxAlfa, { perfil: 'OPERADOR', permissao: 'cadastros.editar', permitido: true });
    const op = { ...ctxOperador, permissoes: await permissoesEfetivas(ctxOperador) };
    expect(op.permissoes).toContain('cadastros.editar');
    await expect(criar(op, 'turnos', { nome: 'Madrugada' })).resolves.toBeTruthy();
    await definirPermissao(ctxAlfa, { perfil: 'OPERADOR', permissao: 'cadastros.editar', permitido: false });
    const op2 = { ...ctxOperador, permissoes: await permissoesEfetivas(ctxOperador) };
    await expect(criar(op2, 'turnos', { nome: 'Outro' })).rejects.toBeInstanceOf(ErroPermissao);
    expect(await permissoesEfetivas({ empresaId: BETA, usuarioId: SEED.usuarios[2].id, perfil: 'OPERADOR' })).not.toContain('cadastros.editar');
  });

  it('usuário novo precisa de senha inicial; e-mail existente só ganha o vínculo', async () => {
    await expect(adicionarUsuario(ctxBeta, { nome: 'Novo Beta', email: 'novo@beta.exemplo', perfil: 'OPERADOR' })).rejects.toThrow(/senha inicial/);
    await adicionarUsuario(ctxBeta, { nome: 'Novo Beta', email: 'novo@beta.exemplo', perfil: 'OPERADOR', senhaInicial: 'senha-de-teste-1' });
    await adicionarUsuario(ctxAlfa, { nome: 'Qualquer', email: 'NOVO@beta.exemplo', perfil: 'APONTADOR' });
    const naAlfa = (await listarUsuarios(ctxAlfa)).find((u) => u.email === 'novo@beta.exemplo');
    expect(naAlfa).toMatchObject({ nome: 'Novo Beta', perfil: 'APONTADOR' });
  });

  it('acesso por fazenda é gravado e a empresa não fica sem administrador ativo', async () => {
    const ns = SEED.fazendas.find((f) => f.codigo === 'NS')!.id;
    await alterarUsuario(ctxAlfa, SEED.usuarios[1].id, { perfil: 'OPERADOR', ativo: true, fazendaIds: [ns] });
    expect((await listarUsuarios(ctxAlfa)).find((u) => u.usuarioId === SEED.usuarios[1].id)!.fazendaIds).toEqual([ns]);
    await expect(alterarUsuario(ctxAlfa, SEED.usuarios[0].id, { perfil: 'GESTOR', ativo: true, fazendaIds: [] })).rejects.toThrow(/administrador ativo/);
    await expect(alterarUsuario(ctxAlfa, SEED.usuarios[1].id, { perfil: 'OPERADOR', ativo: true, fazendaIds: [SEED.fazendas.find((f) => f.empresa === 'beta')!.id] })).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });
});
