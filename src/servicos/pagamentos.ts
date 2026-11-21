import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { calcularItem, dinheiro } from '@/dominio/colheita';
import { precoVigente, type PrecoColheita } from '@/dominio/precos';
import { formatarCpfCnpj } from '@/dominio/documentos';
import { decifrar } from '@/lib/cripto';
import { auditar } from './auditoria';
import { podeRevelar } from './colhedores';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { dec, exigirFazendas, exigirMotivo, fazendasPermitidas, normalizarDecimal, proximoNumero } from './rastreio-base';

/**
 * Fechamento e pagamento dos colhedores (§6.3, RN-20, RN-21).
 * ABERTO: o sistema junta os apontamentos PENDENTES do período e calcula com o preço vigente.
 * FECHADO: o preço fica congelado no apontamento e os apontamentos ficam imutáveis. PAGO: gera PIX e recibos.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato aaaa-mm-dd.');
const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function tabelaDePrecos(tx: Tx): Promise<PrecoColheita[]> {
  return (await tx.tabelaPrecoColheita.findMany({ where: { ativo: true } })).map((p) => ({
    id: p.id, fazendaId: p.fazendaId, talhaoId: p.talhaoId, safraId: p.safraId, tipoColheita: p.tipoColheita, valorPorMedida: p.valorPorMedida.toString(),
    vigenciaInicio: iso(p.vigenciaInicio), vigenciaFim: p.vigenciaFim ? iso(p.vigenciaFim) : null, ativo: p.ativo,
  }));
}

async function travarFechamento(tx: Tx, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Fechamento não encontrado.');
  const r = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM fechamento_pagamento WHERE id = ${id}::uuid FOR UPDATE`;
  if (!r.length) throw new ErroNaoEncontrado('Fechamento não encontrado.');
  return tx.fechamentoPagamento.findFirstOrThrow({ where: { id } });
}

/** Junta apontamentos e lançamentos do período e refaz os itens (só com o fechamento ABERTO). */
async function recalcular(tx: Tx, ctx: Contexto, f: { id: string; fazendaId: string; periodoInicio: Date; periodoFim: Date }) {
  await tx.apontamento.updateMany({
    where: { fazendaId: f.fazendaId, status: 'PENDENTE', fechamentoId: null, data: { gte: f.periodoInicio, lte: f.periodoFim }, medidas: { gt: 0 } },
    data: { fechamentoId: f.id },
  });
  // Apontamento cancelado depois de entrar no fechamento sai dele.
  await tx.apontamento.updateMany({ where: { fechamentoId: f.id, status: 'CANCELADO' }, data: { fechamentoId: null } });
  const apontamentos = await tx.apontamento.findMany({ where: { fechamentoId: f.id } });
  const colhedores = [...new Set(apontamentos.map((a) => a.colhedorId))];
  await tx.lancamentoColhedor.updateMany({ where: { colhedorId: { in: colhedores }, fechamentoId: null, cancelado: false, data: { lte: f.periodoFim } }, data: { fechamentoId: f.id } });
  const lancamentos = await tx.lancamentoColhedor.findMany({ where: { fechamentoId: f.id, cancelado: false } });
  const precos = await tabelaDePrecos(tx);
  const semPreco: string[] = [];
  const preco = (a: (typeof apontamentos)[number]) => {
    if (a.valorUnitario) return a.valorUnitario.toString();
    const p = precoVigente(precos, { data: iso(a.data), safraId: a.safraId, tipoColheita: a.tipoColheita, fazendaId: a.fazendaId, talhaoId: a.talhaoId });
    if (!p) semPreco.push(a.id);
    return p ? String(p.valorPorMedida) : '0';
  };
  await tx.fechamentoItem.deleteMany({ where: { fechamentoId: f.id } });
  const totais = { medidas: new Decimal(0), bruto: new Decimal(0), descontos: new Decimal(0), liquido: new Decimal(0) };
  const todos = [...new Set([...colhedores, ...lancamentos.map((l) => l.colhedorId)])];
  for (const c of todos) {
    const item = calcularItem({
      apontamentos: apontamentos.filter((a) => a.colhedorId === c).map((a) => ({ medidas: a.medidas.toString(), valorUnitario: preco(a) })),
      lancamentos: lancamentos.filter((l) => l.colhedorId === c).map((l) => ({ tipo: l.tipo, valor: l.valor.toString() })),
    });
    await tx.fechamentoItem.create({
      data: {
        empresaId: ctx.empresaId, fechamentoId: f.id, colhedorId: c, medidas: item.medidas.toFixed(3), valorBruto: item.bruto.toFixed(2), adiantamentos: item.adiantamentos.toFixed(2),
        descontos: item.descontos.toFixed(2), adicionais: item.adicionais.toFixed(2), valorLiquido: item.liquido.toFixed(2),
      },
    });
    totais.medidas = totais.medidas.plus(item.medidas);
    totais.bruto = totais.bruto.plus(item.bruto).plus(item.adicionais);
    totais.descontos = totais.descontos.plus(item.adiantamentos).plus(item.descontos);
    totais.liquido = totais.liquido.plus(item.liquido);
  }
  await tx.fechamentoPagamento.update({
    where: { id: f.id },
    data: { totalMedidas: totais.medidas.toFixed(3), totalBruto: dinheiro(totais.bruto).toFixed(2), totalDescontos: dinheiro(totais.descontos).toFixed(2), totalLiquido: dinheiro(totais.liquido).toFixed(2), alteradoPor: ctx.usuarioId },
  });
  return { semPreco, apontamentos };
}

