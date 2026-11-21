import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { codigoContrato, contratoCumprido, diasAte, kgDoContrato, resumoFixacoes } from '@/dominio/comercial';
import { saldoLivre } from '@/dominio/lote';
import { qtd } from '@/dominio/quantidade';
import { auditar } from './auditoria';
import { emitirAlerta } from './alertas';
import { exigirContratoAtivo, validarLoteParaContrato } from './regras-contrato';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { dataLocal, dec, exigirMotivo, gravarLote, normalizarDecimal, proximoNumero, quantidadeSchema, travarLotes } from './rastreio-base';

/** Contratos, reservas por contrato, fixações, amostras e painel comercial (§9). */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dataOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));
const dinheiroOpc = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : new Decimal(normalizarDecimal(v)).toDecimalPlaces(2).toString()));
const texto = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const contratoSchema = z.object({
  clienteId: z.string().uuid(),
  safraId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  quantidadeSacas: quantidadeSchema,
  toleranciaPerc: z.union([z.string(), z.number()]).default('0').transform((v) => new Decimal(normalizarDecimal(v)).toDecimalPlaces(6).toString()),
  descricaoPadrao: texto(300),
  peneiraMinId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  moeda: z.enum(['BRL', 'USD']).default('BRL'),
  tipoPreco: z.enum(['FIXO', 'A_FIXAR']),
  precoPorSaca: dinheiroOpc,
  diferencial: dinheiroOpc,
  referenciaBolsa: texto(60),
  prazoEmbarqueInicio: dataOpc,
  prazoEmbarqueFim: dataOpc,
  incoterm: texto(10),
  destinoPais: texto(60),
  exigeEudr: z.boolean().default(false),
  observacao: texto(1000),
  certificadoIds: z.array(z.string().uuid()).default([]),
});

async function validarContrato(tx: Tx, d: z.output<typeof contratoSchema>) {
  const cliente = await tx.parceiro.findFirst({ where: { id: d.clienteId } });
  if (!cliente) throw new ErroNaoEncontrado('Cliente não encontrado.');
  if (!cliente.papeis.includes('CLIENTE')) throw new ErroValidacao(`${cliente.nome} não está cadastrado como cliente.`, 'clienteId');
  if (d.tipoPreco === 'FIXO' && !d.precoPorSaca) throw new ErroValidacao('Informe o preço por saca do contrato fixo.', 'precoPorSaca');
  if (new Decimal(d.toleranciaPerc).lt(0) || new Decimal(d.toleranciaPerc).gt('0.2')) throw new ErroValidacao('Tolerância entre 0 e 20%.', 'toleranciaPerc');
  if (d.prazoEmbarqueInicio && d.prazoEmbarqueFim && d.prazoEmbarqueFim < d.prazoEmbarqueInicio) throw new ErroValidacao('O fim do prazo vem antes do início.', 'prazoEmbarqueFim');
  if (d.certificadoIds.length && (await tx.certificado.count({ where: { id: { in: d.certificadoIds } } })) !== new Set(d.certificadoIds).size) throw new ErroNaoEncontrado('Certificado não encontrado.');
}

export async function criarContrato(ctx: Contexto, entrada: z.input<typeof contratoSchema>) {
  exigir(ctx, 'comercial.editar');
  const d = contratoSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    await validarContrato(tx, d);
    const ano = Number(dataLocal(new Date()).slice(0, 4));
    const numero = await proximoNumero(tx, ctx.empresaId, `contrato:${ano}`);
    const { certificadoIds, ...campos } = d;
    const c = await tx.contrato.create({ data: { ...campos, empresaId: ctx.empresaId, numero, ano, codigo: codigoContrato(ano, numero), criadoPor: ctx.usuarioId } });
    if (certificadoIds.length) await tx.contratoCertificado.createMany({ data: [...new Set(certificadoIds)].map((certificadoId) => ({ empresaId: ctx.empresaId, contratoId: c.id, certificadoId })) });
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: c.id, acao: 'CRIAR', depois: { ...d, codigo: c.codigo } });
    return c;
  });
}

