import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { criar, listar, alterar } from '@/servicos/cadastros';
import { obterFluxo } from '@/servicos/fluxo';
import { abrirMovimento, lancarResultados, registrarCarga } from '@/servicos/movimentos';
import { obterLote } from '@/servicos/lotes';
import { consultarEstoque } from '@/servicos/consultas';
import { assinarContrato, criarContrato, reservarParaContrato } from '@/servicos/contratos';
import { adicionarNota, criarEmbarque, finalizarEmbarque, obterEmbarque, programarEmbarque, reabrirEmbarque, registrarCarregamento } from '@/servicos/embarques';
import { gerarDossie, obterDossie, obterPacote, reemitirPacote } from '@/servicos/dossie';
import {
  adicionarCertificadoFazenda, alterarStatusCertificadoFazenda, checarTalhao, importarChecagem, listarCertificadosFazenda, listarChecagens, obterArquivo, painelConformidade,
} from '@/servicos/conformidade';
import { listarAlertas } from '@/servicos/alertas';
import { hashConteudo } from '@/dominio/pacote';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { retangulo, SEED } from '../../prisma/dados-seed';

/** Fase 7 (§10, §17): certificados, geometria, checagens, RN-18, dossiê, pacote (RN-30), RN-28 e RN-31. Passos 11, 12, 14, 16 e 17 do §15. */

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const u = (email: string) => SEED.usuarios.find((x) => x.email === email)!.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: u('admin@alfa.exemplo'), perfil: 'ADMIN_EMPRESA' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: u('admin@beta.exemplo'), perfil: 'ADMIN_EMPRESA' };
const CLIENTE = SEED.parceiros.find((p) => p.nome.startsWith('Exportadora'))!.id;
const NS = SEED.fazendas[0].id;
const BV = SEED.fazendas[1].id;
const [T1, T2] = [SEED.talhoes[0].id, SEED.talhoes[1].id];
const PDF = (texto = 'laudo') => Buffer.from(`%PDF-1.4\n% ${texto} ficticio\n%%EOF\n`);
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const maisDias = (n: number) => new Date(Date.parse(`${hoje()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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

/** Leva cargas (talhão, medidas) juntas até o armazém, num lote em kg com a composição ponderada. */
async function ateArmazem(cargas: [string, string, string?][], kg: string) {
  const efs = [];
  for (const [talhaoId, medidas, fazendaId] of cargas) efs.push({ ...(await registrarCarga(ctx, { fazendaId: fazendaId ?? NS, talhaoId, safraId: SAFRA, tipoCafeId: NAT, quantidade: medidas })).lote, medidas });
  const te = await abrirMovimento(ctx, { etapaId: E.TERREIRO!, localId: L['TE-01'], entradas: efs.map((e) => ({ loteId: e.id, quantidade: e.medidas })) });
  const { lotes: [a] } = await lancarResultados(ctx, te.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const total = efs.reduce((s, e) => s + Number(e.medidas), 0).toString();
  const tu = await abrirMovimento(ctx, { etapaId: E.TULHA!, localId: L['TU-01'], entradas: [{ loteId: a!.id, quantidade: total }] });
  const { lotes: [b] } = await lancarResultados(ctx, tu.movimento.id, { parametros: { modelo: 'CAFE_E_PERDA', fator: '1' } });
  const ar = await abrirMovimento(ctx, { etapaId: E.ARMAZEM!, localId: L['Q-01'], entradas: [{ loteId: b!.id, quantidade: total }] });
  const { lotes: [c] } = await lancarResultados(ctx, ar.movimento.id, { parametros: { modelo: 'CONVERSAO_ESTOQUE', lotes: [{ quantidade: kg, peneiraId: P['17'] }] } });
  return c!;
}
const contrato = async (extra: Partial<Parameters<typeof criarContrato>[1]> = {}) => {
  const c = await criarContrato(ctx, { clienteId: CLIENTE, quantidadeSacas: '15', tipoPreco: 'FIXO', precoPorSaca: '1800', certificadoIds: [C.RFA!], exigeEudr: true, ...extra });
  await assinarContrato(ctx, c.id);
  return c;
};
async function embarcar(contratoId: string, kgNota = '900', carga: Partial<Parameters<typeof registrarCarregamento>[2]> = {}) {
  const eb = (await criarEmbarque(ctx, { contratoId })).id;
  await programarEmbarque(ctx, eb);
  const prog = await obterEmbarque(ctx, eb);
  const kg = Number(prog.programadoKg);
  await registrarCarregamento(ctx, eb, { placa: 'ABC1D23', lacres: ['L-001'], pesoBruto: String(15000 + kg), tara: '15000', motivoDiferenca: null, ...carga });
  await adicionarNota(ctx, eb, { numeroNota: '1234', serie: '1', dataEmissao: hoje(), qtdKg: kgNota });
  return eb;
}

describe('certificados da fazenda (§10)', () => {
  it('certificado com PDF, alerta CERTIFICADO_VENCENDO na faixa de 30 dias; suspender exige motivo', async () => {
    const fc = await adicionarCertificadoFazenda(ctx, BV, { certificadoId: C['4C']!, numero: '4C-FICTICIO-BV', validadeInicio: '2025-01-01', validadeFim: maisDias(20) }, { nome: 'certificado 4C.pdf', tipo: 'application/pdf', conteudo: PDF('4C') });
    const lista = await listarCertificadosFazenda(ctx, BV);
    const linha = lista.find((x) => x.id === fc.id)!;
    expect([linha.certificado, linha.situacao, linha.diasRestantes]).toEqual(['4C', 'VALIDO', 20]);
    expect((await obterArquivo(ctx, linha.arquivo!.id)).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await listarAlertas(ctx)).some((a) => a.chave === `CERTIFICADO_VENCENDO:${fc.id}:30`)).toBe(true);
    await expect(adicionarCertificadoFazenda(ctx, BV, { certificadoId: C['4C']!, validadeInicio: '2025-01-01', validadeFim: '2027-01-01' }, { nome: 'x.pdf', tipo: 'application/pdf', conteudo: Buffer.from('não é pdf') })).rejects.toBeInstanceOf(ErroValidacao);
    await expect(alterarStatusCertificadoFazenda(ctx, fc.id, 'SUSPENSO', '')).rejects.toBeInstanceOf(ErroValidacao);
    await alterarStatusCertificadoFazenda(ctx, fc.id, 'SUSPENSO', 'Auditoria pendente');
    expect((await listarCertificadosFazenda(ctx, BV)).find((x) => x.id === fc.id)!.situacao).toBe('SUSPENSO');
  });
});

describe('geometria e checagem de desmatamento (§10)', () => {
  it('talhão de 5 ha com PONTO é inválido para a EUDR (bloqueado no painel)', async () => {
    const { registro } = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'P5', nome: 'Ponto 5 ha', areaHaInformada: '5', geometria: { type: 'Point', coordinates: [-47.2, -18.9] } });
    const t = (await painelConformidade(ctx)).talhoes.find((x) => x.id === registro.id)!;
    expect(t.situacao).toBe('BLOQUEADO');
    expect(t.pendencias[0]).toMatch(/exige polígono/);
  });

  it('sobreposição com talhão de outro produtor gera alerta; do mesmo produtor, não', async () => {
    const { registro: prod } = await criar(ctx, 'parceiros', { tipoPessoa: 'F', nome: 'Vizinho Teste (fictício)', cpfCnpj: '529.982.247-25', papeis: ['PRODUTOR'] });
    const { registro: viz } = await criar(ctx, 'fazendas', { codigo: 'VZ', nome: 'Fazenda Vizinha', produtorId: prod.id, uf: 'MG' });
    const encostado = retangulo(-46.989, -18.9405, 200, 150); // dentro do T1
    const r = await criar(ctx, 'talhoes', { fazendaId: viz.id, codigo: 'V1', nome: 'Vizinho 1', areaHaInformada: '3', geometria: encostado });
    expect(r.avisos.join(' ')).toMatch(/Sobreposição de .* ha com o talhão NS\/T1/);
    expect((await listarAlertas(ctx)).some((a) => a.tipo === 'SOBREPOSICAO_TALHAO' && a.entidadeId === r.registro.id)).toBe(true);
    const mesmo = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'B9', nome: 'Boa Vista 9', areaHaInformada: '3', geometria: retangulo(-46.988, -18.9405, 100, 100) });
    expect(mesmo.avisos.join(' ')).not.toMatch(/NS\/T1/); // BV e NS são do mesmo produtor
  });

  it('a checagem vale para a versão da geometria: mudou o desenho, refaz', async () => {
    const { registro } = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'G1', nome: 'Geometria 1', areaHaInformada: '2', geometria: retangulo(-47.3, -18.8, 120, 120) });
    const id = registro.id as string;
    await checarTalhao(ctx, id);
    expect((await painelConformidade(ctx)).talhoes.find((x) => x.id === id)!.situacao).toBe('APTO');
    const r = await alterar(ctx, 'talhoes', id, { geometria: retangulo(-47.3, -18.8, 130, 120) });
    expect(r.avisos.join(' ')).toMatch(/Refaça a checagem/);
    const t = (await painelConformidade(ctx)).talhoes.find((x) => x.id === id)!;
    expect([t.situacao, t.pendencias[0]]).toEqual(['PENDENTE', expect.stringMatching(/geometria mudou/)]);
    expect((await listarChecagens(ctx, id))[0]!.vigente).toBe(false);
    const semGeo = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'S0', nome: 'Sem geometria' });
    await expect(checarTalhao(ctx, semGeo.registro.id as string)).rejects.toBeInstanceOf(ErroValidacao);
  });
});

describe('passos 11, 12, 14 e 16 do §15: checagens, dossiê, RN-18 e pacote', () => {
  let ar: { id: string; codigo: string };
  let eb: string;

  it('passo 11: checagens de T1 e T2 SEM_ALERTA', async () => {
    for (const t of [T1, T2]) expect((await checarTalhao(ctx, t)).resultado).toBe('SEM_ALERTA');
    const painel = await painelConformidade(ctx);
    expect(painel.talhoes.filter((x) => x.id === T1 || x.id === T2).map((x) => x.situacao)).toEqual(['APTO', 'APTO']);
  });

  it('passo 12: dossiê do embarque com T1 = 600 kg, T2 = 300 kg, RFA válido e sem pendências', async () => {
    ar = await ateArmazem([[T1, '20'], [T2, '10']], '1200');
    const l = await obterLote(ctx, ar.id);
    expect(l.certificados.map((c) => c.certificado.codigo)).toEqual(['RFA']);
    expect((await consultarEstoque(ctx, { aptoEudr: true })).lotes.some((x) => x.id === ar.id)).toBe(true);
    const ct = await contrato();
    await reservarParaContrato(ctx, ct.id, [{ loteId: ar.id, quantidade: '900' }]);
    eb = await embarcar(ct.id);
    const d = await gerarDossie(ctx, eb);
    expect(d.pendencias).toEqual([]);
    const { conteudo } = await obterDossie(ctx, eb);
    expect(conteudo.talhoes.map((t) => [t.talhao, t.kg, t.percentual])).toEqual([['T1', 600, 0.6667], ['T2', 300, 0.3333]]);
    expect(conteudo.certificados.find((c) => c.certificado === 'RFA')).toMatchObject({ fazenda: 'NS', valido: true });
    expect(conteudo.embarque.certificados_vendidos).toEqual(['RFA']);
    expect(conteudo.cadeia.map((c) => c.etapa)).toEqual(expect.arrayContaining(['Armazém', 'Tulha']));
    expect(conteudo.hash_sha256).toBe(hashConteudo(conteudo as unknown as Record<string, unknown>));
  });

  it('passo 16 e RN-30: ao finalizar, pacote v1 com NF, 900 kg, RFA, T1 600 / T2 300, polígonos e hash; reabrir não muda o pacote', async () => {
    const f = await finalizarEmbarque(ctx, eb);
    expect([f.statusContrato, f.pacote.versao]).toEqual(['CONCLUIDO', 1]);
    const p = await obterPacote(ctx, eb);
    expect(p.nome).toMatch(/^pacote-EB-NS-2526-\d{6}-v1$/);
    expect(p.conteudo).toMatchObject({ formato: 'cafe-pacote-embarque', versao_formato: 1, versao: 1, notas: [{ numero: '1234', kg: 900 }], eudr: { talhoes_sem_pendencia: true } });
    expect(p.conteudo.lotes[0]).toMatchObject({ codigo: ar.codigo, kg: 900, sacas: 15, certificados: ['RFA'], certificado_vendido: 'RFA', rebaixamentos: [] });
    expect(p.conteudo.lotes[0]!.composicao).toEqual([{ fazenda: 'NS', talhao: 'T1', percentual: 0.6667, kg: 600 }, { fazenda: 'NS', talhao: 'T2', percentual: 0.3333, kg: 300 }]);
    expect(p.conteudo.fazendas[0]).toMatchObject({ codigo: 'NS', certificados_validos: ['RFA'], car: 'MG-3148103-FICTICIO-NS' });
    const geo = p.geojson as { features: { geometry: { type: string }; properties: { Name: string; kg_no_embarque: number } }[] };
    expect(geo.features.map((x) => [x.properties.Name, x.geometry.type, x.properties.kg_no_embarque])).toEqual([['NS-T1', 'Polygon', 600], ['NS-T2', 'Polygon', 300]]);
    expect(p.hash).toBe(hashConteudo(p.conteudo));
    await expect(gerarDossie(ctx, eb)).rejects.toThrow(/congelado/);
    expect((await obterDossie(ctx, eb)).congelado).toBe(true);

    await reabrirEmbarque(ctx, eb, 'conferência da nota');
    await finalizarEmbarque(ctx, eb);
    const depois = await obterPacote(ctx, eb);
    expect([depois.versao, depois.hash]).toEqual([1, p.hash]);
    await expect(reemitirPacote(ctx, eb, '')).rejects.toThrow(/motivo/);
    const v2 = await reemitirPacote(ctx, eb, 'Correção do número da nota');
    expect(v2.versao).toBe(2);
    expect(v2.hashSha256).not.toBe(p.hash);
    expect((await obterPacote(ctx, eb, 1)).hash).toBe(p.hash);
  });

  it('RN-18 o embarque de contrato com EUDR não finaliza com talhão sem checagem (pendência do dossiê)', async () => {
    const { registro: t } = await criar(ctx, 'talhoes', { fazendaId: NS, codigo: 'T7', nome: 'Talhão 7', areaHaInformada: '2', geometria: retangulo(-46.96, -18.96, 150, 130) });
    const lote = await ateArmazem([[t.id as string, '5']], '60');
    const ct = await contrato({ quantidadeSacas: '1' });
    await reservarParaContrato(ctx, ct.id, [{ loteId: lote.id, quantidade: '60' }]);
    const e = await embarcar(ct.id, '60');
    expect((await gerarDossie(ctx, e)).pendencias.map((p) => p.tipo)).toEqual(['SEM_CHECAGEM']);
    const erro = await regra(finalizarEmbarque(ctx, e), 'RN-18');
    expect(erro.message).toMatch(/NS\/T7 sem checagem/);
    await checarTalhao(ctx, t.id as string);
    await expect(finalizarEmbarque(ctx, e)).resolves.toMatchObject({ statusContrato: 'CONCLUIDO' });
  });

  it('passo 14 e RN-18: T2 com ALERTA bloqueia a reserva do saldo de 300 kg para contrato com EUDR', async () => {
    const c = await importarChecagem(ctx, T2, { resultado: 'ALERTA', dataChecagem: hoje(), provedor: 'Laudo externo (fictício)', areaAlertaHa: '0,8' }, { nome: 'laudo T2.pdf', tipo: 'application/pdf', conteudo: PDF('T2') });
    expect(c.arquivoId).toBeTruthy();
    const eudr = await contrato({ quantidadeSacas: '5' });
    const e = await regra(reservarParaContrato(ctx, eudr.id, [{ loteId: ar.id, quantidade: '300' }]), 'RN-18');
    expect(e.message).toMatch(/NS\/T2 com alerta de desmatamento/);
    expect((await listarAlertas(ctx)).some((a) => a.tipo === 'EUDR_PENDENTE' && a.entidadeId === T2)).toBe(true);
    expect((await consultarEstoque(ctx, {})).lotes.find((x) => x.id === ar.id)!.eudr).toBe('BLOQUEADO');
    // Contrato sem EUDR aceita o mesmo lote.
    const sem = await contrato({ quantidadeSacas: '5', exigeEudr: false });
    await expect(reservarParaContrato(ctx, sem.id, [{ loteId: ar.id, quantidade: '300' }])).resolves.toBeTruthy();
    await checarTalhao(ctx, T2); // volta a SEM_ALERTA para os outros testes
  });
});

describe('rebaixamento (RN-28) e limite de quebra no serviço (RN-31)', () => {
  let rfa: { id: string; codigo: string };
  let conv: { id: string; codigo: string };

  beforeAll(async () => {
    const { registro: b1 } = await criar(ctx, 'talhoes', { fazendaId: BV, codigo: 'B8', nome: 'Boa Vista 8', areaHaInformada: '3', geometria: { type: 'Point', coordinates: [-47.01, -18.95] } });
    rfa = await ateArmazem([[T1, '10']], '400');
    conv = await ateArmazem([[b1.id as string, '10', BV]], '200');
  });

  it('RN-28 passo 17: blend de 100 kg RFA com 100 kg convencional só sai convencional; exige motivo e grava rebaixamento de 100 kg de RFA', async () => {
    const gs = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'BLEND', entradas: [{ loteId: rfa.id, quantidade: '100' }, { loteId: conv.id, quantidade: '100' }] });
    const parametros = { modelo: 'POR_PENEIRA' as const, lotes: [{ quantidade: '200', peneiraId: P['17']! }] };
    const e = await regra(lancarResultados(ctx, gs.movimento.id, { parametros }), 'RN-28');
    expect(e.message).toMatch(new RegExp(`${rfa.codigo} perde RFA \\(100 kg\\)`));
    await regra(lancarResultados(ctx, gs.movimento.id, { parametros, certificadoIds: [C.RFA!], motivoRebaixamento: 'tentativa' }), 'RN-08');
    const r = await lancarResultados(ctx, gs.movimento.id, { parametros, motivoRebaixamento: 'Blend para o padrão do cliente' });
    expect((await obterLote(ctx, r.lotes[0]!.id)).certificados).toEqual([]);
    const reb = await dono.rebaixamento.findMany({ where: { movimentoId: gs.movimento.id } });
    expect(reb.map((x) => [x.loteOrigemId, x.kg.toString(), x.esquemasPerdidos, x.motivo])).toEqual([[rfa.id, '100', ['RFA'], 'Blend para o padrão do cliente']]);
  });

  it('RN-31 quebra acima do limite do tipo de serviço exige motivo', async () => {
    await dono.empresa.update({ where: { id: ALFA }, data: { configuracoes: { ...((await dono.empresa.findUniqueOrThrow({ where: { id: ALFA } })).configuracoes as object), limite_quebra_servico: { CATACAO: '0.05' } } } });
    const gs = await abrirMovimento(ctx, { etapaId: E.SERVICO!, servicoTipo: 'CATACAO', entradas: [{ loteId: rfa.id, quantidade: '100' }] });
    const parametros = { modelo: 'POR_PENEIRA' as const, lotes: [{ quantidade: '90', peneiraId: P['17']! }] };
    const e = await regra(lancarResultados(ctx, gs.movimento.id, { parametros }), 'RN-31');
    expect(e.message).toMatch(/Quebra de 10% passa do limite de 5%/);
    const r = await lancarResultados(ctx, gs.movimento.id, { parametros, motivoQuebra: 'Lote com muito grão brocado' });
    expect(r.movimento.motivoQuebra).toBe('Lote com muito grão brocado');
  });

  it('RN-28 na venda: vender como convencional um lote RFA exige motivo; vender como AAA é recusado', async () => {
    const ct = await contrato({ quantidadeSacas: '1', certificadoIds: [], exigeEudr: false });
    await reservarParaContrato(ctx, ct.id, [{ loteId: rfa.id, quantidade: '60' }]);
    const eb = (await criarEmbarque(ctx, { contratoId: ct.id })).id;
    await programarEmbarque(ctx, eb);
    const carga = { placa: 'ABC1D23', lacres: [], pesoBruto: '15060', tara: '15000' };
    await regra(registrarCarregamento(ctx, eb, { ...carga, certificadosVendidos: [C.AAA!] }), 'RN-28');
    await regra(registrarCarregamento(ctx, eb, { ...carga, certificadosVendidos: [] }), 'RN-28');
    const r = await registrarCarregamento(ctx, eb, { ...carga, certificadosVendidos: [], motivoRebaixamento: 'Cliente comprou como convencional' });
    expect([r.vendidoComo, r.rebaixamentos]).toEqual(['convencional', 1]);
    const e = await obterEmbarque(ctx, eb);
    expect(e.venda).toMatchObject({ rotulo: 'convencional', rebaixamentos: [{ kg: '60', perdidos: ['RFA'] }] });
    await adicionarNota(ctx, eb, { numeroNota: '77', dataEmissao: hoje(), qtdKg: '60' });
    await finalizarEmbarque(ctx, eb);
    const p = await obterPacote(ctx, eb);
    expect(p.conteudo.lotes[0]).toMatchObject({ certificado_vendido: null, rebaixamentos: [{ kg: 60, perdidos: ['RFA'] }] });
  });
});

describe('RN-22 isolamento da conformidade', () => {
  it('RN-22 a Beta não vê checagens, dossiês, pacotes nem arquivos da Alfa', async () => {
    const eb = (await dono.pacoteEmbarque.findFirstOrThrow({ where: { empresaId: ALFA } })).movimentoId;
    const arq = (await dono.arquivo.findFirstOrThrow({ where: { empresaId: ALFA } })).id;
    await expect(obterPacote(ctxBeta, eb)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(obterDossie(ctxBeta, eb)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(obterArquivo(ctxBeta, arq)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(listarChecagens(ctxBeta, T1)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(checarTalhao(ctxBeta, T1)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    expect((await painelConformidade(ctxBeta)).talhoes.some((t) => t.id === T1)).toBe(false);
  });
});
