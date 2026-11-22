import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { alterarPlano, alterarStatusEmpresa, criarEmpresaPlataforma, ehSuperadmin, listarEmpresasPlataforma } from '@/servicos/plataforma';
import { listarEmpresasDoUsuario, vinculoAtivo } from '@/servicos/acesso';
import { painelInicio } from '@/servicos/inicio';
import { listarMovimentos } from '@/servicos/consultas';
import { obterFluxo } from '@/servicos/fluxo';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { TAMANHO_PAGINA } from '@/servicos/paginacao';
import { SEED } from '../../prisma/dados-seed';

/** Fase 8: área da plataforma (SUPERADMIN, §3.2), Início (§12 item 2) e paginação. */

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const SUPER = SEED.plataforma.id;
const ADMIN_ALFA = SEED.usuarios.find((u) => u.email === 'admin@alfa.exemplo')!.id;
const ctx: Contexto = { empresaId: SEED.empresas.alfa.id, usuarioId: ADMIN_ALFA, perfil: 'ADMIN_EMPRESA' };

afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

describe('plataforma (SUPERADMIN)', () => {
  it('só o SUPERADMIN entra; o administrador de empresa não', async () => {
    expect(await ehSuperadmin(SUPER)).toBe(true);
    expect(await ehSuperadmin(ADMIN_ALFA)).toBe(false);
    await expect(listarEmpresasPlataforma(ADMIN_ALFA)).rejects.toBeInstanceOf(ErroPermissao);
    expect(await listarEmpresasDoUsuario(SUPER)).toEqual([]); // não tem vínculo com empresas
  });

  it('lista empresas só com dados cadastrais e de acesso', async () => {
    const lista = await listarEmpresasPlataforma(SUPER);
    const alfa = lista.find((e) => e.id === SEED.empresas.alfa.id)!;
    expect(alfa).toMatchObject({ nome: SEED.empresas.alfa.nome, status: 'ATIVA', plano: 'BASICO' });
    expect(alfa.usuarios).toBeGreaterThanOrEqual(3);
    expect(alfa.administradores.map((a) => a.email)).toContain('admin@alfa.exemplo');
    expect(Object.keys(alfa)).not.toEqual(expect.arrayContaining(['fazendas', 'lotes', 'configuracoes']));
  });

  it('o papel da plataforma não lê dados operacionais e a aplicação não concede SUPERADMIN', async () => {
    const tentar = (sql: string) => prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE cafe_plataforma');
      return tx.$queryRawUnsafe(sql);
    });
    await expect(tentar('SELECT count(*) FROM lote')).rejects.toThrow(/permission denied/);
    await expect(tentar('SELECT count(*) FROM colhedor')).rejects.toThrow(/permission denied/);
    await expect(tentar('SELECT count(*) FROM empresa')).resolves.toBeTruthy();
    await expect(prisma.usuario.update({ where: { id: ADMIN_ALFA }, data: { superadmin: true } })).rejects.toThrow(/superadmin/);
  });

  it('cria empresa com modelo de fluxo e administrador; suspender corta o acesso na hora; reativar devolve', async () => {
    await expect(criarEmpresaPlataforma(SUPER, { nome: 'Ômega Café (fictícia)', cnpj: '11.111.111/1111-11', modelo: 'SIMPLIFICADO', adminNome: 'Olga Ômega', adminEmail: 'admin@omega.exemplo', adminSenha: 'senha-forte-1' })).rejects.toBeInstanceOf(ErroValidacao);
    const g = await criarEmpresaPlataforma(SUPER, { nome: 'Ômega Café (fictícia)', cnpj: '12.345.678/0001-95', modelo: 'SIMPLIFICADO', plano: 'PROFISSIONAL', adminNome: 'Olga Ômega', adminEmail: 'admin@omega.exemplo', adminSenha: 'senha-forte-1' });
    const admin = (await dono.usuario.findUniqueOrThrow({ where: { email: 'admin@omega.exemplo' } })).id;
    expect((await listarEmpresasDoUsuario(admin)).map((e) => [e.nome, e.perfil])).toEqual([['Ômega Café (fictícia)', 'ADMIN_EMPRESA']]);
    const ctxOmega: Contexto = { empresaId: g.id, usuarioId: admin, perfil: 'ADMIN_EMPRESA' };
    expect((await obterFluxo(ctxOmega)).etapas.length).toBeGreaterThan(0);
    await expect(criarEmpresaPlataforma(SUPER, { nome: 'ômega café (fictícia)', modelo: 'SIMPLIFICADO', adminNome: 'Outro', adminEmail: 'outro@omega.exemplo', adminSenha: 'senha-forte-2' })).rejects.toThrow(/Já existe/);

    await expect(alterarStatusEmpresa(SUPER, g.id, 'SUSPENSA', '')).rejects.toBeInstanceOf(ErroValidacao);
    await alterarStatusEmpresa(SUPER, g.id, 'SUSPENSA', 'Contrato encerrado (teste)');
    expect(await listarEmpresasDoUsuario(admin)).toEqual([]);
    await expect(vinculoAtivo(admin, g.id)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect((await listarEmpresasPlataforma(SUPER)).find((e) => e.id === g.id)).toMatchObject({ status: 'SUSPENSA', motivoStatus: 'Contrato encerrado (teste)' });
    await alterarStatusEmpresa(SUPER, g.id, 'ATIVA');
    await expect(vinculoAtivo(admin, g.id)).resolves.toMatchObject({ empresaId: g.id });

    await alterarPlano(SUPER, g.id, 'EMPRESARIAL');
    const aud = await dono.auditoria.findMany({ where: { empresaId: g.id, entidade: 'empresa' }, orderBy: { data: 'asc' } });
    expect(aud.map((a) => a.acao)).toEqual(['CRIAR', 'SUSPENDER', 'REATIVAR', 'ALTERAR_PLANO']);
    expect(aud.every((a) => a.usuarioId === SUPER)).toBe(true);
    await expect(alterarStatusEmpresa(ADMIN_ALFA, g.id, 'SUSPENSA', 'tentativa indevida')).rejects.toBeInstanceOf(ErroPermissao);
  });
});

describe('Início e paginação', () => {
  it('painel do Início: alertas, estoque, secagem, contratos a vencer, apontamentos do dia e funil por etapa', async () => {
    const p = await painelInicio(ctx);
    expect(p.funil.length).toBe((await obterFluxo(ctx)).etapas.filter((e) => e.ativa).length);
    expect(p.funil[0]).toMatchObject({ nome: expect.any(String), saldo: expect.stringMatching(/^\d+\.\d{3}$/) });
    expect(Number(p.estoque.livre)).toBeLessThanOrEqual(Number(p.estoque.saldo));
    expect(p.apontamentos).toMatchObject({ medidas: expect.any(String), colhedores: expect.any(Number) });
    expect(p.alertas.length).toBeLessThanOrEqual(6);
    expect(p.naoLidos).toBeGreaterThanOrEqual(p.alertas.length);
  });

  it(`lista de movimentos em páginas de ${TAMANHO_PAGINA}`, async () => {
    const etapa = (await obterFluxo(ctx)).etapas.find((e) => e.classe === 'COLHEITA')!;
    const p1 = await listarMovimentos(ctx, etapa.id, { pagina: 1 });
    expect(p1.movimentos.length).toBeLessThanOrEqual(TAMANHO_PAGINA);
    expect(p1.paginacao.pagina).toBe(1);
    const p999 = await listarMovimentos(ctx, etapa.id, { pagina: 999 });
    expect([p999.movimentos.length, p999.paginacao.temMais]).toEqual([0, false]);
  });
});
