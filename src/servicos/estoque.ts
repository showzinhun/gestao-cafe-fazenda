import Decimal from 'decimal.js';
import { z } from 'zod';
import { ErroNaoEncontrado, ErroRegra, ErroValidacao } from '@/dominio/erros';
import { qtd } from '@/dominio/quantidade';
import { auditar } from './auditoria';
import { comTransacao, ehUuid, exigir, type Contexto, type Tx } from './transacao';
import {
  baixarLocal, codigoLivre, dec, exigirFazendas, exigirMotivo, fazendasPermitidas, gravarLote, mapasFazenda, normalizarDecimal, proximoNumero, quantidadeSchema, somarLocal, travarLotes,
} from './rastreio-base';

/**
 * Estoque por local (RN-25): remoção entre locais e inventário com aprovação (RN-29).
 * Nada muda quantidade sem movimento: o ajuste do inventário vira movimento de AJUSTE_INVENTARIO.
 */

async function fazendasDe(tx: Tx, lote: { id: string; fazendaId: string | null }) {
  if (lote.fazendaId) return [lote.fazendaId];
  const ts = await tx.loteTalhao.findMany({ where: { loteId: lote.id }, select: { talhaoId: true } });
  return [...new Set((await mapasFazenda(tx, ts.map((t) => t.talhaoId))).doTalhao.values())];
}

// ================================================================ remoção

const remocaoSchema = z.object({
  loteId: z.string().uuid(),
  localOrigemId: z.string().uuid(),
  localDestinoId: z.string().uuid(),
  quantidade: quantidadeSchema,
  motivo: z.string().trim().max(300).optional().nullable(),
});

/** Troca o local de parte (ou de todo) o saldo de um lote. O saldo do lote não muda (RN-25). */
export async function removerEntreLocais(ctx: Contexto, entrada: z.input<typeof remocaoSchema>) {
  exigir(ctx, 'movimento.lancar');
  const d = remocaoSchema.parse(entrada);
  if (d.localOrigemId === d.localDestinoId) throw new ErroValidacao('Origem e destino são o mesmo local.', 'localDestinoId');
  return comTransacao(ctx, async (tx) => {
    await travarLotes(tx, [d.loteId]);
    const lote = await tx.lote.findFirst({ where: { id: d.loteId }, include: { etapa: true } });
    if (!lote) throw new ErroNaoEncontrado('Lote não encontrado.');
    if (lote.etapa.classe !== 'ESTOQUE') throw new ErroValidacao('Remoção só vale para lotes do estoque.');
    if (lote.status === 'ESTORNADO') throw new ErroValidacao('Lote estornado não se movimenta.');
    exigirFazendas(await fazendasPermitidas(tx, ctx), await fazendasDe(tx, lote));
    const destino = await tx.local.findFirst({ where: { id: d.localDestinoId, ativo: true } });
    if (!destino) throw new ErroNaoEncontrado('Local não encontrado.');
    if (destino.etapaId !== lote.etapaId) throw new ErroValidacao(`O local ${destino.codigo} não é de ${lote.etapa.nome}.`, 'localDestinoId');
    const q = new Decimal(d.quantidade);
    const reservadoAli = await tx.reserva.aggregate({ _sum: { quantidade: true }, where: { loteId: lote.id, localId: d.localOrigemId, status: 'ATIVA' } });
    const noLocal = await tx.loteLocal.findUnique({ where: { loteId_localId: { loteId: lote.id, localId: d.localOrigemId } } });
    if (noLocal && dec(noLocal.quantidade).minus(dec(reservadoAli._sum.quantidade)).lt(q))
      throw new ErroRegra('RN-25', `Há ${dec(noLocal.quantidade).minus(dec(reservadoAli._sum.quantidade)).toFixed(3)} livre do lote ${lote.codigo} nesse local.`);
    await baixarLocal(tx, lote, d.localOrigemId, q);
    await somarLocal(tx, ctx.empresaId, lote.id, d.localDestinoId, q);
    const r = await tx.remocao.create({
      data: { empresaId: ctx.empresaId, loteId: lote.id, localOrigemId: d.localOrigemId, localDestinoId: d.localDestinoId, quantidade: q.toFixed(3), motivo: d.motivo || null, criadoPor: ctx.usuarioId },
    });
    await auditar(tx, ctx, { entidade: 'remocao', entidadeId: r.id, acao: 'CRIAR', depois: { lote: lote.codigo, de: d.localOrigemId, para: d.localDestinoId, quantidade: r.quantidade } });
    return r;
  });
}

