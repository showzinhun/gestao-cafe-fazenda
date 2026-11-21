'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { definirAtivoColhedor, revelarDadosColhedor, salvarColhedor, salvarTurma } from '@/servicos/colhedores';
import { corrigirApontamento } from '@/servicos/apontamentos';
import { abrirFechamento, atualizarFechamento, cancelarFechamento, fecharFechamento, lancarParaColhedor, pagarFechamento, reabrirFechamento } from '@/servicos/pagamentos';

/** Ações de colhedores e pagamentos (Fase 4): finas, só chamam os serviços. */

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}
async function executar<T>(mensagem: string, fn: () => Promise<T>, caminhos: string[] = ['/colheita', '/pagamentos']): Promise<ResultadoAcao<T>> {
  try {
    const dados = await fn();
    for (const p of caminhos) revalidatePath(p, 'layout');
    return { ok: true, mensagem, dados };
  } catch (e) {
    return falha(e);
  }
}
type Arg<F> = F extends (c: never, ...a: infer A) => unknown ? A : never;

export const acaoSalvarTurma = async (id: string | null, d: Arg<typeof salvarTurma>[1]) => executar(id ? 'Turma alterada.' : 'Turma criada.', async () => void (await salvarTurma(await ctx(), id, d)));
export const acaoSalvarColhedor = async (id: string | null, d: Arg<typeof salvarColhedor>[1]) => executar(id ? 'Colhedor alterado.' : 'Colhedor cadastrado.', async () => void (await salvarColhedor(await ctx(), id, d)));
export const acaoAtivoColhedor = async (id: string, ativo: boolean) => executar(ativo ? 'Colhedor reativado.' : 'Colhedor inativado.', async () => definirAtivoColhedor(await ctx(), id, ativo));
/** Revela CPF e PIX (auditado). Não revalida páginas: o dado aberto só vai para quem pediu. */
export async function acaoRevelar(id: string) {
  try {
    return { ok: true as const, dados: await revelarDadosColhedor(await ctx(), id) };
  } catch (e) {
    return falha(e);
  }
}
export const acaoCorrigirApontamento = async (id: string, medidas: string, motivo: string) => executar('Apontamento corrigido.', async () => void (await corrigirApontamento(await ctx(), id, { medidas, motivo })));

export const acaoAbrirFechamento = async (d: Arg<typeof abrirFechamento>[0]) => executar('Fechamento aberto.', async () => (await abrirFechamento(await ctx(), d)).id);
export const acaoAtualizarFechamento = async (id: string) => executar('Fechamento recalculado.', async () => void (await atualizarFechamento(await ctx(), id)));
export const acaoFechar = async (id: string) => executar('Fechado: os preços ficaram congelados nos apontamentos.', async () => void (await fecharFechamento(await ctx(), id)));
export const acaoPagar = async (id: string) => executar('Pagamento registrado.', async () => void (await pagarFechamento(await ctx(), id)));
export const acaoReabrir = async (id: string, motivo: string) => executar('Fechamento reaberto.', async () => void (await reabrirFechamento(await ctx(), id, motivo)));
export const acaoCancelarFechamento = async (id: string, motivo: string) => executar('Fechamento cancelado.', async () => void (await cancelarFechamento(await ctx(), id, motivo)));
export const acaoLancar = async (d: Arg<typeof lancarParaColhedor>[0]) => executar('Lançamento registrado.', async () => void (await lancarParaColhedor(await ctx(), d)));
