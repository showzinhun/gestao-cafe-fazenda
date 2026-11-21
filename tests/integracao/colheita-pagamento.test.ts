import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Contexto } from '@/servicos/transacao';
import { alterar, listar } from '@/servicos/cadastros';
import { alterarUsuario } from '@/servicos/usuarios';
import { listarColhedores, revelarDadosColhedor, salvarColhedor, dadosDoCampo } from '@/servicos/colhedores';
import { corrigirApontamento, listarApontamentos, sincronizar, type RegistroCampo } from '@/servicos/apontamentos';
import { registrarCarga } from '@/servicos/movimentos';
import { abrirFechamento, cancelarFechamento, dadosRecibos, fecharFechamento, lancarParaColhedor, listaPix, obterFechamento, pagarFechamento, reabrirFechamento, relatorioProducao } from '@/servicos/pagamentos';
import { gerarRecibosPdf } from '@/lib/pdf-recibos';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra } from '@/dominio/erros';
import { SEED } from '../../prisma/dados-seed';

const dono = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const ALFA = SEED.empresas.alfa.id;
const u = (email: string) => SEED.usuarios.find((x) => x.email === email)!.id;
const ctx: Contexto = { empresaId: ALFA, usuarioId: u('admin@alfa.exemplo'), perfil: 'ADMIN_EMPRESA' };
const apontador: Contexto = { empresaId: ALFA, usuarioId: u('apontador@alfa.exemplo'), perfil: 'APONTADOR' };
const financeiro: Contexto = { empresaId: ALFA, usuarioId: u('financeiro@alfa.exemplo'), perfil: 'FINANCEIRO' };
const gestor: Contexto = { empresaId: ALFA, usuarioId: u('consultora@exemplo.com'), perfil: 'GESTOR' };
const operador: Contexto = { empresaId: ALFA, usuarioId: u('operador@alfa.exemplo'), perfil: 'OPERADOR' };
const ctxBeta: Contexto = { empresaId: SEED.empresas.beta.id, usuarioId: u('admin@beta.exemplo'), perfil: 'ADMIN_EMPRESA' };
const NS = SEED.fazendas.find((f) => f.codigo === 'NS')!.id;
const T1 = SEED.talhoes.find((t) => t.codigo === 'T1')!.id;
const T2 = SEED.talhoes.find((t) => t.codigo === 'T2')!.id;
const [JOAO, MARIA, PEDRO] = SEED.colhedores.map((c) => c.id) as [string, string, string];
const TURMA = SEED.turmas[0].id;

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ontem = new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
let SAFRA: string;
let NAT: string;

async function regra(p: Promise<unknown>, codigo: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroRegra);
  expect((e as ErroRegra).codigo).toBe(codigo);
}
const reg = (colhedorId: string, medidas: string, extra: Partial<RegistroCampo> = {}): RegistroCampo =>
  ({ id: randomUUID(), data: hoje, fazendaId: NS, talhaoId: T1, safraId: SAFRA, colhedorId, turmaId: TURMA, medidas, ...extra });

beforeAll(async () => {
  SAFRA = ((await listar(ctx, 'safras')) as { id: string; codigo: string }[]).find((s) => s.codigo === '2025/26')!.id;
  NAT = ((await listar(ctx, 'tipos-cafe')) as { id: string; codigo: string }[]).find((t) => t.codigo === 'NAT')!.id;
  // A gestora corrige apontamentos da NS: precisa da fazenda liberada (RN-04).
  await alterarUsuario(ctx, gestor.usuarioId, { perfil: 'GESTOR', ativo: true, fazendaIds: [NS] });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dono.$disconnect();
});

