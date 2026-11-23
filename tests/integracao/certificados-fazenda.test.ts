import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { criar, listar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, lancarResultados, registrarCarga } from '@/servicos/movimentos';
import { obterLote } from '@/servicos/lotes';
import { adicionarCertificadoFazenda, adicionarCertificadosFazenda, alterarCertificadoFazenda, listarCertificadosFazenda } from '@/servicos/conformidade';
import { rotuloCertificacao } from '@/dominio/certificacao';
import { ErroNaoEncontrado, ErroPermissao, ErroValidacao } from '@/dominio/erros';
import { retangulo, SEED } from '../../prisma/dados-seed';

/** Certificados da fazenda (§10): vários de uma vez, ID opcional, parcial, edição e sobreposição. */

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const u = (email: string) => SEED.usuarios.find((x) => x.email === email)!.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: u('admin@alfa.exemplo'), perfil: 'ADMIN_EMPRESA' };
const operador: Contexto = { empresaId: ALFA, usuarioId: u('operador@alfa.exemplo'), perfil: 'OPERADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: u('admin@beta.exemplo'), perfil: 'ADMIN_EMPRESA' };
const PDF = Buffer.from('%PDF-1.4\n% certificado ficticio\n%%EOF\n');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

let C: Record<string, string>;
let E: Record<string, string>;
let L: Record<string, string>;
let P: Record<string, string>;
let SAFRA: string;
let NAT: string;

const novaFazenda = async (codigo: string) => {
  const f = (await criar(ctx, 'fazendas', { codigo, nome: `Fazenda ${codigo} (teste)`, uf: 'MG' })).registro.id as string;
  const t = (await criar(ctx, 'talhoes', { fazendaId: f, codigo: 'T1', nome: 'Talhão 1', areaHaInformada: '2', geometria: retangulo(-47.5 + codigo.charCodeAt(0) / 1000, -18.5, 120, 120) })).registro.id as string;
  return { f, t };
};
/** Café do talhão até o armazém, num lote em kg. */
async function loteAr(fazendaId: string, talhaoId: string) {
  const { lote: ef } = await registrarCarga(ctx, { fazendaId, talhaoId, safraId: SAFRA, tipoCafeId: NAT, quantidade: '10' });
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: L['TE-01'], entradas: [{ loteId: ef.id, quantidade: '10' }] });
  const { lotes: [a] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: L['TU-01'], entradas: [{ loteId: a!.id, quantidade: '10' }] });
  const { lotes: [b] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: L['Q-01'], entradas: [{ loteId: b!.id, quantidade: '10' }] });
  const { lotes: [c] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: '100', peneiraId: P['17'] }] } });
  return c!;
}

