import Decimal from 'decimal.js';
import { janela } from './paginacao';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { diferencaPesagem, limiteDoEmbarque } from '@/dominio/comercial';
import { normalizarPlaca, placaValida, soDigitos } from '@/dominio/documentos';
import { saldoLivre } from '@/dominio/lote';
import { esquemasDe, exigirMotivoRebaixamento, exigirVenda, rebaixamentos, rotuloEsquemas } from '@/dominio/certificacao';
import { congelarNaFinalizacao } from './dossie';
import { kgParaSacas, qtd } from '@/dominio/quantidade';
import { auditar } from './auditoria';
import { atualizarStatusContrato, saldosDoContrato } from './contratos';
import { aplicarEntradas, reabrirSaida } from './movimentos';
import { exigirContratoAtivo, validarLoteParaContrato } from './regras-contrato';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import { dataLocal, dec, exigirMotivo, gravarLote, proximoNumero, quantidadeSchema, travarLotes, travarMovimento } from './rastreio-base';

/**
 * Embarque = movimento da classe SAIDA ligado a um contrato (§9.4), em etapas:
 * programar (reservas EMBARQUE, RN-26) → carregar (pesagem, motorista, lacres, RN-27; as reservas viram entradas)
 * → finalizar (imutável, RN-14). Voltar para a programação libera as reservas.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dia = (d: string) => new Date(`${d}T00:00:00Z`);

async function detalhe(tx: Tx, movimentoId: string) {
  const mov = await travarMovimento(tx, movimentoId);
  const det = await tx.embarqueDetalhe.findFirst({ where: { movimentoId } });
  if (!det || mov.etapa.classe !== 'SAIDA') throw new ErroNaoEncontrado('Embarque não encontrado.');
  const contrato = await tx.contrato.findFirstOrThrow({ where: { id: det.contratoId } });
  return { mov, det, contrato };
}

/** POST /api/embarques {contratoId} (§14): cria o embarque a partir do contrato. */
export async function criarEmbarque(ctx: Contexto, entrada: { contratoId: string; etapaId?: string | null; dataVenda?: string | null }) {
  exigir(ctx, 'embarque.programar');
  const d = z.object({ contratoId: z.string().uuid(), etapaId: z.string().uuid().optional().nullable(), dataVenda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable() }).parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const c = await tx.contrato.findFirst({ where: { id: d.contratoId } });
    if (!c) throw new ErroNaoEncontrado('Contrato não encontrado.');
    exigirContratoAtivo(c);
    const etapas = await tx.etapa.findMany({ where: { classe: 'SAIDA', ativa: true, ...(d.etapaId ? { id: d.etapaId } : {}) } });
    if (!etapas.length) throw new ErroNaoEncontrado('Etapa de saída não encontrada.');
    if (etapas.length > 1) throw new ErroValidacao('Há mais de uma etapa de saída: informe qual.', 'etapaId');
    const etapa = etapas[0]!;
    const safra = c.safraId ?? (await tx.safra.findFirst({ where: { ativa: true }, orderBy: { dataInicio: 'desc' } }))?.id;
    if (!safra) throw new ErroValidacao('Cadastre uma safra antes do embarque.');
    const numero = await proximoNumero(tx, ctx.empresaId, `movimento:${etapa.id}`);
    const mov = await tx.movimento.create({ data: { empresaId: ctx.empresaId, etapaId: etapa.id, numero, safraId: safra, contratoId: c.id, unidade: 'KG', criadoPor: ctx.usuarioId } });
    await tx.embarqueDetalhe.create({ data: { movimentoId: mov.id, empresaId: ctx.empresaId, contratoId: c.id, clienteId: c.clienteId, dataVenda: d.dataVenda ? dia(d.dataVenda) : null } });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'CRIAR', depois: { embarque: `${etapa.prefixoLote}#${numero}`, contrato: c.codigo } });
    return { id: mov.id, rotulo: `${etapa.prefixoLote}#${numero}` };
  });
}

const programacaoSchema = z.array(z.object({ loteId: z.string().uuid(), quantidade: quantidadeSchema, localId: z.string().uuid().optional().nullable() })).optional();