/** Só o rascunho muda tudo; assinado, só prazos, logística e observação. */
export async function alterarContrato(ctx: Contexto, id: string, entrada: z.input<typeof contratoSchema>) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  const d = contratoSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const atual = await tx.contrato.findFirst({ where: { id }, include: { certificados: true } });
    if (!atual) throw new ErroNaoEncontrado('Contrato não encontrado.');
    if (atual.status === 'CANCELADO' || atual.status === 'CONCLUIDO') throw new ErroValidacao('Contrato encerrado não se altera.');
    await validarContrato(tx, d);
    const { certificadoIds, ...campos } = d;
    const dados = atual.status === 'RASCUNHO'
      ? campos
      : { prazoEmbarqueInicio: campos.prazoEmbarqueInicio, prazoEmbarqueFim: campos.prazoEmbarqueFim, incoterm: campos.incoterm, destinoPais: campos.destinoPais, observacao: campos.observacao, referenciaBolsa: campos.referenciaBolsa };
    const c = await tx.contrato.update({ where: { id }, data: { ...dados, alteradoPor: ctx.usuarioId } });
    if (atual.status === 'RASCUNHO') {
      await tx.contratoCertificado.deleteMany({ where: { contratoId: id } });
      if (certificadoIds.length) await tx.contratoCertificado.createMany({ data: [...new Set(certificadoIds)].map((certificadoId) => ({ empresaId: ctx.empresaId, contratoId: id, certificadoId })) });
    }
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: id, acao: 'ALTERAR', antes: atual, depois: d });
    return c;
  });
}

export async function assinarContrato(ctx: Contexto, id: string) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({ where: { id } });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    if (c.status !== 'RASCUNHO') throw new ErroValidacao('Só o rascunho é assinado.');
    const r = await tx.contrato.update({ where: { id }, data: { status: 'ASSINADO', assinadoEm: new Date(), alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: id, acao: 'ASSINAR' });
    return r;
  });
}

export async function cancelarContrato(ctx: Contexto, id: string, motivo: string) {
  exigir(ctx, 'comercial.editar');
  const m = exigirMotivo(motivo);
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({ where: { id } });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    if (c.status === 'CANCELADO' || c.status === 'CONCLUIDO') throw new ErroValidacao('O contrato já está encerrado.');
    if (await tx.reserva.count({ where: { contratoId: id, status: 'ATIVA' } })) throw new ErroRegra('RN-07', 'Cancele as reservas do contrato antes.');
    if (await tx.movimento.count({ where: { contratoId: id, status: { in: ['ABERTO', 'FINALIZADO'] } } })) throw new ErroValidacao('O contrato tem embarque: estorne ou conclua antes.');
    const r = await tx.contrato.update({ where: { id }, data: { status: 'CANCELADO', motivoCancelamento: m, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: id, acao: 'CANCELAR', depois: { motivo: m } });
    return r;
  });
}

/** Saldos do contrato: sempre calculados, nunca editados (regra 5). */
export async function saldosDoContrato(tx: Tx, c: { id: string; quantidadeSacas: { toString(): string }; toleranciaPerc: { toString(): string } }) {
  const quantidadeKg = kgDoContrato(c.quantidadeSacas.toString());
  const reservas = await tx.reserva.aggregate({ _sum: { quantidade: true }, where: { status: 'ATIVA', OR: [{ contratoId: c.id }, { finalidade: 'EMBARQUE', movimento: { contratoId: c.id } }] } });
  const embarcado = await tx.movimento.aggregate({ _sum: { qtdEntrada: true }, where: { contratoId: c.id, status: 'FINALIZADO' } });
  const emCarregamento = await tx.movimento.aggregate({ _sum: { qtdEntrada: true }, where: { contratoId: c.id, status: 'ABERTO' } });
  const kgReservado = qtd(dec(reservas._sum.quantidade).plus(dec(emCarregamento._sum.qtdEntrada)));
  const kgEmbarcado = qtd(dec(embarcado._sum.qtdEntrada));
  const saldoKg = qtd(quantidadeKg.minus(kgEmbarcado));
  return { quantidadeKg, kgReservado, kgEmbarcado, saldoKg, aReservar: Decimal.max(0, qtd(saldoKg.minus(kgReservado))), toleranciaPerc: c.toleranciaPerc.toString() };
}

