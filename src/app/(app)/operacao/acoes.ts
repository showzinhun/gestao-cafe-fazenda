'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { abrirMovimento, adicionarEntradas, apagarResultados, estornarMovimento, lancarResultados, registrarCarga, removerEntrada } from '@/servicos/movimentos';
import { abrirInventario, aprovarInventario, cancelarInventario, registrarContagem, removerEntreLocais } from '@/servicos/estoque';
import { cancelarReserva, criarReserva } from '@/servicos/reservas';
import { definirCertificadosLote } from '@/servicos/lotes';
import { buscar } from '@/servicos/consultas';
import { lancarLeitura } from '@/servicos/secagem';
import { marcarAlertaLido, marcarTodosLidos } from '@/servicos/alertas';

/** Ações das telas operacionais (Fase 3): finas, só chamam os serviços (regra 2). */

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}
const atualizar = () => {
  for (const p of ['/colheita', '/etapas', '/movimentos', '/estoque', '/rastreabilidade']) revalidatePath(p, 'layout');
};
async function executar<T>(mensagem: string, fn: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    const dados = await fn();
    atualizar();
    return { ok: true, mensagem, dados };
  } catch (e) {
    return falha(e);
  }
}

type Arg<F> = F extends (c: never, ...a: infer A) => unknown ? A : never;

export async function acaoRegistrarCarga(d: Arg<typeof registrarCarga>[0]) {
  return executar('Carga registrada.', async () => {
    const r = await registrarCarga(await ctx(), d);
    return { movimentoId: r.movimento.id, lote: r.lote.codigo, alertas: r.alertas.map((a) => a.mensagem) };
  });
}

export async function acaoAbrirMovimento(d: Arg<typeof abrirMovimento>[0]) {
  try {
    const r = await abrirMovimento(await ctx(), d);
    atualizar();
    return { ok: true as const, mensagem: 'Movimento aberto.', dados: { id: r.movimento.id }, avisos: r.alertas.map((a) => a.mensagem) };
  } catch (e) {
    return falha(e);
  }
}

export async function acaoAdicionarEntradas(movimentoId: string, entradas: Arg<typeof adicionarEntradas>[1]) {
  try {
    const r = await adicionarEntradas(await ctx(), movimentoId, entradas);
    atualizar();
    return { ok: true as const, mensagem: 'Entradas acrescentadas.', avisos: r.alertas.map((a) => a.mensagem) };
  } catch (e) {
    return falha(e);
  }
}

export const acaoRemoverEntrada = async (movimentoId: string, loteId: string) => executar('Entrada retirada; o saldo voltou ao lote.', async () => void (await removerEntrada(await ctx(), movimentoId, loteId)));
export const acaoLancarResultados = async (movimentoId: string, d: Arg<typeof lancarResultados>[1]) =>
  executar('Resultados lançados.', async () => (await lancarResultados(await ctx(), movimentoId, d)).lotes.map((l) => l.codigo));
export const acaoApagarResultados = async (movimentoId: string, motivo: string) => executar('Resultados apagados: o movimento voltou a aberto.', async () => void (await apagarResultados(await ctx(), movimentoId, motivo)));
export const acaoEstornar = async (movimentoId: string, motivo: string) => executar('Movimento estornado.', async () => void (await estornarMovimento(await ctx(), movimentoId, motivo)));

export const acaoReservar = async (d: Arg<typeof criarReserva>[0]) => executar('Reserva criada.', async () => void (await criarReserva(await ctx(), d)));
export const acaoCancelarReserva = async (id: string, motivo: string) => executar('Reserva cancelada.', async () => void (await cancelarReserva(await ctx(), id, motivo)));
export const acaoCertificadosLote = async (loteId: string, ids: string[], motivo?: string) => executar('Certificados do lote atualizados.', async () => definirCertificadosLote(await ctx(), loteId, ids, motivo));
export const acaoRemocao = async (d: Arg<typeof removerEntreLocais>[0]) => executar('Remoção registrada. O saldo do lote não mudou.', async () => void (await removerEntreLocais(await ctx(), d)));

export const acaoAbrirInventario = async (localIds: string[], observacao?: string) => executar('Inventário aberto.', async () => (await abrirInventario(await ctx(), { localIds, observacao })).id);
export const acaoContagem = async (id: string, itens: { itemId: string; qtdContada: string }[]) => executar('Contagem salva. O estoque só muda na aprovação.', async () => (await registrarContagem(await ctx(), id, itens)).status);
export const acaoAprovarInventario = async (id: string) => executar('Inventário aprovado: ajustes lançados.', async () => (await aprovarInventario(await ctx(), id)).ajustes.length);
export const acaoCancelarInventario = async (id: string, motivo: string) => executar('Inventário cancelado.', async () => void (await cancelarInventario(await ctx(), id, motivo)));

export async function acaoBuscar(termo: string) {
  try {
    return { ok: true as const, dados: await buscar(await ctx(), termo) };
  } catch (e) {
    return falha(e);
  }
}

// ---------------------------------------------------------------- secagem e alertas (Fase 5)

export const acaoLancarLeitura = async (movimentoId: string, d: { dataHora: string; umidade: string; temperaturaMassa?: string | null; temperaturaAr?: string | null; observacao?: string | null }) =>
  executar('Leitura registrada.', async () => void (await lancarLeitura(await ctx(), movimentoId, d)));
export const acaoAlertaLido = async (id: string) => {
  try {
    await marcarAlertaLido(await ctx(), id);
    revalidatePath('/', 'layout');
    return { ok: true as const };
  } catch (e) {
    return falha(e);
  }
};
export const acaoTodosLidos = async () => {
  try {
    await marcarTodosLidos(await ctx());
    revalidatePath('/', 'layout');
    return { ok: true as const };
  } catch (e) {
    return falha(e);
  }
};