/**
 * Programação (RN-26): os kg ficam reservados para este embarque (finalidade EMBARQUE).
 * Sem lista, puxa todas as reservas ativas do contrato. Lotes livres passam pelas mesmas validações (RN-17).
 */
export async function programarEmbarque(ctx: Contexto, movimentoId: string, lotes?: z.input<typeof programacaoSchema>) {
  exigir(ctx, 'embarque.programar');
  const lista = programacaoSchema.parse(lotes);
  return comTransacao(ctx, async (tx) => {
    const { mov, det, contrato } = await detalhe(tx, movimentoId);
    if (mov.status !== 'ABERTO' || det.carregadoEm) throw new ErroValidacao('O embarque já foi carregado: volte a programação antes de mudar.');
    exigirContratoAtivo(contrato);
    const doContrato = await tx.reserva.findMany({ where: { contratoId: contrato.id, status: 'ATIVA', finalidade: 'CONTRATO' }, orderBy: { criadoEm: 'asc' } });
    const itens = lista ?? doContrato.map((r) => ({ loteId: r.loteId, quantidade: dec(r.quantidade).toFixed(3), localId: r.localId }));
    if (!itens.length) throw new ErroValidacao('O contrato não tem reservas: escolha os lotes do embarque.');
    const programado = await tx.reserva.aggregate({ _sum: { quantidade: true }, where: { movimentoId: mov.id, status: 'ATIVA', finalidade: 'EMBARQUE' } });
    const s = await saldosDoContrato(tx, contrato);
    const limite = limiteDoEmbarque({ quantidadeKg: s.quantidadeKg, toleranciaPerc: contrato.toleranciaPerc.toString(), kgEmbarcado: s.kgEmbarcado });
    const total = itens.reduce((t, i) => t.plus(i.quantidade), dec(programado._sum.quantidade));
    if (total.gt(limite)) throw new ErroRegra('RN-07', `O embarque passaria do saldo do contrato ${contrato.codigo} (${limite.toFixed(3)} kg com a tolerância).`);
    await travarLotes(tx, itens.map((i) => i.loteId));
    for (const i of itens) {
      const { lote } = await validarLoteParaContrato(tx, contrato.id, i.loteId);
      let q = new Decimal(i.quantidade);
      const atual = await tx.lote.findFirstOrThrow({ where: { id: lote.id } });
      let reservada = dec(atual.quantidadeReservada);
      // Primeiro usa a reserva do contrato neste lote; ela passa a ser do embarque.
      for (const r of doContrato.filter((x) => x.loteId === lote.id)) {
        if (q.lte(0)) break;
        const usado = Decimal.min(q, dec(r.quantidade));
        const resta = qtd(dec(r.quantidade).minus(usado));
        await tx.reserva.update({
          where: { id: r.id },
          data: resta.gt(0) ? { quantidade: resta.toFixed(3), alteradoPor: ctx.usuarioId } : { status: 'CONSUMIDA', consumidaEm: new Date(), observacao: `Programada no embarque ${mov.etapa.prefixoLote}#${mov.numero}`, alteradoPor: ctx.usuarioId },
        });
        reservada = reservada.minus(usado);
        q = q.minus(usado);
        await tx.reserva.create({ data: { empresaId: ctx.empresaId, loteId: lote.id, localId: r.localId ?? i.localId ?? null, quantidade: usado.toFixed(3), finalidade: 'EMBARQUE', movimentoId: mov.id, criadoPor: ctx.usuarioId } });
        reservada = reservada.plus(usado);
      }
      if (q.gt(0)) {
        const livre = saldoLivre({ quantidade: dec(atual.quantidade), quantidadeUtilizada: dec(atual.quantidadeUtilizada), quantidadeReservada: reservada });
        if (q.gt(livre)) throw new ErroRegra('RN-07', `O lote ${lote.codigo} tem ${livre.toFixed(3)} kg livre; faltam ${q.toFixed(3)} kg para a programação.`);
        await tx.reserva.create({ data: { empresaId: ctx.empresaId, loteId: lote.id, localId: i.localId ?? null, quantidade: q.toFixed(3), finalidade: 'EMBARQUE', movimentoId: mov.id, criadoPor: ctx.usuarioId } });
        reservada = reservada.plus(q);
      }
      await gravarLote(tx, ctx, atual, { reservada });
    }
    await tx.embarqueDetalhe.update({ where: { movimentoId }, data: { programadoEm: new Date(), programadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId } });
    await atualizarStatusContrato(tx, ctx, contrato.id);
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'PROGRAMAR', depois: itens });
  });
}