/** EM_EXECUCAO na primeira reserva ou embarque; CONCLUIDO quando o embarcado cumpre o contrato (§9.1). */
export async function atualizarStatusContrato(tx: Tx, ctx: Contexto, contratoId: string) {
  const c = await tx.contrato.findFirstOrThrow({ where: { id: contratoId } });
  if (c.status === 'RASCUNHO' || c.status === 'CANCELADO') return c;
  const s = await saldosDoContrato(tx, c);
  const cumprido = contratoCumprido({ quantidadeKg: s.quantidadeKg, toleranciaPerc: s.toleranciaPerc, kgEmbarcado: s.kgEmbarcado });
  const temUso = s.kgReservado.gt(0) || s.kgEmbarcado.gt(0);
  const novo = cumprido ? 'CONCLUIDO' : temUso || c.status === 'CONCLUIDO' ? 'EM_EXECUCAO' : c.status;
  if (novo === c.status) return c;
  const r = await tx.contrato.update({ where: { id: c.id }, data: { status: novo, concluidoEm: novo === 'CONCLUIDO' ? new Date() : null, alteradoPor: ctx.usuarioId } });
  await auditar(tx, ctx, { entidade: 'contrato', entidadeId: c.id, acao: 'STATUS', antes: { status: c.status }, depois: { status: novo, kgEmbarcado: s.kgEmbarcado.toFixed(3) } });
  return r;
}

const reservaContratoSchema = z.array(z.object({ loteId: z.string().uuid(), quantidade: quantidadeSchema, localId: z.string().uuid().optional().nullable() })).min(1);

/**
 * Reserva kg de lotes para o contrato (§9.3): certificados exigidos (RN-17), peneira mínima; os kg ficam
 * só para o embarque do contrato (RN-07). Não passa do saldo do contrato + tolerância. Devolve avisos de amostra.
 */