const abrirSchema = z.object({ fazendaId: z.string().uuid(), periodoInicio: dataIso, periodoFim: dataIso });

/** FINANCEIRO abre o período de uma fazenda. Períodos da mesma fazenda não se sobrepõem (RN-21). */
export async function abrirFechamento(ctx: Contexto, entrada: z.input<typeof abrirSchema>) {
  exigir(ctx, 'pagamento.fechar');
  const d = abrirSchema.parse(entrada);
  if (d.periodoFim < d.periodoInicio) throw new ErroValidacao('O fim do período vem antes do início.', 'periodoFim');
  try {
    return await comTransacao(ctx, async (tx) => {
      if (!(await tx.fazenda.findFirst({ where: { id: d.fazendaId } }))) throw new ErroNaoEncontrado('Fazenda não encontrada.');
      exigirFazendas(await fazendasPermitidas(tx, ctx), [d.fazendaId]);
      const sobreposto = await tx.fechamentoPagamento.findFirst({
        where: { fazendaId: d.fazendaId, status: { not: 'CANCELADO' }, periodoInicio: { lte: dia(d.periodoFim) }, periodoFim: { gte: dia(d.periodoInicio) } },
      });
      if (sobreposto) throw new ErroRegra('RN-21', `O período cruza o fechamento nº ${sobreposto.numero} (${iso(sobreposto.periodoInicio)} a ${iso(sobreposto.periodoFim)}) desta fazenda.`);
      const numero = await proximoNumero(tx, ctx.empresaId, 'fechamento');
      const f = await tx.fechamentoPagamento.create({ data: { empresaId: ctx.empresaId, numero, fazendaId: d.fazendaId, periodoInicio: dia(d.periodoInicio), periodoFim: dia(d.periodoFim), criadoPor: ctx.usuarioId } });
      await recalcular(tx, ctx, f);
      await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'CRIAR', depois: d });
      return f;
    });
  } catch (e) {
    // A restrição de exclusão do banco garante a RN-21 mesmo com duas aberturas simultâneas.
    if (e instanceof Error && !(e instanceof ErroRegra) && /fechamento_sem_sobreposicao/.test(e.message))
      throw new ErroRegra('RN-21', 'O período cruza outro fechamento desta fazenda.');
    throw e;
  }
}

/** Refaz o cálculo de um fechamento aberto (apontamentos sincronizados depois, novos lançamentos). */
export async function atualizarFechamento(ctx: Contexto, id: string) {
  exigir(ctx, 'pagamento.fechar');
  return comTransacao(ctx, async (tx) => {
    const f = await travarFechamento(tx, id);
    if (f.status !== 'ABERTO') throw new ErroValidacao('Só o fechamento aberto é recalculado.');
    return recalcular(tx, ctx, f);
  });
}