/** Volta para antes da programação: as reservas do embarque são canceladas e os kg ficam livres (RN-26). */
export async function desfazerProgramacao(ctx: Contexto, movimentoId: string, motivo: string) {
  exigir(ctx, 'embarque.programar');
  const m = exigirMotivo(motivo);
  return comTransacao(ctx, async (tx) => {
    const { mov, det } = await detalhe(tx, movimentoId);
    if (det.carregadoEm || mov.status !== 'ABERTO') throw new ErroValidacao('O embarque já foi carregado.');
    const reservas = await tx.reserva.findMany({ where: { movimentoId, status: 'ATIVA' } });
    await travarLotes(tx, reservas.map((r) => r.loteId));
    for (const r of reservas) {
      const l = await tx.lote.findFirstOrThrow({ where: { id: r.loteId } });
      await gravarLote(tx, ctx, l, { reservada: dec(l.quantidadeReservada).minus(dec(r.quantidade)) });
      await tx.reserva.update({ where: { id: r.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: m, alteradoPor: ctx.usuarioId } });
    }
    await tx.embarqueDetalhe.update({ where: { movimentoId }, data: { programadoEm: null, programadoPor: null, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: movimentoId, acao: 'DESPROGRAMAR', depois: { motivo: m, reservas: reservas.length } });
  });
}

const carregamentoSchema = z.object({
  motoristaId: z.string().uuid().optional().nullable(),
  placa: z.string().trim().min(1, 'Informe a placa.'),
  transportadorId: z.string().uuid().optional().nullable(),
  lacres: z.array(z.string().trim().min(1)).default([]),
  pesoBruto: quantidadeSchema,
  tara: quantidadeSchema,
  motivoDiferenca: z.string().trim().max(300).optional().nullable(),
  dataEmbarque: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  /** "Vender como" (RN-28): ids dos certificados vendidos; vazio = convencional; ausente = o que todos os lotes têm. */
  certificadosVendidos: z.array(z.string().uuid()).optional(),
  motivoRebaixamento: z.string().trim().max(300).optional().nullable(),
});

/**
 * Carregamento (RN-27): pesagem do caminhão, motorista, placa e lacres. Se a diferença entre o líquido e os lotes
 * passar do limite da empresa (padrão 0,5%), exige motivo. As reservas do embarque viram entradas (saem do estoque).
 */
export async function registrarCarregamento(ctx: Contexto, movimentoId: string, entrada: z.input<typeof carregamentoSchema>) {
  exigir(ctx, 'embarque.carregar');
  const d = carregamentoSchema.parse(entrada);
  if (!placaValida(d.placa)) throw new ErroValidacao('Placa inválida (ex.: ABC1D23).', 'placa');
  return comTransacao(ctx, async (tx) => {
    const { mov, det } = await detalhe(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('O embarque não está aberto.');
    if (det.carregadoEm) throw new ErroValidacao('O carregamento já foi registrado.');
    const reservas = await tx.reserva.findMany({ where: { movimentoId, status: 'ATIVA', finalidade: 'EMBARQUE' } });
    if (!reservas.length) throw new ErroValidacao('Programe o embarque antes do carregamento.');
    if (d.motoristaId && !(await tx.motorista.findFirst({ where: { id: d.motoristaId } }))) throw new ErroNaoEncontrado('Motorista não encontrado.');
    const soma = reservas.reduce((s, r) => s.plus(dec(r.quantidade)), new Decimal(0));
    const empresa = await tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { configuracoes: true } });
    const limite = String((empresa?.configuracoes as Record<string, unknown> | null)?.limite_diferenca_pesagem ?? '0.005');
    const p = diferencaPesagem({ bruto: d.pesoBruto, tara: d.tara, somaLotes: soma, limitePerc: limite });
    if (p.exigeMotivo && !(d.motivoDiferenca && d.motivoDiferenca.length >= 5))
      throw new ErroRegra('RN-27', `A balança deu ${p.liquido.toFixed(3)} kg líquidos para ${soma.toFixed(3)} kg de lotes (${p.perc.times(100).toFixed(2)}%, acima de ${new Decimal(limite).times(100).toFixed(1)}%). Informe o motivo da diferença.`);
    // Vender como (RN-28): só esquemas que todos os lotes têm; o contrato exige os seus (RN-17); perder esquema = rebaixamento.
    const certsLote = await tx.loteCertificado.findMany({ where: { loteId: { in: reservas.map((r) => r.loteId) }, removidoEm: null }, include: { certificado: { select: { codigo: true } }, lote: { select: { codigo: true } } } });
    const idsPorLote = new Map(reservas.map((r) => [r.loteId, certsLote.filter((c) => c.loteId === r.loteId).map((c) => c.certificadoId)]));
    const comuns = [...idsPorLote.values()].reduce<string[] | null>((a, ids) => (a === null ? ids : a.filter((x) => ids.includes(x))), null) ?? [];
    const vendidosIds = [...new Set(d.certificadosVendidos ?? comuns)];
    const vendidosCert = await tx.certificado.findMany({ where: { id: { in: vendidosIds } } });
    if (vendidosCert.length !== vendidosIds.length) throw new ErroNaoEncontrado('Certificado não encontrado.');
    const vendidos = esquemasDe(vendidosCert.map((c) => c.codigo));
    const exigidos = esquemasDe((await tx.contratoCertificado.findMany({ where: { contratoId: det.contratoId }, include: { certificado: { select: { codigo: true } } } })).map((c) => c.certificado.codigo));
    const codigoLote = new Map(certsLote.map((c) => [c.loteId, c.lote.codigo]));
    const lotesVenda = reservas.map((r) => ({ loteId: r.loteId, codigo: codigoLote.get(r.loteId) ?? r.loteId, kg: dec(r.quantidade), esquemas: esquemasDe(certsLote.filter((c) => c.loteId === r.loteId).map((c) => c.certificado.codigo)) }));
    exigirVenda(lotesVenda, vendidos, exigidos);
    const rebaixados = rebaixamentos(lotesVenda, vendidos);
    const motivoRebaixamento = exigirMotivoRebaixamento(rebaixados, d.motivoRebaixamento);
    // As reservas do embarque viram entradas: o café sai do estoque (e do local, RN-25).
    await aplicarEntradas(tx, ctx, mov, mov.etapa, reservas.map((r) => ({ loteId: r.loteId, quantidade: dec(r.quantidade).toFixed(3), reservaId: r.id, localId: r.localId })));
    await tx.embarqueDetalhe.update({
      where: { movimentoId },
      data: {
        motoristaId: d.motoristaId ?? null, placa: normalizarPlaca(d.placa), transportadorId: d.transportadorId ?? null, lacres: d.lacres, pesoBruto: d.pesoBruto, tara: d.tara,
        pesoLiquido: p.liquido.toFixed(3), diferencaKg: p.diferenca.toFixed(3), diferencaPerc: p.perc.toFixed(6), motivoDiferenca: p.exigeMotivo ? d.motivoDiferenca : d.motivoDiferenca || null,
        dataEmbarque: d.dataEmbarque ? dia(d.dataEmbarque) : dia(dataLocal(new Date())), carregadoEm: new Date(), carregadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId,
        certificadosVendidos: vendidosIds, vendaDefinida: true,
      },
    });
    if (motivoRebaixamento) {
      await tx.rebaixamento.createMany({
        data: rebaixados.map((r) => ({
          empresaId: ctx.empresaId, movimentoId, loteOrigemId: r.loteId, kg: r.kg.toFixed(3), esquemasOrigem: r.origem, esquemasResultado: r.resultado, esquemasPerdidos: r.perdidos,
          motivo: motivoRebaixamento, criadoPor: ctx.usuarioId,
        })),
      });
    }
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: movimentoId, acao: 'CARREGAR', depois: { ...d, liquido: p.liquido.toFixed(3), diferencaPerc: p.perc.toFixed(6), vendidoComo: rotuloEsquemas(vendidos) } });
    return { liquido: p.liquido.toFixed(3), diferenca: p.diferenca.toFixed(3), perc: p.perc.toFixed(6), vendidoComo: rotuloEsquemas(vendidos), rebaixamentos: rebaixados.length };
  });
}