export async function reservarParaContrato(ctx: Contexto, contratoId: string, itens: z.input<typeof reservaContratoSchema>) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(contratoId)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  const lista = reservaContratoSchema.parse(itens);
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({ where: { id: contratoId } });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    exigirContratoAtivo(c);
    await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${c.id}::uuid FOR UPDATE`;
    const s = await saldosDoContrato(tx, c);
    const pedido = lista.reduce((t, i) => t.plus(i.quantidade), new Decimal(0));
    const limite = s.aReservar.plus(s.quantidadeKg.times(c.toleranciaPerc.toString()));
    if (pedido.gt(limite)) throw new ErroRegra('RN-07', `O contrato ${c.codigo} tem ${s.aReservar.toFixed(3)} kg a reservar (mais a tolerância); pedido ${pedido.toFixed(3)} kg.`);
    await travarLotes(tx, lista.map((i) => i.loteId));
    const avisos: string[] = [];
    const reservas = [];
    for (const i of lista) {
      const { lote } = await validarLoteParaContrato(tx, c.id, i.loteId);
      if (lote.status === 'ESTORNADO') throw new ErroRegra('RN-05', `O lote ${lote.codigo} foi estornado.`);
      const atual = await tx.lote.findFirstOrThrow({ where: { id: lote.id } });
      const livre = saldoLivre({ quantidade: dec(atual.quantidade), quantidadeUtilizada: dec(atual.quantidadeUtilizada), quantidadeReservada: dec(atual.quantidadeReservada) });
      const q = new Decimal(i.quantidade);
      if (q.gt(livre)) throw new ErroRegra('RN-07', `O lote ${lote.codigo} tem ${livre.toFixed(3)} kg livre; pedido ${q.toFixed(3)}.`);
      const r = await tx.reserva.create({ data: { empresaId: ctx.empresaId, loteId: lote.id, localId: i.localId ?? null, quantidade: q.toFixed(3), finalidade: 'CONTRATO', contratoId: c.id, criadoPor: ctx.usuarioId } });
      await gravarLote(tx, ctx, atual, { reservada: dec(atual.quantidadeReservada).plus(q) });
      reservas.push(r);
      // A aprovação da amostra é informativa (§9.2): não bloqueia, mas aparece aqui.
      const amostra = await tx.amostra.findFirst({ where: { loteId: lote.id, clienteId: c.clienteId }, orderBy: { dataEnvio: 'desc' } });
      if (!amostra) avisos.push(`Sem amostra do lote ${lote.codigo} para este cliente.`);
      else if (amostra.status !== 'APROVADA') avisos.push(`Amostra do lote ${lote.codigo}: ${amostra.status.toLowerCase().replace('_', ' ')}.`);
    }
    await atualizarStatusContrato(tx, ctx, c.id);
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: c.id, acao: 'RESERVAR', depois: lista });
    return { reservas, avisos };
  });
}

// ================================================================ fixações (A_FIXAR)

const fixacaoSchema = z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sacas: quantidadeSchema, precoPorSaca: z.union([z.string(), z.number()]).transform(normalizarDecimal), observacao: texto(300) });

export async function registrarFixacao(ctx: Contexto, contratoId: string, entrada: z.input<typeof fixacaoSchema>) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(contratoId)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  const d = fixacaoSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({ where: { id: contratoId }, include: { fixacoes: { where: { cancelada: false } } } });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    if (c.tipoPreco !== 'A_FIXAR') throw new ErroValidacao('Fixação só em contrato a fixar.');
    if (c.status === 'CANCELADO') throw new ErroValidacao('Contrato cancelado.');
    const preco = new Decimal(d.precoPorSaca);
    if (preco.lte(0)) throw new ErroValidacao('Preço por saca deve ser maior que zero.', 'precoPorSaca');
    const r = resumoFixacoes([...c.fixacoes.map((f) => ({ sacas: f.sacas.toString(), precoPorSaca: f.precoPorSaca.toString() })), { sacas: d.sacas, precoPorSaca: preco }], c.quantidadeSacas.toString());
    if (r.aFixar.lt(0)) throw new ErroValidacao(`As fixações passam da quantidade do contrato (${c.quantidadeSacas.toString()} sacas).`, 'sacas');
    const f = await tx.fixacaoPreco.create({ data: { empresaId: ctx.empresaId, contratoId, data: new Date(`${d.data}T00:00:00Z`), sacas: d.sacas, precoPorSaca: preco.toFixed(2), observacao: d.observacao, criadoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: contratoId, acao: 'FIXAR', depois: d });
    return f;
  });
}

export async function cancelarFixacao(ctx: Contexto, fixacaoId: string) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(fixacaoId)) throw new ErroNaoEncontrado('Fixação não encontrada.');
  return comTransacao(ctx, async (tx) => {
    const f = await tx.fixacaoPreco.findFirst({ where: { id: fixacaoId } });
    if (!f) throw new ErroNaoEncontrado('Fixação não encontrada.');
    await tx.fixacaoPreco.update({ where: { id: f.id }, data: { cancelada: true } });
    await auditar(tx, ctx, { entidade: 'contrato', entidadeId: f.contratoId, acao: 'CANCELAR_FIXACAO', antes: { sacas: f.sacas, preco: f.precoPorSaca } });
  });
}

// ================================================================ amostras (§9.2)

const amostraSchema = z.object({
  contratoId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  clienteId: z.string().uuid(),
  loteId: z.string().uuid(),
  pesoG: z.coerce.number().int().min(1).max(100_000),
  dataEnvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transportadora: texto(80),
  rastreio: texto(80),
});

export async function registrarAmostra(ctx: Contexto, entrada: z.input<typeof amostraSchema>) {
  exigir(ctx, 'comercial.editar');
  const d = amostraSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    if (!(await tx.lote.findFirst({ where: { id: d.loteId } }))) throw new ErroNaoEncontrado('Lote não encontrado.');
    if (!(await tx.parceiro.findFirst({ where: { id: d.clienteId } }))) throw new ErroNaoEncontrado('Cliente não encontrado.');
    if (d.contratoId && !(await tx.contrato.findFirst({ where: { id: d.contratoId } }))) throw new ErroNaoEncontrado('Contrato não encontrado.');
    const a = await tx.amostra.create({ data: { ...d, dataEnvio: new Date(`${d.dataEnvio}T00:00:00Z`), empresaId: ctx.empresaId, criadoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'amostra', entidadeId: a.id, acao: 'CRIAR', depois: d });
    return a;
  });
}

export async function retornoAmostra(ctx: Contexto, id: string, entrada: { status: 'APROVADA' | 'REPROVADA' | 'SEM_RETORNO'; dataRetorno?: string | null; comentario?: string | null }) {
  exigir(ctx, 'comercial.editar');
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Amostra não encontrada.');
  const d = z.object({ status: z.enum(['APROVADA', 'REPROVADA', 'SEM_RETORNO']), dataRetorno: dataOpc, comentario: texto(500) }).parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const a = await tx.amostra.findFirst({ where: { id } });
    if (!a) throw new ErroNaoEncontrado('Amostra não encontrada.');
    const r = await tx.amostra.update({ where: { id }, data: { status: d.status, dataRetorno: d.dataRetorno ?? new Date(`${dataLocal(new Date())}T00:00:00Z`), comentarioCliente: d.comentario, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'amostra', entidadeId: id, acao: 'RETORNO', antes: { status: a.status }, depois: d });
    return r;
  });
}

// ================================================================ consultas e painel (§9.6)

export async function listarContratos(ctx: Contexto, f: { status?: string } = {}) {
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.contrato.findMany({
      where: f.status ? { status: f.status as never } : {},
      include: { cliente: { select: { nome: true } }, certificados: { include: { certificado: { select: { codigo: true } } } } },
      orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      take: 300,
    });
    const r = [];
    for (const c of lista) {
      const s = await saldosDoContrato(tx, c);
      r.push({
        id: c.id, codigo: c.codigo, cliente: c.cliente.nome, status: c.status, sacas: c.quantidadeSacas.toString(), tipoPreco: c.tipoPreco, moeda: c.moeda, precoPorSaca: c.precoPorSaca?.toString() ?? null,
        prazoFim: iso(c.prazoEmbarqueFim), exigeEudr: c.exigeEudr, certificados: c.certificados.map((x) => x.certificado.codigo),
        kg: s.quantidadeKg.toFixed(3), reservado: s.kgReservado.toFixed(3), embarcado: s.kgEmbarcado.toFixed(3), saldo: s.saldoKg.toFixed(3),
      });
    }
    return r;
  });
}

export async function obterContrato(ctx: Contexto, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Contrato não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, cpfCnpj: true } }, safra: { select: { codigo: true } }, peneiraMin: { select: { id: true, codigo: true } },
        certificados: { include: { certificado: { select: { id: true, codigo: true } } } },
        fixacoes: { where: { cancelada: false }, orderBy: { data: 'asc' } },
        amostras: { include: { lote: { select: { codigo: true } } }, orderBy: { dataEnvio: 'desc' } },
        reservas: { where: { status: { in: ['ATIVA', 'CONSUMIDA'] } }, include: { lote: { select: { id: true, codigo: true, peneira: { select: { codigo: true } } } } }, orderBy: { criadoEm: 'asc' } },
        embarques: { include: { movimento: { select: { id: true, numero: true, status: true, qtdEntrada: true, etapa: { select: { prefixoLote: true } } } } } },
      },
    });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    const s = await saldosDoContrato(tx, c);
    const fix = resumoFixacoes(c.fixacoes.map((f) => ({ sacas: f.sacas.toString(), precoPorSaca: f.precoPorSaca.toString() })), c.quantidadeSacas.toString());
    return {
      id: c.id, codigo: c.codigo, status: c.status, cliente: c.cliente, safra: c.safra?.codigo ?? null, safraId: c.safraId, quantidadeSacas: c.quantidadeSacas.toString(), toleranciaPerc: c.toleranciaPerc.toString(),
      descricaoPadrao: c.descricaoPadrao, peneiraMin: c.peneiraMin, moeda: c.moeda, tipoPreco: c.tipoPreco, precoPorSaca: c.precoPorSaca?.toString() ?? null, diferencial: c.diferencial?.toString() ?? null,
      referenciaBolsa: c.referenciaBolsa, prazoEmbarqueInicio: iso(c.prazoEmbarqueInicio), prazoEmbarqueFim: iso(c.prazoEmbarqueFim), incoterm: c.incoterm, destinoPais: c.destinoPais, exigeEudr: c.exigeEudr,
      observacao: c.observacao, assinadoEm: c.assinadoEm, concluidoEm: c.concluidoEm, motivoCancelamento: c.motivoCancelamento,
      certificados: c.certificados.map((x) => x.certificado),
      saldos: { kg: s.quantidadeKg.toFixed(3), reservado: s.kgReservado.toFixed(3), embarcado: s.kgEmbarcado.toFixed(3), saldo: s.saldoKg.toFixed(3), aReservar: s.aReservar.toFixed(3) },
      fixacoes: c.fixacoes.map((f) => ({ id: f.id, data: iso(f.data), sacas: f.sacas.toString(), precoPorSaca: f.precoPorSaca.toString(), observacao: f.observacao })),
      resumoFixacoes: { fixadas: fix.fixadas.toString(), precoMedio: fix.precoMedio?.toString() ?? null, aFixar: fix.aFixar.toString() },
      amostras: c.amostras.map((a) => ({ id: a.id, lote: a.lote.codigo, loteId: a.loteId, pesoG: a.pesoG, dataEnvio: iso(a.dataEnvio), status: a.status, dataRetorno: iso(a.dataRetorno), comentario: a.comentarioCliente, rastreio: a.rastreio })),
      reservas: c.reservas.map((r) => ({ id: r.id, loteId: r.loteId, lote: r.lote.codigo, peneira: r.lote.peneira?.codigo ?? null, quantidade: r.quantidade.toString(), status: r.status, criadoEm: r.criadoEm })),
      embarques: c.embarques.map((e) => ({ id: e.movimentoId, rotulo: `${e.movimento.etapa.prefixoLote}#${e.movimento.numero}`, status: e.movimento.status, kg: e.movimento.qtdEntrada.toString(), carregado: !!e.carregadoEm })),
    };
  });
}