const lancamentoSchema = z.object({
  colhedorId: z.string().uuid(),
  data: dataIso,
  tipo: z.enum(['ADIANTAMENTO', 'DESCONTO', 'ADICIONAL']),
  valor: z.union([z.string(), z.number()]).transform(normalizarDecimal),
  descricao: z.string().trim().max(200).optional().nullable(),
});

/** Adiantamento, desconto ou adicional de um colhedor; entra no fechamento aberto do período. */
export async function lancarParaColhedor(ctx: Contexto, entrada: z.input<typeof lancamentoSchema>) {
  exigir(ctx, 'pagamento.fechar');
  const d = lancamentoSchema.parse(entrada);
  let valor: Decimal;
  try {
    valor = dinheiro(d.valor);
  } catch {
    throw new ErroValidacao('Valor inválido.', 'valor');
  }
  if (valor.lte(0)) throw new ErroValidacao('O valor deve ser maior que zero.', 'valor');
  return comTransacao(ctx, async (tx) => {
    if (!(await tx.colhedor.findFirst({ where: { id: d.colhedorId } }))) throw new ErroNaoEncontrado('Colhedor não encontrado.');
    const l = await tx.lancamentoColhedor.create({ data: { empresaId: ctx.empresaId, colhedorId: d.colhedorId, data: dia(d.data), tipo: d.tipo, valor: valor.toFixed(2), descricao: d.descricao || null, criadoPor: ctx.usuarioId } });
    const aberto = await tx.fechamentoPagamento.findFirst({ where: { status: 'ABERTO', periodoFim: { gte: dia(d.data) }, apontamentos: { some: { colhedorId: d.colhedorId } } }, orderBy: { periodoInicio: 'asc' } });
    if (aberto) await recalcular(tx, ctx, aberto);
    await auditar(tx, ctx, { entidade: 'lancamento_colhedor', entidadeId: l.id, acao: 'CRIAR', depois: { ...d, valor: l.valor } });
    return l;
  });
}

/** Fechar: congela o preço em cada apontamento (RN-20) e torna os apontamentos imutáveis (RN-19). */
export async function fecharFechamento(ctx: Contexto, id: string) {
  exigir(ctx, 'pagamento.fechar');
  return comTransacao(ctx, async (tx) => {
    const f = await travarFechamento(tx, id);
    if (f.status !== 'ABERTO') throw new ErroValidacao('O fechamento não está aberto.');
    const { semPreco, apontamentos } = await recalcular(tx, ctx, f);
    if (semPreco.length) throw new ErroRegra('RN-20', `${semPreco.length} apontamento(s) sem preço vigente. Cadastre a tabela de preços de colheita antes de fechar.`);
    if (!apontamentos.length) throw new ErroValidacao('Não há apontamentos no período.');
    await tx.$queryRaw`SELECT id FROM apontamento WHERE fechamento_id = ${f.id}::uuid FOR UPDATE`;
    const precos = await tabelaDePrecos(tx);
    for (const a of apontamentos) {
      const p = precoVigente(precos, { data: iso(a.data), safraId: a.safraId, tipoColheita: a.tipoColheita, fazendaId: a.fazendaId, talhaoId: a.talhaoId })!;
      await tx.apontamento.update({ where: { id: a.id }, data: { valorUnitario: dinheiro(String(p.valorPorMedida)).toFixed(2), status: 'FECHADO', alteradoPor: ctx.usuarioId } });
    }
    await recalcular(tx, ctx, f);
    const fechado = await tx.fechamentoPagamento.update({ where: { id: f.id }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'FECHAR', depois: { totalLiquido: fechado.totalLiquido, apontamentos: apontamentos.length } });
    return fechado;
  });
}