const logisticaSchema = z.object({
  dataVenda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')),
  container: z.string().trim().max(30).optional().nullable(),
  navio: z.string().trim().max(60).optional().nullable(),
  booking: z.string().trim().max(40).optional().nullable(),
  numeroDds: z.string().trim().max(60).optional().nullable(),
});

/** Dados logísticos e DDS. Depois de finalizado, só a DDS pode ser informada (e trava a reabertura, RN-14). */
export async function alterarLogistica(ctx: Contexto, movimentoId: string, entrada: z.input<typeof logisticaSchema>) {
  exigir(ctx, 'embarque.programar');
  const d = logisticaSchema.parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const { mov, det } = await detalhe(tx, movimentoId);
    const dados = mov.status === 'FINALIZADO'
      ? { numeroDds: det.numeroDds ?? (d.numeroDds || null) }
      : { dataVenda: d.dataVenda ? dia(d.dataVenda) : null, container: d.container || null, navio: d.navio || null, booking: d.booking || null, numeroDds: d.numeroDds || null };
    await tx.embarqueDetalhe.update({ where: { movimentoId }, data: { ...dados, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: movimentoId, acao: 'LOGISTICA', antes: det, depois: dados });
  });
}

const notaSchema = z.object({
  numeroNota: z.string().trim().min(1).max(20),
  serie: z.string().trim().max(5).optional().nullable(),
  chaveNfe: z.string().optional().nullable().transform((v) => (v ? soDigitos(v) : null)),
  dataEmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qtdKg: quantidadeSchema,
});