// ================================================================ inventário (RN-29)

export async function abrirInventario(ctx: Contexto, entrada: { localIds: string[]; observacao?: string | null }) {
  exigir(ctx, 'movimento.lancar');
  const d = z.object({ localIds: z.array(z.string().uuid()).min(1, 'Escolha pelo menos um local.'), observacao: z.string().trim().max(500).optional().nullable() }).parse(entrada);
  return comTransacao(ctx, async (tx) => {
    const locais = await tx.local.findMany({ where: { id: { in: d.localIds } }, include: { etapa: { select: { classe: true } } } });
    if (locais.length !== new Set(d.localIds).size) throw new ErroNaoEncontrado('Local não encontrado.');
    if (locais.some((l) => l.etapa.classe !== 'ESTOQUE')) throw new ErroValidacao('Inventário só de locais do estoque.');
    const emAberto = await tx.inventario.findFirst({ where: { status: { in: ['ABERTO', 'CONTADO'] }, localIds: { hasSome: d.localIds } } });
    if (emAberto) throw new ErroValidacao(`O inventário nº ${emAberto.numero} já está aberto para um desses locais.`);
    const saldos = await tx.loteLocal.findMany({ where: { localId: { in: d.localIds }, quantidade: { gt: 0 }, lote: { status: { not: 'ESTORNADO' } } } });
    const numero = await proximoNumero(tx, ctx.empresaId, 'inventario');
    const inv = await tx.inventario.create({ data: { empresaId: ctx.empresaId, numero, localIds: d.localIds, observacao: d.observacao || null, criadoPor: ctx.usuarioId } });
    if (saldos.length)
      await tx.inventarioItem.createMany({ data: saldos.map((s) => ({ empresaId: ctx.empresaId, inventarioId: inv.id, loteId: s.loteId, localId: s.localId, qtdSistema: s.quantidade })) });
    await auditar(tx, ctx, { entidade: 'inventario', entidadeId: inv.id, acao: 'CRIAR', depois: { numero, locais: locais.map((l) => l.codigo), itens: saldos.length } });
    return inv;
  });
}