/** Reabrir: só ADMIN_EMPRESA, com motivo, e só se não estiver PAGO (§6.3). O preço volta a ser o da tabela. */
export async function reabrirFechamento(ctx: Contexto, id: string, motivo: string) {
  if (ctx.perfil !== 'ADMIN_EMPRESA') throw new ErroPermissao('Só o administrador reabre um fechamento.');
  const m = exigirMotivo(motivo, 'o motivo da reabertura');
  return comTransacao(ctx, async (tx) => {
    const f = await travarFechamento(tx, id);
    if (f.status === 'PAGO') throw new ErroRegra('RN-20', 'Fechamento pago não se reabre.');
    if (f.status !== 'FECHADO') throw new ErroValidacao('O fechamento não está fechado.');
    await tx.apontamento.updateMany({ where: { fechamentoId: f.id, status: 'FECHADO' }, data: { status: 'PENDENTE', valorUnitario: null, alteradoPor: ctx.usuarioId } });
    const r = await tx.fechamentoPagamento.update({ where: { id: f.id }, data: { status: 'ABERTO', fechadoEm: null, fechadoPor: null, motivoReabertura: m, alteradoPor: ctx.usuarioId } });
    await recalcular(tx, ctx, r);
    await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'REABRIR', depois: { motivo: m } });
    return r;
  });
}

export async function pagarFechamento(ctx: Contexto, id: string) {
  exigir(ctx, 'pagamento.fechar');
  return comTransacao(ctx, async (tx) => {
    const f = await travarFechamento(tx, id);
    if (f.status !== 'FECHADO') throw new ErroValidacao('Só se paga um fechamento fechado.');
    const r = await tx.fechamentoPagamento.update({ where: { id: f.id }, data: { status: 'PAGO', pagoEm: new Date(), pagoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'PAGAR', depois: { totalLiquido: f.totalLiquido } });
    return r;
  });
}

/** Cancelar um fechamento aberto: os apontamentos e lançamentos voltam a ficar livres. */
export async function cancelarFechamento(ctx: Contexto, id: string, motivo: string) {
  exigir(ctx, 'pagamento.fechar');
  const m = exigirMotivo(motivo);
  return comTransacao(ctx, async (tx) => {
    const f = await travarFechamento(tx, id);
    if (f.status !== 'ABERTO') throw new ErroValidacao('Só se cancela um fechamento aberto.');
    await tx.apontamento.updateMany({ where: { fechamentoId: f.id }, data: { fechamentoId: null } });
    await tx.lancamentoColhedor.updateMany({ where: { fechamentoId: f.id }, data: { fechamentoId: null } });
    const r = await tx.fechamentoPagamento.update({ where: { id: f.id }, data: { status: 'CANCELADO', motivoCancelamento: m, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'CANCELAR', depois: { motivo: m } });
    return r;
  });
}

// ================================================================ consultas

export async function listarFechamentos(ctx: Contexto) {
  return comTransacao(ctx, async (tx) =>
    (await tx.fechamentoPagamento.findMany({ include: { fazenda: { select: { codigo: true } }, _count: { select: { itens: true } } }, orderBy: { numero: 'desc' }, take: 200 })).map((f) => ({
      id: f.id, numero: f.numero, fazenda: f.fazenda.codigo, periodoInicio: iso(f.periodoInicio), periodoFim: iso(f.periodoFim), status: f.status,
      totalMedidas: f.totalMedidas.toString(), totalLiquido: f.totalLiquido.toString(), colhedores: f._count.itens,
    })),
  );
}

export async function obterFechamento(ctx: Contexto, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Fechamento não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const f = await tx.fechamentoPagamento.findFirst({
      where: { id },
      include: {
        fazenda: { select: { codigo: true, nome: true } },
        itens: { include: { colhedor: { select: { id: true, nome: true, apelido: true, cpfMascara: true, pixMascara: true } } }, orderBy: { colhedor: { nome: 'asc' } } },
        apontamentos: { include: { colhedor: { select: { nome: true } }, talhao: { select: { codigo: true } } }, orderBy: [{ data: 'asc' }, { colhedor: { nome: 'asc' } }] },
        lancamentos: { where: { cancelado: false }, include: { colhedor: { select: { nome: true } } }, orderBy: { data: 'asc' } },
      },
    });
    if (!f) throw new ErroNaoEncontrado('Fechamento não encontrado.');
    const precos = f.status === 'ABERTO' ? await tabelaDePrecos(tx) : [];
    return {
      id: f.id, numero: f.numero, status: f.status, fazenda: `${f.fazenda.codigo} · ${f.fazenda.nome}`, fazendaId: f.fazendaId, periodoInicio: iso(f.periodoInicio), periodoFim: iso(f.periodoFim),
      totais: { medidas: f.totalMedidas.toString(), bruto: f.totalBruto.toString(), descontos: f.totalDescontos.toString(), liquido: f.totalLiquido.toString() },
      fechadoEm: f.fechadoEm, pagoEm: f.pagoEm, motivoReabertura: f.motivoReabertura, motivoCancelamento: f.motivoCancelamento,
      itens: f.itens.map((i) => ({
        colhedorId: i.colhedorId, colhedor: i.colhedor.apelido ? `${i.colhedor.nome} (${i.colhedor.apelido})` : i.colhedor.nome, cpf: i.colhedor.cpfMascara, chavePix: i.colhedor.pixMascara,
        medidas: i.medidas.toString(), bruto: i.valorBruto.toString(), adiantamentos: i.adiantamentos.toString(), descontos: i.descontos.toString(), adicionais: i.adicionais.toString(), liquido: i.valorLiquido.toString(),
      })),
      apontamentos: f.apontamentos.map((a) => {
        const p = a.valorUnitario?.toString() ?? precoVigente(precos, { data: iso(a.data), safraId: a.safraId, tipoColheita: a.tipoColheita, fazendaId: a.fazendaId, talhaoId: a.talhaoId })?.valorPorMedida?.toString() ?? null;
        return { id: a.id, data: iso(a.data), colhedor: a.colhedor.nome, talhao: a.talhao.codigo, medidas: a.medidas.toString(), valorUnitario: p, congelado: !!a.valorUnitario, status: a.status };
      }),
      lancamentos: f.lancamentos.map((l) => ({ id: l.id, data: iso(l.data), colhedor: l.colhedor.nome, tipo: l.tipo, valor: l.valor.toString(), descricao: l.descricao })),
    };
  });
}

