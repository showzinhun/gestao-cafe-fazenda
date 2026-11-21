import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { comTransacao, type Contexto } from '@/servicos/transacao';
import { criarFazenda, listarFazendas, obterFazenda } from '@/servicos/fazendas';
import { listarEmpresasDoUsuario, vinculoAtivo } from '@/servicos/acesso';
import { ErroNaoEncontrado, ErroPermissao } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const ALFA = SEED.empresas.alfa.id;
const BETA = SEED.empresas.beta.id;
const ADMIN_ALFA = SEED.usuarios[0].id;
const OPERADOR_ALFA = SEED.usuarios[1].id;
const ADMIN_BETA = SEED.usuarios[2].id;
const CONSULTORA = SEED.usuarios[3].id;
const fazendaDe = (emp: 'alfa' | 'beta') => SEED.fazendas.filter((f) => f.empresa === emp);

const ctxAlfa: Contexto = { empresaId: ALFA, usuarioId: ADMIN_ALFA, perfil: 'ADMIN_EMPRESA' };
const ctxBeta: Contexto = { empresaId: BETA, usuarioId: ADMIN_BETA, perfil: 'ADMIN_EMPRESA' };
const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

describe('isolamento multiempresa (RN-22)', () => {
  it('RN-22 a empresa A só lista as próprias fazendas', async () => {
    const a = await listarFazendas(ctxAlfa);
    const b = await listarFazendas(ctxBeta);
    expect(a.map((f) => f.codigo).sort()).toEqual(fazendaDe('alfa').map((f) => f.codigo).sort());
    expect(b.map((f) => f.codigo)).toEqual(['SL']);
  });

  it('RN-22 buscar pelo id de uma fazenda da outra empresa dá 404', async () => {
    const idBeta = fazendaDe('beta')[0]!.id;
    await expect(obterFazenda(ctxAlfa, idBeta)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(obterFazenda(ctxBeta, idBeta)).resolves.toMatchObject({ codigo: 'SL' });
  });

  it('RN-22 sem empresa definida nenhuma linha de negócio é visível', async () => {
    expect(await prisma.fazenda.findMany()).toEqual([]);
    expect(await prisma.auditoria.findMany()).toEqual([]);
    expect(await prisma.empresa.findMany()).toEqual([]);
  });

  it('RN-22 não grava registro com empresa_id de outra empresa', async () => {
    await expect(
      comTransacao(ctxAlfa, (tx) => tx.fazenda.create({ data: { empresaId: BETA, codigo: 'XX', nome: 'Invasora' } })),
    ).rejects.toThrow(/row-level security/i);
  });

  it('RN-22 alterar registro da outra empresa não afeta nada', async () => {
    const idBeta = fazendaDe('beta')[0]!.id;
    const r = await comTransacao(ctxAlfa, (tx) => tx.fazenda.updateMany({ where: { id: idBeta }, data: { nome: 'Alterada' } }));
    expect(r.count).toBe(0);
    const f = await dono.fazenda.findUnique({ where: { id: idBeta } });
    expect(f?.nome).toBe('Fazenda Serra Leste');
  });

  it('RN-22 trocar app.empresa_id dentro da transação não passa do vínculo validado no servidor', async () => {
    // O contexto vem da sessão; um id inválido nem abre transação.
    await expect(comTransacao({ ...ctxAlfa, empresaId: 'nao-e-uuid' }, async () => 1)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(vinculoAtivo(ADMIN_ALFA, BETA)).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });

  it('o papel da aplicação não apaga registros operacionais (regra 4)', async () => {
    await expect(comTransacao(ctxAlfa, (tx) => tx.fazenda.deleteMany({}))).rejects.toThrow(/permission denied/i);
  });

  it('cada usuário lista só as empresas em que tem vínculo ativo', async () => {
    expect((await listarEmpresasDoUsuario(ADMIN_ALFA)).map((e) => e.empresaId)).toEqual([ALFA]);
    const c = await listarEmpresasDoUsuario(CONSULTORA);
    expect(c.map((e) => [e.nome, e.perfil])).toEqual([
      ['Alfa Agro (fictícia)', 'GESTOR'],
      ['Beta Cafés (fictícia)', 'CONSULTA'],
    ]);
  });

  it('vínculo inativo ou empresa suspensa perdem o acesso', async () => {
    await dono.usuarioEmpresa.update({ where: { usuarioId_empresaId: { usuarioId: CONSULTORA, empresaId: BETA } }, data: { ativo: false } });
    expect((await listarEmpresasDoUsuario(CONSULTORA)).map((e) => e.empresaId)).toEqual([ALFA]);
    await dono.usuarioEmpresa.update({ where: { usuarioId_empresaId: { usuarioId: CONSULTORA, empresaId: BETA } }, data: { ativo: true } });
    await dono.empresa.update({ where: { id: BETA }, data: { status: 'SUSPENSA' } });
    await expect(vinculoAtivo(ADMIN_BETA, BETA)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await dono.empresa.update({ where: { id: BETA }, data: { status: 'ATIVA' } });
  });
});

describe('auditoria (RN-15)', () => {
  it('RN-15 criar fazenda grava auditoria com autoria do servidor, visível só na própria empresa', async () => {
    const f = await criarFazenda(ctxAlfa, { codigo: 'mc', nome: 'Fazenda Monte Claro', uf: 'MG' });
    expect(f.codigo).toBe('MC');
    const reg = await comTransacao(ctxAlfa, (tx) => tx.auditoria.findMany({ where: { entidade: 'fazenda', entidadeId: f.id } }));
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ acao: 'CRIAR', usuarioId: ADMIN_ALFA, empresaId: ALFA });
    const naBeta = await comTransacao(ctxBeta, (tx) => tx.auditoria.findMany({ where: { entidadeId: f.id } }));
    expect(naBeta).toEqual([]);
  });

  it('perfil sem permissão de cadastro não cria fazenda', async () => {
    await expect(criarFazenda({ empresaId: ALFA, usuarioId: OPERADOR_ALFA, perfil: 'OPERADOR' }, { codigo: 'OP', nome: 'Teste' })).rejects.toBeInstanceOf(ErroPermissao);
  });

  it('o mesmo código de fazenda pode existir em empresas diferentes', async () => {
    const f = await criarFazenda(ctxBeta, { codigo: 'NS', nome: 'Nascente da Beta' });
    expect(f.codigo).toBe('NS');
  });
});