beforeAll(async () => {
  const m = async (r: 'locais' | 'peneiras' | 'certificados' | 'safras' | 'tipos-cafe') => Object.fromEntries(((await listar(ctx, r)) as { id: string; codigo: string }[]).map((x) => [x.codigo, x.id]));
  [L, P, C] = [await m('locais'), await m('peneiras'), await m('certificados')];
  SAFRA = (await m('safras'))['2025/26']!;
  NAT = (await m('tipos-cafe')).NAT!;
  E = Object.fromEntries((await obterFluxo(ctx)).etapas.map((e) => [e.codigo, e.id]));
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

describe('certificados da fazenda', () => {
  it('o catálogo padrão tem os certificados da lista do negócio (RFA, AAA, 4C, UTZ, C.A.F.E. Practices, TAG Cerrado)', () => {
    expect(Object.keys(C)).toEqual(expect.arrayContaining(['RFA', 'AAA', '4C', 'UTZ', 'CAFE', 'TAG']));
  });

  it('cadastra vários de uma vez; o ID é opcional em cada um', async () => {
    const { f } = await novaFazenda('CA');
    const criados = await adicionarCertificadosFazenda(ctx, f, [
      { entrada: { certificadoId: C.RFA!, numero: 'RFA-1234', validadeInicio: '2026-01-01', validadeFim: '2027-12-31' } },
      { entrada: { certificadoId: C.CAFE!, numero: '', validadeInicio: '2026-01-01', validadeFim: '2027-12-31' }, arquivo: { nome: 'cafe.pdf', tipo: 'application/pdf', conteudo: PDF } },
      { entrada: { certificadoId: C['4C']!, validadeInicio: '2026-03-01', validadeFim: '2027-02-28' } },
    ]);
    expect(criados).toHaveLength(3);
    const lista = await listarCertificadosFazenda(ctx, f);
    expect(Object.fromEntries(lista.map((c) => [c.certificado, c.numero]))).toEqual({ RFA: 'RFA-1234', CAFE: null, '4C': null });
    expect(lista.find((c) => c.certificado === 'CAFE')!.arquivo?.nome).toBe('cafe.pdf');
    expect(await dono.auditoria.count({ where: { entidade: 'fazenda_certificado', acao: 'CRIAR', empresaId: ALFA, depois: { path: ['fazenda'], equals: 'CA' } } })).toBe(3);
  });

  it('é tudo ou nada: um item inválido não grava nenhum; o mesmo certificado duas vezes é recusado', async () => {
    const { f } = await novaFazenda('CB');
    await expect(adicionarCertificadosFazenda(ctx, f, [
      { entrada: { certificadoId: C.RFA!, validadeInicio: '2026-01-01', validadeFim: '2027-12-31' } },
      { entrada: { certificadoId: C.AAA!, validadeInicio: '2027-01-01', validadeFim: '2026-01-01' } },
    ])).rejects.toBeInstanceOf(ErroValidacao);
    await expect(adicionarCertificadosFazenda(ctx, f, [
      { entrada: { certificadoId: C.RFA!, validadeInicio: '2026-01-01', validadeFim: '2027-12-31' } },
      { entrada: { certificadoId: C.RFA!, validadeInicio: '2026-01-01', validadeFim: '2027-12-31' } },
    ])).rejects.toThrow(/duas vezes/);
    await expect(adicionarCertificadosFazenda(ctx, f, [])).rejects.toThrow(/ao menos um/);
    expect(await listarCertificadosFazenda(ctx, f)).toEqual([]);
  });

  it('validades do mesmo certificado não se cruzam; renovar é cadastrar o período seguinte; suspenso libera o período', async () => {
    const { f } = await novaFazenda('CC');
    const rfa = await adicionarCertificadoFazenda(ctx, f, { certificadoId: C.RFA!, numero: 'R-1', validadeInicio: '2025-01-01', validadeFim: '2025-12-31' });
    await expect(adicionarCertificadoFazenda(ctx, f, { certificadoId: C.RFA!, validadeInicio: '2025-06-01', validadeFim: '2026-06-01' })).rejects.toThrow(/já tem RFA de 01\/01\/2025 a 31\/12\/2025/);
    await expect(adicionarCertificadoFazenda(ctx, f, { certificadoId: C.RFA!, numero: 'R-2', validadeInicio: '2026-01-01', validadeFim: '2026-12-31' })).resolves.toBeTruthy();
    await dono.fazendaCertificado.update({ where: { id: rfa.id }, data: { status: 'SUSPENSO' } });
    await expect(adicionarCertificadoFazenda(ctx, f, { certificadoId: C.RFA!, validadeInicio: '2025-03-01', validadeFim: '2025-09-01' })).resolves.toBeTruthy();
  });

  it('corrige o ID, a validade e o parcial depois de cadastrado, com auditoria; um PDF novo substitui o anterior', async () => {
    const { f } = await novaFazenda('CD');
    const c = await adicionarCertificadoFazenda(ctx, f, { certificadoId: C.UTZ!, validadeInicio: '2026-01-01', validadeFim: '2026-12-31' });
    const r = await alterarCertificadoFazenda(ctx, c.id, { numero: 'UTZ-77', validadeInicio: '2026-02-01', validadeFim: '2027-01-31', parcial: true }, { nome: 'utz.pdf', tipo: 'application/pdf', conteudo: PDF });
    expect([r.numero, r.parcial, r.arquivoId !== null]).toEqual(['UTZ-77', true, true]);
    const linha = (await listarCertificadosFazenda(ctx, f))[0]!;
    expect([linha.numero, linha.parcial, linha.validadeInicio, linha.validadeFim]).toEqual(['UTZ-77', true, '2026-02-01', '2027-01-31']);
    const aud = await dono.auditoria.findFirstOrThrow({ where: { entidadeId: c.id, acao: 'ALTERAR' } });
    expect(aud.antes).toMatchObject({ numero: null, parcial: false });
    expect(aud.depois).toMatchObject({ numero: 'UTZ-77', parcial: true, arquivo: 'utz.pdf' });
    // Limpar o ID (nem todo certificado tem).
    await alterarCertificadoFazenda(ctx, c.id, { numero: '', validadeInicio: '2026-02-01', validadeFim: '2027-01-31', parcial: true });
    expect((await listarCertificadosFazenda(ctx, f))[0]!.numero).toBeNull();
  });

  it('RN-08 certificação parcial fica registrada mas o lote não herda; a inteira, sim', async () => {
    const parcial = await novaFazenda('CE');
    await adicionarCertificadosFazenda(ctx, parcial.f, [
      { entrada: { certificadoId: C.UTZ!, validadeInicio: '2025-01-01', validadeFim: '2030-12-31', parcial: true } },
      { entrada: { certificadoId: C.RFA!, validadeInicio: '2025-01-01', validadeFim: '2030-12-31' } },
    ]);
    const lote = await loteAr(parcial.f, parcial.t);
    expect((await obterLote(ctx, lote.id)).certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']); // UTZ parcial não passa
    const lista = await listarCertificadosFazenda(ctx, parcial.f);
    expect(rotuloCertificacao(lista.map((c) => ({ codigo: c.certificado, status: c.status, validadeInicio: c.validadeInicio, validadeFim: c.validadeFim, parcial: c.parcial })), hoje())).toBe('RFA + UTZ (parcial)');
  });

  it('a lista de fazendas traz os certificados para a coluna "Certificados"', async () => {
    const fazendas = (await listar(ctx, 'fazendas')) as unknown as { codigo: string; certificados: { parcial: boolean; certificado: { codigo: string } }[] }[];
    const ce = fazendas.find((f) => f.codigo === 'CE')!;
    expect(ce.certificados.map((c) => [c.certificado.codigo, c.parcial]).sort()).toEqual([['RFA', false], ['UTZ', true]]);
    expect(fazendas.find((f) => f.codigo === 'CB')!.certificados).toEqual([]); // fazenda sem certificado
  });

  it('só quem edita cadastros mexe; a Beta não vê nem altera certificados da Alfa (RN-22)', async () => {
    const { f } = await novaFazenda('CF');
    const c = await adicionarCertificadoFazenda(ctx, f, { certificadoId: C.RFA!, validadeInicio: '2026-01-01', validadeFim: '2026-12-31' });
    await expect(adicionarCertificadoFazenda(operador, f, { certificadoId: C.RFA!, validadeInicio: '2030-01-01', validadeFim: '2030-12-31' })).rejects.toBeInstanceOf(ErroPermissao);
    await expect(alterarCertificadoFazenda(operador, c.id, { validadeInicio: '2026-01-01', validadeFim: '2026-12-31' })).rejects.toBeInstanceOf(ErroPermissao);
    await expect(alterarCertificadoFazenda(ctxBeta, c.id, { numero: 'X', validadeInicio: '2026-01-01', validadeFim: '2026-12-31' })).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(adicionarCertificadoFazenda(ctxBeta, f, { certificadoId: C.RFA!, validadeInicio: '2030-01-01', validadeFim: '2030-12-31' })).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect(await listarCertificadosFazenda(ctxBeta, f)).toEqual([]);
  });
});
