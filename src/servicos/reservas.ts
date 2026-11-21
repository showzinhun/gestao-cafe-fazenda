import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { saldoLivre } from '@/dominio/lote';
import type { Permissao } from '@/dominio/perfis';
import { auditar } from './auditoria';
import { exigirContratoAtivo, validarLoteParaContrato } from './regras-contrato';
import { comTransacao, ehUuid, exigir, type Contexto } from './transacao';
import { dec, exigirFazendas, exigirMotivo, fazendasPermitidas, gravarLote, mapasFazenda, quantidadeSchema, travarLotes } from './rastreio-base';

/**
 * Reservas (RN-07): separam kg de um lote para um uso, sem mover o estoque.
 * Σ reservas ativas ≤ saldo. Cancelar libera; a entrada que usa a reserva a consome.
 */

const PERMISSAO: Record<'TRANSFERENCIA' | 'CONTRATO' | 'SERVICO' | 'EMBARQUE', Permissao> = {
  TRANSFERENCIA: 'movimento.lancar',
  SERVICO: 'movimento.lancar',
  CONTRATO: 'comercial.editar',
  EMBARQUE: 'embarque.programar',
};

const reservaSchema = z.object({
  loteId: z.string().uuid(),
  quantidade: quantidadeSchema,
  finalidade: z.enum(['TRANSFERENCIA', 'CONTRATO', 'SERVICO', 'EMBARQUE']),
  contratoId: z.string().uuid().optional().nullable(),
  movimentoId: z.string().uuid().optional().nullable(),
  localId: z.string().uuid().optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
});

export async function criarReserva(ctx: Contexto, entrada: z.input<typeof reservaSchema>) {
  const d = reservaSchema.parse(entrada);
  exigir(ctx, PERMISSAO[d.finalidade]);
  if (d.finalidade === 'CONTRATO' && !d.contratoId) throw new ErroValidacao('Informe o contrato da reserva.', 'contratoId');
  if (d.finalidade !== 'CONTRATO' && d.contratoId) throw new ErroValidacao('Contrato só em reserva de contrato.', 'contratoId');
  return comTransacao(ctx, async (tx) => {
    await travarLotes(tx, [d.loteId]);
    const lote = await tx.lote.findFirst({ where: { id: d.loteId } });
    if (!lote) throw new ErroNaoEncontrado('Lote não encontrado.');
    if (lote.status === 'ESTORNADO') throw new ErroRegra('RN-05', `O lote ${lote.codigo} foi estornado.`);
    const fazendas = lote.fazendaId ? [lote.fazendaId] : [...(await mapasFazenda(tx, (await tx.loteTalhao.findMany({ where: { loteId: lote.id } })).map((t) => t.talhaoId))).doTalhao.values()];
    exigirFazendas(await fazendasPermitidas(tx, ctx), fazendas);
    if (d.finalidade === 'CONTRATO') {
      const { contrato } = await validarLoteParaContrato(tx, d.contratoId!, lote.id);
      exigirContratoAtivo(contrato);
    }
    if (d.movimentoId) {
      const mov = await tx.movimento.findFirst({ where: { id: d.movimentoId } });
      if (!mov) throw new ErroNaoEncontrado('Movimento não encontrado.');
      if (mov.status !== 'ABERTO') throw new ErroValidacao('Só se reserva para um movimento aberto.');
    }
    const livre = saldoLivre({ quantidade: dec(lote.quantidade), quantidadeUtilizada: dec(lote.quantidadeUtilizada), quantidadeReservada: dec(lote.quantidadeReservada) });
    const q = new Decimal(d.quantidade);
    if (q.gt(livre)) throw new ErroRegra('RN-07', `O lote ${lote.codigo} tem ${livre.toFixed(3)} livre para reservar; pedido ${q.toFixed(3)}.`);
    const reserva = await tx.reserva.create({
      data: {
        empresaId: ctx.empresaId, loteId: lote.id, localId: d.localId ?? null, quantidade: q.toFixed(3), finalidade: d.finalidade,
        contratoId: d.contratoId ?? null, movimentoId: d.movimentoId ?? null, observacao: d.observacao ?? null, criadoPor: ctx.usuarioId,
      },
    });
    await gravarLote(tx, ctx, lote, { reservada: dec(lote.quantidadeReservada).plus(q) });
    await auditar(tx, ctx, { entidade: 'reserva', entidadeId: reserva.id, acao: 'CRIAR', depois: { lote: lote.codigo, quantidade: reserva.quantidade, finalidade: d.finalidade } });
    if (d.contratoId) await tx.contrato.updateMany({ where: { id: d.contratoId, status: 'ASSINADO' }, data: { status: 'EM_EXECUCAO', alteradoPor: ctx.usuarioId } });
    return reserva;
  });
}

/** Cancelar libera a quantidade (RN-07). Nada é apagado: a reserva fica CANCELADA com o motivo. */
export async function cancelarReserva(ctx: Contexto, reservaId: string, motivo: string) {
  if (!ehUuid(reservaId)) throw new ErroNaoEncontrado('Reserva não encontrada.');
  const m = exigirMotivo(motivo);
  return comTransacao(ctx, async (tx) => {
    const r0 = await tx.reserva.findFirst({ where: { id: reservaId } });
    if (!r0) throw new ErroNaoEncontrado('Reserva não encontrada.');
    exigir(ctx, PERMISSAO[r0.finalidade]);
    await travarLotes(tx, [r0.loteId]);
    const r = await tx.reserva.findFirstOrThrow({ where: { id: reservaId } });
    if (r.status !== 'ATIVA') throw new ErroValidacao('A reserva não está ativa.');
    const lote = await tx.lote.findFirstOrThrow({ where: { id: r.loteId } });
    await gravarLote(tx, ctx, lote, { reservada: dec(lote.quantidadeReservada).minus(dec(r.quantidade)) });
    const atualizada = await tx.reserva.update({ where: { id: r.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: m, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'reserva', entidadeId: r.id, acao: 'CANCELAR', antes: { status: 'ATIVA' }, depois: { motivo: m } });
    return atualizada;
  });
}