export async function adicionarNota(ctx: Contexto, movimentoId: string, entrada: z.input<typeof notaSchema>) {
  exigir(ctx, 'embarque.programar');
  const d = notaSchema.parse(entrada);
  if (d.chaveNfe && d.chaveNfe.length !== 44) throw new ErroValidacao('A chave da NF-e tem 44 dígitos.', 'chaveNfe');
  return comTransacao(ctx, async (tx) => {
    const { mov } = await detalhe(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Embarque finalizado não recebe notas (RN-14).');
    if (d.chaveNfe && (await tx.embarqueNota.findFirst({ where: { chaveNfe: d.chaveNfe, cancelada: false } }))) throw new ErroValidacao('Essa chave de NF-e já está lançada.', 'chaveNfe');
    const n = await tx.embarqueNota.create({ data: { empresaId: ctx.empresaId, movimentoId, numeroNota: d.numeroNota, serie: d.serie || null, chaveNfe: d.chaveNfe, dataEmissao: dia(d.dataEmissao), qtdKg: d.qtdKg, qtdSacas: kgParaSacas(d.qtdKg).toFixed(3), criadoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: movimentoId, acao: 'NOTA', depois: d });
    return n;
  });
}

export async function cancelarNota(ctx: Contexto, movimentoId: string, notaId: string) {
  exigir(ctx, 'embarque.programar');
  if (!ehUuid(notaId)) throw new ErroNaoEncontrado('Nota não encontrada.');
  return comTransacao(ctx, async (tx) => {
    const { mov } = await detalhe(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('Embarque finalizado não muda (RN-14).');
    const n = await tx.embarqueNota.findFirst({ where: { id: notaId, movimentoId } });
    if (!n) throw new ErroNaoEncontrado('Nota não encontrada.');
    await tx.embarqueNota.update({ where: { id: notaId }, data: { cancelada: true } });
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: movimentoId, acao: 'CANCELAR_NOTA', antes: { numero: n.numeroNota } });
  });
}

/**
 * Finalizar (§9.4, RN-27): exige carregamento; Σ entradas ≤ saldo do contrato + tolerância.
 * O embarque fica imutável (RN-14) e o contrato pode virar CONCLUIDO. Congela o dossiê (com EUDR, sem pendências:
 * RN-18) e emite o pacote para a exportadora (RN-30).
 */
export async function finalizarEmbarque(ctx: Contexto, movimentoId: string) {
  exigir(ctx, 'movimento.fechar');
  return comTransacao(ctx, async (tx) => {
    const { mov, det, contrato } = await detalhe(tx, movimentoId);
    if (mov.status !== 'ABERTO') throw new ErroValidacao('O embarque não está aberto.');
    if (!det.carregadoEm) throw new ErroRegra('RN-27', 'O embarque só finaliza com o carregamento registrado.');
    const embarcado = await tx.movimento.aggregate({ _sum: { qtdEntrada: true }, where: { contratoId: contrato.id, status: 'FINALIZADO' } });
    const limite = limiteDoEmbarque({ quantidadeKg: dec(contrato.quantidadeSacas).times(60), toleranciaPerc: contrato.toleranciaPerc.toString(), kgEmbarcado: dec(embarcado._sum.qtdEntrada) });
    if (dec(mov.qtdEntrada).gt(limite)) throw new ErroRegra('RN-07', `O embarque (${dec(mov.qtdEntrada).toFixed(3)} kg) passa do saldo do contrato com a tolerância (${limite.toFixed(3)} kg).`);
    const { dossie, pacote } = await congelarNaFinalizacao(tx, ctx, mov.id, contrato.exigeEudr);
    const agora = new Date();
    const r = await tx.movimento.update({
      where: { id: mov.id },
      data: { status: 'FINALIZADO', qtdSaida: mov.qtdEntrada, qtdPerda: '0', percQuebra: '0', dataResultado: agora, finalizadoEm: agora, finalizadoPor: ctx.usuarioId, alteradoPor: ctx.usuarioId },
    });
    const c = await atualizarStatusContrato(tx, ctx, contrato.id);
    await auditar(tx, ctx, { entidade: 'movimento', entidadeId: mov.id, acao: 'FINALIZAR', depois: { kg: mov.qtdEntrada, contrato: contrato.codigo, statusContrato: c.status, dossie: dossie.versao, pacote: pacote.versao } });
    return { movimento: r, statusContrato: c.status, dossie: { versao: dossie.versao, hash: dossie.hashSha256 }, pacote: { versao: pacote.versao, hash: pacote.hashSha256 } };
  });
}

/** Reabrir (RN-14): só ADMIN, com motivo, sem DDS. O contrato volta a EM_EXECUCAO se tinha concluído. */
export async function reabrirEmbarque(ctx: Contexto, movimentoId: string, motivo: string) {
  const r = await reabrirSaida(ctx, movimentoId, motivo);
  await comTransacao(ctx, async (tx) => {
    if (r.contratoId) await atualizarStatusContrato(tx, ctx, r.contratoId);
  });
  return r;
}

// ================================================================ consultas

export async function listarEmbarques(ctx: Contexto, pagina?: number) {
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.embarqueDetalhe.findMany({
      include: { movimento: { select: { id: true, numero: true, status: true, qtdEntrada: true, etapa: { select: { prefixoLote: true } } } }, contrato: { select: { codigo: true, cliente: { select: { nome: true } } } } },
      orderBy: { criadoEm: 'desc' },
      ...(pagina ? janela(pagina) : { skip: 0, take: 300 }),
    });
    const programados = await tx.reserva.groupBy({ by: ['movimentoId'], where: { status: 'ATIVA', finalidade: 'EMBARQUE', movimentoId: { in: lista.map((e) => e.movimentoId) } }, _sum: { quantidade: true } });
    return lista.map((e) => ({
      id: e.movimentoId, rotulo: `${e.movimento.etapa.prefixoLote}#${e.movimento.numero}`, contrato: e.contrato.codigo, cliente: e.contrato.cliente.nome, status: e.movimento.status,
      etapa: e.movimento.status === 'FINALIZADO' ? 'Finalizado' : e.movimento.status === 'ESTORNADO' ? 'Estornado' : e.carregadoEm ? 'Carregado' : e.programadoEm ? 'Programado' : 'Criado',
      kg: e.carregadoEm ? e.movimento.qtdEntrada.toString() : (programados.find((p) => p.movimentoId === e.movimentoId)?._sum.quantidade?.toString() ?? '0'),
      placa: e.placa, dataEmbarque: iso(e.dataEmbarque),
    }));
  });
}