/** Lança contagens. Não mexe no estoque (RN-29). Com tudo contado, o inventário fica CONTADO. */
export async function registrarContagem(ctx: Contexto, inventarioId: string, itens: { itemId: string; qtdContada: string | number }[]) {
  exigir(ctx, 'movimento.lancar');
  if (!ehUuid(inventarioId)) throw new ErroNaoEncontrado('Inventário não encontrado.');
  const lista = z.array(z.object({ itemId: z.string().uuid(), qtdContada: z.union([z.string(), z.number()]).transform(normalizarDecimal) })).min(1).parse(itens);
  return comTransacao(ctx, async (tx) => {
    const inv = await tx.inventario.findFirst({ where: { id: inventarioId } });
    if (!inv) throw new ErroNaoEncontrado('Inventário não encontrado.');
    if (inv.status !== 'ABERTO' && inv.status !== 'CONTADO') throw new ErroValidacao('O inventário não aceita mais contagem.');
    for (const i of lista) {
      let contada: Decimal;
      try {
        contada = qtd(i.qtdContada);
      } catch {
        throw new ErroValidacao('Quantidade contada inválida.');
      }
      if (contada.lt(0)) throw new ErroValidacao('A quantidade contada não pode ser negativa.');
      const item = await tx.inventarioItem.findFirst({ where: { id: i.itemId, inventarioId } });
      if (!item) throw new ErroNaoEncontrado('Item do inventário não encontrado.');
      await tx.inventarioItem.update({ where: { id: item.id }, data: { qtdContada: contada.toFixed(3), diferenca: contada.minus(dec(item.qtdSistema)).toFixed(3), alteradoPor: ctx.usuarioId } });
    }
    const faltam = await tx.inventarioItem.count({ where: { inventarioId, qtdContada: null } });
    const atualizado = await tx.inventario.update({ where: { id: inventarioId }, data: { status: faltam ? 'ABERTO' : 'CONTADO', alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'inventario', entidadeId: inventarioId, acao: 'CONTAGEM', depois: lista });
    return atualizado;
  });
}

/**
 * Aprovação (permissão própria): cada diferença vira um movimento de ajuste no lote e local (RN-29).
 * Falta: baixa do lote. Sobra: lote novo com a mesma origem (composição, certificados, safra, tipo, peneira).
 */
export async function aprovarInventario(ctx: Contexto, inventarioId: string) {
  exigir(ctx, 'inventario.aprovar');
  if (!ehUuid(inventarioId)) throw new ErroNaoEncontrado('Inventário não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const inv = await tx.inventario.findFirst({ where: { id: inventarioId }, include: { itens: true } });
    if (!inv) throw new ErroNaoEncontrado('Inventário não encontrado.');
    if (inv.status !== 'CONTADO') throw new ErroValidacao(inv.status === 'ABERTO' ? 'Ainda há itens sem contagem.' : 'O inventário não está para aprovar.');
    await travarLotes(tx, inv.itens.map((i) => i.loteId));
    const permitidas = await fazendasPermitidas(tx, ctx);
    const agora = new Date();
    const ajustes: string[] = [];
    for (const item of inv.itens) {
      const dif = dec(item.diferenca);
      if (dif.isZero()) continue;
      const noLocal = await tx.loteLocal.findUnique({ where: { loteId_localId: { loteId: item.loteId, localId: item.localId } } });
      if (!noLocal || !dec(noLocal.quantidade).eq(dec(item.qtdSistema)))
        throw new ErroRegra('RN-29', 'O estoque mudou depois da abertura do inventário. Cancele e abra um novo para recontar.');
      const lote = await tx.lote.findFirstOrThrow({ where: { id: item.loteId }, include: { etapa: true, safra: true, tipoCafe: true, peneira: true, fazenda: true } });
      exigirFazendas(permitidas, await fazendasDe(tx, lote));
      const numero = await proximoNumero(tx, ctx.empresaId, `movimento:${lote.etapaId}`);
      const absoluto = dif.abs();
      const base = {
        empresaId: ctx.empresaId, etapaId: lote.etapaId, numero, natureza: 'AJUSTE_INVENTARIO' as const, fazendaId: lote.fazendaId, safraId: lote.safraId, localId: item.localId,
        unidade: lote.unidade, dataEntrada: agora, dataResultado: agora, observacao: `Inventário nº ${inv.numero}`, criadoPor: ctx.usuarioId,
      };
      let movId: string;
      if (dif.lt(0)) {
        if (dec(lote.quantidadeReservada).gt(dec(lote.quantidade).minus(dec(lote.quantidadeUtilizada)).minus(absoluto)))
          throw new ErroRegra('RN-07', `O lote ${lote.codigo} tem reservas maiores que o saldo contado. Ajuste as reservas antes de aprovar.`);
        const mov = await tx.movimento.create({
          data: { ...base, status: 'FINALIZADO', qtdEntrada: absoluto.toFixed(3), qtdSaida: '0', qtdPerda: absoluto.toFixed(3), finalizadoEm: agora, finalizadoPor: ctx.usuarioId },
        });
        await tx.movimentoEntrada.create({ data: { empresaId: ctx.empresaId, movimentoId: mov.id, loteId: lote.id, quantidade: absoluto.toFixed(3), unidade: lote.unidade, localOrigemId: item.localId, criadoPor: ctx.usuarioId } });
        await baixarLocal(tx, lote, item.localId, absoluto);
        await gravarLote(tx, ctx, lote, { utilizada: dec(lote.quantidadeUtilizada).plus(absoluto) });
        movId = mov.id;
      } else {
        const mov = await tx.movimento.create({ data: { ...base, status: 'PROCESSADO', qtdEntrada: '0', qtdSaida: absoluto.toFixed(3) } });
        const codigo = await codigoLivre(tx, { prefixo: lote.etapa.prefixoLote, fazenda: lote.fazenda?.codigo ?? null, safra: lote.safra.codigo, numero, tipo: lote.tipoCafe?.codigo, peneira: lote.peneira?.codigo });
        const novo = await tx.lote.create({
          data: {
            empresaId: ctx.empresaId, codigo, movimentoId: mov.id, etapaId: lote.etapaId, fazendaId: lote.fazendaId, safraId: lote.safraId, tipoCafeId: lote.tipoCafeId,
            peneiraId: lote.peneiraId, unidade: lote.unidade, quantidade: absoluto.toFixed(3), origemTipo: 'PROCESSO', data: agora, observacao: `Sobra do inventário nº ${inv.numero} (lote ${lote.codigo})`, criadoPor: ctx.usuarioId,
          },
        });
        const comp = await tx.loteTalhao.findMany({ where: { loteId: lote.id } });
        await tx.loteTalhao.createMany({ data: comp.map((c) => ({ empresaId: ctx.empresaId, loteId: novo.id, talhaoId: c.talhaoId, percentual: c.percentual, quantidadeEquivalente: qtd(dec(c.percentual).times(absoluto)).toFixed(3) })) });
        const certs = await tx.loteCertificado.findMany({ where: { loteId: lote.id, removidoEm: null } });
        if (certs.length) await tx.loteCertificado.createMany({ data: certs.map((c) => ({ empresaId: ctx.empresaId, loteId: novo.id, certificadoId: c.certificadoId })) });
        await somarLocal(tx, ctx.empresaId, novo.id, item.localId, absoluto);
        movId = mov.id;
      }
      await tx.inventarioItem.update({ where: { id: item.id }, data: { ajusteMovimentoId: movId, alteradoPor: ctx.usuarioId } });
      ajustes.push(movId);
    }
    const atualizado = await tx.inventario.update({ where: { id: inv.id }, data: { status: 'APROVADO', aprovadoPor: ctx.usuarioId, aprovadoEm: agora, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'inventario', entidadeId: inv.id, acao: 'APROVAR', depois: { ajustes } });
    return { inventario: atualizado, ajustes };
  });
}

export async function cancelarInventario(ctx: Contexto, inventarioId: string, motivo: string) {
  exigir(ctx, 'movimento.lancar');
  if (!ehUuid(inventarioId)) throw new ErroNaoEncontrado('Inventário não encontrado.');
  const m = exigirMotivo(motivo);
  return comTransacao(ctx, async (tx) => {
    const inv = await tx.inventario.findFirst({ where: { id: inventarioId } });
    if (!inv) throw new ErroNaoEncontrado('Inventário não encontrado.');
    if (inv.status === 'APROVADO' || inv.status === 'CANCELADO') throw new ErroRegra('RN-29', 'Inventário aprovado ou cancelado não se cancela.');
    const r = await tx.inventario.update({ where: { id: inv.id }, data: { status: 'CANCELADO', canceladoEm: new Date(), motivoCancelamento: m, alteradoPor: ctx.usuarioId } });
    await auditar(tx, ctx, { entidade: 'inventario', entidadeId: inv.id, acao: 'CANCELAR', depois: { motivo: m } });
    return r;
  });
}

export async function obterInventario(ctx: Contexto, inventarioId: string) {
  if (!ehUuid(inventarioId)) throw new ErroNaoEncontrado('Inventário não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const inv = await tx.inventario.findFirst({
      where: { id: inventarioId },
      include: { itens: { include: { lote: { select: { codigo: true, unidade: true } } }, orderBy: { lote: { codigo: 'asc' } } } },
    });
    if (!inv) throw new ErroNaoEncontrado('Inventário não encontrado.');
    const locais = await tx.local.findMany({ where: { id: { in: inv.localIds } }, select: { id: true, codigo: true, nome: true } });
    return { ...inv, locais };
  });
}

export async function listarInventarios(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const lista = await tx.inventario.findMany({ orderBy: { numero: 'desc' }, take: 100, include: { _count: { select: { itens: true } } } });
    const locais = new Map((await tx.local.findMany({ select: { id: true, codigo: true } })).map((l) => [l.id, l.codigo]));
    return lista.map((i) => ({ ...i, locaisCodigos: i.localIds.map((x) => locais.get(x) ?? '?') }));
  });
}