describe('colhedores e LGPD (§3.3)', () => {
  it('lista só com máscara; CPF e PIX ficam cifrados no banco', async () => {
    const lista = await listarColhedores(ctx);
    expect(lista.find((c) => c.id === JOAO)).toMatchObject({ cpf: '***.***.447-05', chavePix: 'jo***@exemplo.com' });
    const bruto = await dono.colhedor.findUniqueOrThrow({ where: { id: JOAO } });
    expect(bruto.cpfCifrado).not.toContain('390533447');
    expect(bruto.pixCifrado).not.toContain('joao');
  });

  it('só FINANCEIRO e ADMIN revelam; cada revelação é auditada', async () => {
    await expect(revelarDadosColhedor(operador, JOAO)).rejects.toBeInstanceOf(ErroPermissao);
    await expect(revelarDadosColhedor(gestor, JOAO)).rejects.toBeInstanceOf(ErroPermissao);
    expect(await revelarDadosColhedor(financeiro, JOAO)).toEqual({ cpf: '390.533.447-05', chavePix: 'joao.ficticio@exemplo.com' });
    const a = await dono.auditoria.findMany({ where: { entidadeId: JOAO, acao: 'REVELAR' } });
    expect(a.map((x) => x.usuarioId)).toContain(financeiro.usuarioId);
    const log = await dono.auditoria.findMany({ where: { entidadeId: JOAO } });
    expect(JSON.stringify(log)).not.toContain('390.533.447-05');
  });

  it('CPF inválido ou repetido é recusado', async () => {
    await expect(salvarColhedor(ctx, null, { nome: 'Teste', cpf: '111.111.111-11' })).rejects.toThrow(/CPF inválido/);
    await expect(salvarColhedor(ctx, null, { nome: 'Teste', cpf: '390.533.447-05' })).rejects.toThrow(/já existe/i);
  });

  it('o app de campo recebe só as fazendas liberadas do apontador (RN-04)', async () => {
    const d = await dadosDoCampo(apontador);
    expect(d.fazendas.map((f) => f.codigo)).toEqual(['NS']);
    expect(d.turmas[0]!.colhedores.map((c) => c.apelido)).toEqual(['João', 'Maria', 'Pedro']);
    expect(JSON.stringify(d)).not.toContain('cpf');
  });
});

describe('apontamento offline e sincronização (§6.1, RN-19, RN-23)', () => {
  const lote1 = () => [reg(JOAO, '40'), reg(MARIA, '35'), reg(PEDRO, '25')];
  let envio: RegistroCampo[];

  it('passo 1 do §15: 100 medidas em T1; sincronizar duas vezes continua com 3 apontamentos (RN-23)', async () => {
    envio = lote1();
    const r1 = await sincronizar(apontador, { dispositivoId: 'celular-1', apontamentos: envio });
    expect(r1.map((r) => r.situacao)).toEqual(['gravado', 'gravado', 'gravado']);
    const r2 = await sincronizar(apontador, { dispositivoId: 'celular-1', apontamentos: envio });
    expect(r2.map((r) => r.situacao)).toEqual(['repetido', 'repetido', 'repetido']);
    const lista = await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T1, data: hoje });
    expect(lista).toHaveLength(3);
    expect(lista.map((a) => a.medidas).sort()).toEqual(['25.000', '35.000', '40.000']);
  });

  it('RN-19 o mesmo colhedor no mesmo talhão e dia vira um apontamento só (somado); medidas > 0', async () => {
    const a = reg(JOAO, '10', { talhaoId: T2 });
    const b = reg(JOAO, '5', { talhaoId: T2 });
    await sincronizar(apontador, { dispositivoId: 'celular-1', apontamentos: [a] });
    const [rb] = await sincronizar(apontador, { dispositivoId: 'celular-2', apontamentos: [b] });
    expect(rb).toMatchObject({ situacao: 'gravado', apontamentoId: a.id, medidas: '15.000' });
    const [r0] = await sincronizar(apontador, { apontamentos: [reg(MARIA, '0', { talhaoId: T2 })] });
    expect(r0).toMatchObject({ situacao: 'erro' });
    // Corrigir o próprio registro no mesmo dia: vale a diferença.
    const [rc] = await sincronizar(apontador, { apontamentos: [{ ...b, medidas: '2' }] });
    expect(rc).toMatchObject({ situacao: 'gravado', medidas: '12.000' });
  });

  it('RN-19 o apontador não corrige depois do dia; o gestor corrige com motivo', async () => {
    const velho = reg(PEDRO, '8', { talhaoId: T2, data: ontem });
    await sincronizar(apontador, { apontamentos: [velho] });
    const [r] = await sincronizar(apontador, { apontamentos: [{ ...velho, medidas: '9' }] });
    expect(r).toMatchObject({ situacao: 'conflito', medidas: '8.000' });
    await expect(corrigirApontamento(apontador, velho.id, { medidas: '9', motivo: 'conferência da turma' })).rejects.toBeInstanceOf(ErroPermissao);
    const c = await corrigirApontamento(gestor, velho.id, { medidas: '9', motivo: 'conferência da turma' });
    expect([c.medidas.toString(), c.versao]).toEqual(['9', 2]);
  });

  it('RN-23 conflito: o servidor mudou depois da leitura offline; vale o servidor e o app recebe o valor', async () => {
    const x = reg(MARIA, '6', { talhaoId: T2 });
    const [r1] = await sincronizar(apontador, { apontamentos: [x] });
    await corrigirApontamento(gestor, (r1 as { apontamentoId: string }).apontamentoId, { medidas: '7', motivo: 'recontagem no talhão' });
    const [r2] = await sincronizar(apontador, { apontamentos: [{ ...x, medidas: '6.5', versaoBase: 1 }] });
    expect(r2).toMatchObject({ situacao: 'conflito', medidas: '7.000', versao: 2 });
  });
});