export async function obterEmbarque(ctx: Contexto, movimentoId: string) {
  if (!ehUuid(movimentoId)) throw new ErroNaoEncontrado('Embarque não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const det = await tx.embarqueDetalhe.findFirst({
      where: { movimentoId },
      include: {
        motorista: { select: { id: true, nome: true, placaPadrao: true } },
        contrato: { include: { cliente: { select: { nome: true, cpfCnpj: true } }, certificados: { include: { certificado: { select: { codigo: true } } } } } },
        movimento: {
          include: {
            etapa: { select: { nome: true, prefixoLote: true } },
            entradas: { where: { cancelada: false }, include: { lote: { select: { id: true, codigo: true, peneira: { select: { codigo: true } }, certificados: { where: { removidoEm: null }, include: { certificado: { select: { codigo: true } } } } } } } },
            notas: { where: { cancelada: false }, orderBy: { dataEmissao: 'asc' } },
            reservas: { where: { status: 'ATIVA', finalidade: 'EMBARQUE' }, include: { lote: { select: { id: true, codigo: true, peneira: { select: { codigo: true } }, certificados: { where: { removidoEm: null }, include: { certificado: { select: { id: true, codigo: true } } } } } } } },
          },
        },
      },
    });
    if (!det) throw new ErroNaoEncontrado('Embarque não encontrado.');
    const m = det.movimento;
    const s = await saldosDoContrato(tx, det.contrato);
    const contratoReservas = await tx.reserva.findMany({ where: { contratoId: det.contratoId, status: 'ATIVA', finalidade: 'CONTRATO' }, include: { lote: { select: { codigo: true } } } });
    const nomes = new Map((await tx.usuarioEmpresa.findMany({ where: { usuarioId: { in: [det.programadoPor, det.carregadoPor, m.finalizadoPor, m.criadoPor].filter((x): x is string => !!x) } }, include: { usuario: { select: { id: true, nome: true } } } })).map((v) => [v.usuario.id, v.usuario.nome]));
    const quem = (id: string | null) => (id ? (nomes.get(id) ?? null) : null);
    const programado = m.reservas.reduce((t, r) => t.plus(dec(r.quantidade)), new Decimal(0));
    const vendidos = await tx.certificado.findMany({ where: { id: { in: det.certificadosVendidos } }, select: { id: true, codigo: true } });
    const rebaixados = await tx.rebaixamento.findMany({ where: { movimentoId, cancelado: false } });
    const dossie = await tx.dossie.findFirst({ where: { movimentoId }, orderBy: { versao: 'desc' } });
    const pacotes = await tx.pacoteEmbarque.findMany({ where: { movimentoId }, orderBy: { versao: 'desc' }, select: { versao: true, hashSha256: true, geradoEm: true, motivo: true } });
    const conteudoDossie = dossie?.conteudo as { pendencias?: { mensagem: string }[]; talhoes?: { fazenda: string; talhao: string; kg: number; percentual: number; checagem: { resultado: string } | null }[] } | undefined;
    return {
      id: m.id, rotulo: `${m.etapa.prefixoLote}#${m.numero}`, etapa: m.etapa.nome, status: m.status,
      contrato: { id: det.contratoId, codigo: det.contrato.codigo, cliente: det.contrato.cliente.nome, certificados: det.contrato.certificados.map((c) => c.certificado.codigo), exigeEudr: det.contrato.exigeEudr, status: det.contrato.status, saldo: s.saldoKg.toFixed(3), kg: s.quantidadeKg.toFixed(3), toleranciaPerc: det.contrato.toleranciaPerc.toString() },
      logistica: { dataVenda: iso(det.dataVenda), dataEmbarque: iso(det.dataEmbarque), container: det.container, navio: det.navio, booking: det.booking, numeroDds: det.numeroDds },
      carregamento: det.carregadoEm ? {
        motorista: det.motorista?.nome ?? null, placa: det.placa, lacres: det.lacres, pesoBruto: det.pesoBruto?.toString() ?? null, tara: det.tara?.toString() ?? null, pesoLiquido: det.pesoLiquido?.toString() ?? null,
        diferencaKg: det.diferencaKg?.toString() ?? null, diferencaPerc: det.diferencaPerc?.toString() ?? null, motivoDiferenca: det.motivoDiferenca,
      } : null,
      programacao: m.reservas.map((r) => ({ id: r.id, loteId: r.loteId, lote: r.lote.codigo, peneira: r.lote.peneira?.codigo ?? null, quantidade: r.quantidade.toString(), certificados: r.lote.certificados.map((c) => c.certificado) })),
      programadoKg: programado.toFixed(3),
      reservasDoContrato: contratoReservas.map((r) => ({ id: r.id, loteId: r.loteId, lote: r.lote.codigo, quantidade: r.quantidade.toString() })),
      entradas: m.entradas.map((e) => ({ id: e.id, loteId: e.loteId, lote: e.lote.codigo, peneira: e.lote.peneira?.codigo ?? null, certificados: e.lote.certificados.map((c) => c.certificado.codigo), quantidade: e.quantidade.toString() })),
      kgEntradas: m.qtdEntrada.toString(),
      venda: {
        definida: det.vendaDefinida, certificados: vendidos.map((c) => c.codigo).sort(), rotulo: det.vendaDefinida ? rotuloEsquemas(esquemasDe(vendidos.map((c) => c.codigo))) : null,
        rebaixamentos: rebaixados.map((r) => ({ id: r.id, kg: r.kg.toString(), perdidos: r.esquemasPerdidos, motivo: r.motivo, lote: m.entradas.find((e) => e.loteId === r.loteOrigemId)?.lote.codigo ?? null })),
      },
      dossie: dossie ? {
        versao: dossie.versao, hash: dossie.hashSha256, congelado: dossie.congelado, geradoEm: dossie.geradoEm,
        pendencias: (conteudoDossie?.pendencias ?? []).map((p) => p.mensagem),
        talhoes: (conteudoDossie?.talhoes ?? []).map((t) => ({ fazenda: t.fazenda, talhao: t.talhao, kg: String(t.kg), percentual: String(t.percentual), checagem: t.checagem?.resultado ?? null })),
      } : null,
      pacotes: pacotes.map((p) => ({ versao: p.versao, hash: p.hashSha256, geradoEm: p.geradoEm, motivo: p.motivo })),
      notas: m.notas.map((n) => ({ id: n.id, numero: n.numeroNota, serie: n.serie, chave: n.chaveNfe, dataEmissao: iso(n.dataEmissao), kg: n.qtdKg.toString(), sacas: n.qtdSacas.toString() })),
      linhaDoTempo: [
        { etapa: 'Criado', feita: true, quando: m.criadoEm, quem: quem(m.criadoPor) },
        { etapa: 'Programado', feita: !!det.programadoEm || !!det.carregadoEm, quando: det.programadoEm, quem: quem(det.programadoPor) },
        { etapa: 'Carregado', feita: !!det.carregadoEm, quando: det.carregadoEm, quem: quem(det.carregadoPor) },
        { etapa: 'Finalizado', feita: m.status === 'FINALIZADO', quando: m.finalizadoEm, quem: quem(m.finalizadoPor) },
      ],
    };
  });
}