const csv = (linhas: (string | null)[][]) => '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

/** Lista PIX (§6.3): nome, CPF, chave PIX e valor. Dados abertos: só FINANCEIRO/ADMIN, e a geração é auditada (§3.3). */
export async function listaPix(ctx: Contexto, id: string) {
  exigir(ctx, 'pagamento.fechar');
  if (!podeRevelar(ctx)) throw new ErroPermissao('Só o financeiro e o administrador geram a lista PIX (dados sem máscara).');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Fechamento não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const f = await tx.fechamentoPagamento.findFirst({ where: { id }, include: { itens: { include: { colhedor: true }, orderBy: { colhedor: { nome: 'asc' } } } } });
    if (!f) throw new ErroNaoEncontrado('Fechamento não encontrado.');
    if (f.status !== 'FECHADO' && f.status !== 'PAGO') throw new ErroValidacao('Feche o período antes de gerar a lista PIX.');
    const linhas = f.itens.filter((i) => dec(i.valorLiquido).gt(0)).map((i) => [
      i.colhedor.nome, i.colhedor.cpfCifrado ? formatarCpfCnpj(decifrar(i.colhedor.cpfCifrado)) : '', i.colhedor.pixCifrado ? decifrar(i.colhedor.pixCifrado) : '', dec(i.valorLiquido).toFixed(2).replace('.', ','),
    ]);
    await auditar(tx, ctx, { entidade: 'fechamento_pagamento', entidadeId: f.id, acao: 'REVELAR', depois: { documento: 'lista PIX', colhedores: f.itens.map((i) => i.colhedorId) } });
    return { nome: `pix-fechamento-${f.numero}.csv`, conteudo: csv([['Nome', 'CPF', 'Chave PIX', 'Valor'], ...linhas]) };
  });
}

/** Dados dos recibos (o PDF é montado em src/lib/pdf-recibos). CPF sai mascarado. */
export async function dadosRecibos(ctx: Contexto, id: string) {
  exigir(ctx, 'pagamento.fechar');
  const f = await obterFechamento(ctx, id);
  if (f.status !== 'FECHADO' && f.status !== 'PAGO') throw new ErroValidacao('Feche o período antes de emitir os recibos.');
  const empresa = await comTransacao(ctx, (tx) => tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { nome: true, cnpj: true } }));
  return { empresa: empresa?.nome ?? '', cnpj: empresa?.cnpj ?? null, fechamento: f };
}