describe('carga ligada aos apontamentos (§6.2)', () => {
  it('passo 3: C1 (T1, NAT, recepção 100) ligada aos 3 apontamentos → divergência 0 e lote de 100', async () => {
    const ids = (await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T1, data: hoje, semCarga: true })).map((a) => a.id);
    expect(ids).toHaveLength(3);
    const r = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: NAT, quantidade: '100', apontamentoIds: ids });
    expect([r.carga.medidasApontadas.toString(), r.carga.divergencia.toString(), r.carga.alertaDivergencia, r.alertas]).toEqual(['100', '0', false, []]);
    expect(r.lote.quantidade.toString()).toBe('100');
    await expect(registrarCarga(ctx, { fazendaId: NS, talhaoId: T1, safraId: SAFRA, tipoCafeId: NAT, quantidade: '10', apontamentoIds: ids.slice(0, 1) })).rejects.toThrow(/outra carga/);
  });

  it('divergência acima do limite gera alerta; colheita mecânica não tem apontamentos', async () => {
    const ids = (await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T2, data: hoje, semCarga: true })).map((a) => a.id);
    const r = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T2, safraId: SAFRA, tipoCafeId: NAT, quantidade: '30', apontamentoIds: ids });
    expect(r.carga.alertaDivergencia).toBe(true);
    expect(r.alertas[0]!.mensagem).toMatch(/Divergência/);
    const m = await registrarCarga(ctx, { fazendaId: NS, talhaoId: T2, safraId: SAFRA, tipoCafeId: NAT, quantidade: '50', modoColheita: 'MECANICA', operadorMaquina: 'Colhedora 1 (fictícia)' });
    expect([m.carga.tipoColheita, m.carga.medidasApontadas.toString()]).toEqual(['MECANICA', '0']);
  });
});