/** Painel comercial (§9.6) e alerta CONTRATO_PRAZO quando faltam N dias e há saldo. */
export async function painelComercial(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const empresa = await tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { configuracoes: true } });
    const diasAlerta = Number((empresa?.configuracoes as Record<string, unknown> | null)?.contrato_alerta_dias ?? 15);
    const hoje = dataLocal(new Date());
    const contratos = await tx.contrato.findMany({ include: { cliente: { select: { nome: true } } } });
    const porStatus: Record<string, number> = { RASCUNHO: 0, ASSINADO: 0, EM_EXECUCAO: 0, CONCLUIDO: 0, CANCELADO: 0 };
    const aEmbarcar = [];
    for (const c of contratos) {
      porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;
      if (c.status !== 'ASSINADO' && c.status !== 'EM_EXECUCAO') continue;
      const s = await saldosDoContrato(tx, c);
      const fim = iso(c.prazoEmbarqueFim);
      const dias = fim ? diasAte(fim, hoje) : null;
      if (s.saldoKg.gt(0)) {
        aEmbarcar.push({ id: c.id, codigo: c.codigo, cliente: c.cliente.nome, prazoFim: fim, dias, saldo: s.saldoKg.toFixed(3), reservado: s.kgReservado.toFixed(3) });
        if (dias !== null && dias <= diasAlerta)
          await emitirAlerta(tx, ctx.empresaId, {
            tipo: 'CONTRATO_PRAZO', chave: `CONTRATO_PRAZO:${c.id}`, entidade: 'contrato', entidadeId: c.id, severidade: dias < 0 ? 'CRITICO' : 'AVISO',
            mensagem: `Contrato ${c.codigo} (${c.cliente.nome}): ${dias < 0 ? `prazo vencido há ${-dias} dia(s)` : `faltam ${dias} dia(s) para o fim do prazo`} e há ${s.saldoKg.toFixed(0)} kg a embarcar.`,
          });
      }
    }
    aEmbarcar.sort((a, b) => (a.prazoFim ?? '9999').localeCompare(b.prazoFim ?? '9999'));
    // Estoque livre × reservado por certificado e peneira.
    const lotes = await tx.lote.findMany({
      where: { status: { in: ['ABERTO', 'PARCIAL'] }, etapa: { classe: 'ESTOQUE' } },
      include: { peneira: { select: { codigo: true, ordem: true } }, certificados: { where: { removidoEm: null }, include: { certificado: { select: { codigo: true } } } } },
    });
    const grupos = new Map<string, { certificados: string; peneira: string; ordem: number; livre: Decimal; reservado: Decimal }>();
    for (const l of lotes) {
      const certificados = l.certificados.map((c) => c.certificado.codigo).sort().join(' + ') || 'Convencional';
      const peneira = l.peneira?.codigo ?? '—';
      const k = `${certificados}|${peneira}`;
      const g = grupos.get(k) ?? { certificados, peneira, ordem: l.peneira?.ordem ?? 999, livre: new Decimal(0), reservado: new Decimal(0) };
      g.livre = g.livre.plus(saldoLivre({ quantidade: dec(l.quantidade), quantidadeUtilizada: dec(l.quantidadeUtilizada), quantidadeReservada: dec(l.quantidadeReservada) }));
      g.reservado = g.reservado.plus(dec(l.quantidadeReservada));
      grupos.set(k, g);
    }
    const estoque = [...grupos.values()].sort((a, b) => a.certificados.localeCompare(b.certificados) || a.ordem - b.ordem).map((g) => ({ certificados: g.certificados, peneira: g.peneira, livre: g.livre.toFixed(3), reservado: g.reservado.toFixed(3) }));
    return { porStatus, aEmbarcar, estoque, diasAlerta };
  });
}