// ================================================================ relatórios de produção (§6.3)

export async function relatorioProducao(ctx: Contexto, f: { inicio: string; fim: string; fazendaId?: string; agrupar: 'colhedor' | 'turma' | 'talhao' }) {
  const p = z.object({ inicio: dataIso, fim: dataIso, fazendaId: z.string().uuid().optional(), agrupar: z.enum(['colhedor', 'turma', 'talhao']) }).parse(f);
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.apontamento.findMany({
      where: { status: { not: 'CANCELADO' }, data: { gte: dia(p.inicio), lte: dia(p.fim) }, ...(p.fazendaId ? { fazendaId: p.fazendaId } : {}) },
      include: { colhedor: { select: { nome: true } }, turma: { select: { nome: true } }, talhao: { select: { codigo: true, nome: true } }, fazenda: { select: { codigo: true } } },
    });
    const precos = await tabelaDePrecos(tx);
    const grupos = new Map<string, { chave: string; medidas: Decimal; valor: Decimal; dias: Set<string>; apontamentos: number }>();
    for (const a of lista) {
      const chave = p.agrupar === 'colhedor' ? a.colhedor.nome : p.agrupar === 'turma' ? `${a.fazenda.codigo} · ${a.turma?.nome ?? 'sem turma'}` : `${a.fazenda.codigo} · ${a.talhao.codigo} ${a.talhao.nome}`;
      const g = grupos.get(chave) ?? { chave, medidas: new Decimal(0), valor: new Decimal(0), dias: new Set<string>(), apontamentos: 0 };
      const preco = a.valorUnitario?.toString() ?? precoVigente(precos, { data: iso(a.data), safraId: a.safraId, tipoColheita: a.tipoColheita, fazendaId: a.fazendaId, talhaoId: a.talhaoId })?.valorPorMedida?.toString() ?? '0';
      g.medidas = g.medidas.plus(dec(a.medidas));
      g.valor = g.valor.plus(dinheiro(dec(a.medidas).times(preco)));
      g.dias.add(iso(a.data));
      g.apontamentos++;
      grupos.set(chave, g);
    }
    // Custo por saca (aproximado pela composição): Σ custo dos apontamentos do talhão ÷ sacas no estoque cuja composição inclui o talhão.
    let custoPorSaca: { talhao: string; custo: string; sacas: string; porSaca: string | null }[] = [];
    if (p.agrupar === 'talhao') {
      const talhoes = [...new Set(lista.map((a) => a.talhaoId))];
      const kg = await tx.loteTalhao.groupBy({ by: ['talhaoId'], where: { talhaoId: { in: talhoes }, lote: { status: { not: 'ESTORNADO' }, etapa: { classe: 'ESTOQUE' }, origemTipo: 'PROCESSO', movimento: { natureza: 'NORMAL', entradas: { some: {} } } } }, _sum: { quantidadeEquivalente: true } });
      custoPorSaca = talhoes.map((t) => {
        const a = lista.find((x) => x.talhaoId === t)!;
        const g = grupos.get(`${a.fazenda.codigo} · ${a.talhao.codigo} ${a.talhao.nome}`)!;
        const sacas = dec(kg.find((k) => k.talhaoId === t)?._sum.quantidadeEquivalente).div(60);
        return { talhao: g.chave, custo: g.valor.toFixed(2), sacas: sacas.toFixed(2), porSaca: sacas.gt(0) ? g.valor.div(sacas).toFixed(2) : null };
      });
    }
    return {
      linhas: [...grupos.values()].sort((a, b) => b.medidas.comparedTo(a.medidas)).map((g) => ({ chave: g.chave, medidas: g.medidas.toFixed(3), valor: g.valor.toFixed(2), dias: g.dias.size, apontamentos: g.apontamentos })),
      custoPorSaca,
    };
  });
}