describe('fechamento e pagamento (§6.3, passo 9)', () => {
  let fechamentoId: string;

  it('passo 9: João R$ 480, Maria R$ 420, Pedro R$ 300; total R$ 1.200 (só T1 hoje)', async () => {
    // Os apontamentos de T2 de hoje e de ontem ficam fora: período só de hoje, e os de T2 vão para outro fechamento.
    const f = await abrirFechamento(financeiro, { fazendaId: NS, periodoInicio: hoje, periodoFim: hoje });
    fechamentoId = f.id;
    const d = await obterFechamento(financeiro, f.id);
    const porNome = Object.fromEntries(d.itens.map((i) => [i.colhedor.split(' (')[0], i]));
    expect(porNome['João da Silva']!.medidas).toBe('52'); // 40 em T1 + 12 em T2
    expect(d.apontamentos.filter((a) => a.talhao === 'T1').map((a) => [a.colhedor.split(' ')[0], a.valorUnitario])).toEqual([['João', '12'], ['Maria', '12'], ['Pedro', '12']]);
  });

  it('RN-21 períodos da mesma fazenda não se sobrepõem', async () => {
    await regra(abrirFechamento(financeiro, { fazendaId: NS, periodoInicio: ontem, periodoFim: hoje }), 'RN-21');
  });

  it('fechar congela o preço (RN-20) e os apontamentos ficam imutáveis (RN-19)', async () => {
    await cancelarFechamento(financeiro, fechamentoId, 'refazer só com o talhão T1');
    // Tira os apontamentos de T2 de hoje do período: corrige-os para zero (cancelados).
    for (const a of await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T2, data: hoje })) await corrigirApontamento(gestor, a.id, { medidas: '0', motivo: 'teste do passo 9' });
    const f = await abrirFechamento(financeiro, { fazendaId: NS, periodoInicio: hoje, periodoFim: hoje });
    fechamentoId = f.id;
    const fechado = await fecharFechamento(financeiro, f.id);
    expect(fechado.totalLiquido.toString()).toBe('1200');
    const d = await obterFechamento(financeiro, f.id);
    expect(d.itens.map((i) => [i.colhedor.split(' ')[0], i.liquido])).toEqual([['João', '480'], ['Maria', '420'], ['Pedro', '300']]);

    const joao = (await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T1, data: hoje })).find((a) => a.colhedorId === JOAO)!;
    const origem = await dono.apontamentoOrigem.findFirstOrThrow({ where: { apontamentoId: joao.id } });
    const [r] = await sincronizar(apontador, { apontamentos: [reg(JOAO, '41', { id: origem.id })] });
    expect(r).toMatchObject({ situacao: 'conflito' });
    await regra(corrigirApontamento(gestor, joao.id, { medidas: '41', motivo: 'tentativa depois do fechamento' }), 'RN-19');

    const preco = (await listar(ctx, 'precos-colheita')) as { id: string; fazendaId: string | null }[];
    await alterar(ctx, 'precos-colheita', preco.find((p) => p.fazendaId === NS)!.id, { valorPorMedida: '13,00' });
    expect((await obterFechamento(financeiro, f.id)).totais.liquido).toBe('1200');
  });

  it('lista PIX com dados abertos só para o financeiro, auditada; recibos em PDF', async () => {
    const pix = await listaPix(financeiro, fechamentoId);
    expect(pix.conteudo).toContain('"João da Silva (fictício)";"390.533.447-05";"joao.ficticio@exemplo.com";"480,00"');
    await expect(listaPix(gestor, fechamentoId)).rejects.toBeInstanceOf(ErroPermissao);
    expect(await dono.auditoria.count({ where: { entidadeId: fechamentoId, acao: 'REVELAR' } })).toBe(1);
    const pdf = await gerarRecibosPdf(await dadosRecibos(financeiro, fechamentoId));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('reabrir: só ADMIN, com motivo, e nunca depois de pago', async () => {
    await expect(reabrirFechamento(financeiro, fechamentoId, 'conferência')).rejects.toBeInstanceOf(ErroPermissao);
    const r = await reabrirFechamento(ctx, fechamentoId, 'conferência do Pedro');
    expect(r.status).toBe('ABERTO');
    expect((await listarApontamentos(ctx, { fazendaId: NS, talhaoId: T1, data: hoje })).every((a) => a.status === 'PENDENTE')).toBe(true);
    // Reaberto, o preço volta a ser o da tabela (agora R$ 13,00).
    expect((await fecharFechamento(financeiro, fechamentoId)).totalLiquido.toString()).toBe('1300');
    await pagarFechamento(financeiro, fechamentoId);
    await regra(reabrirFechamento(ctx, fechamentoId, 'depois de pago'), 'RN-20');
  });

  it('adiantamento entra no fechamento do período do colhedor', async () => {
    const f = await abrirFechamento(financeiro, { fazendaId: NS, periodoInicio: ontem, periodoFim: ontem });
    await lancarParaColhedor(financeiro, { colhedorId: PEDRO, data: ontem, tipo: 'ADIANTAMENTO', valor: '20,00', descricao: 'vale' });
    const d = await obterFechamento(financeiro, f.id);
    const pedro = d.itens.find((i) => i.colhedorId === PEDRO)!;
    expect([pedro.medidas, pedro.bruto, pedro.adiantamentos, pedro.liquido]).toEqual(['9', '117', '20', '97']);
  });

  it('relatório de produção por colhedor', async () => {
    const r = await relatorioProducao(ctx, { inicio: hoje, fim: hoje, fazendaId: NS, agrupar: 'colhedor' });
    expect(r.linhas.find((l) => l.chave.startsWith('João'))).toMatchObject({ medidas: '40.000' });
    const t = await relatorioProducao(ctx, { inicio: ontem, fim: hoje, agrupar: 'talhao' });
    expect(t.custoPorSaca.length).toBeGreaterThan(0);
  });

  it('RN-22 colhedores, apontamentos e fechamentos não atravessam empresas', async () => {
    expect(await listarColhedores(ctxBeta)).toEqual([]);
    expect(await listarApontamentos(ctxBeta)).toEqual([]);
    await expect(obterFechamento(ctxBeta, fechamentoId)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    await expect(revelarDadosColhedor(ctxBeta, JOAO)).rejects.toBeInstanceOf(ErroNaoEncontrado);
    const [r] = await sincronizar(ctxBeta, { apontamentos: [reg(JOAO, '1')] });
    expect(r!.situacao).toBe('erro');
  });
});
