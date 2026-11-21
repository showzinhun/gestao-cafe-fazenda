import { criar, listar, obter } from './cadastros';
import type { Contexto } from './transacao';

/** Atalhos do cadastro de fazendas (o ciclo de vida completo está em cadastros.ts). */
export type FazendaResumo = { id: string; codigo: string; nome: string; municipio: string | null; uf: string | null; ativo: boolean };

export const listarFazendas = (ctx: Contexto, incluirInativos = false) => listar(ctx, 'fazendas', { incluirInativos }) as unknown as Promise<FazendaResumo[]>;
export const obterFazenda = (ctx: Contexto, id: string) => obter(ctx, 'fazendas', id) as unknown as Promise<FazendaResumo & Record<string, unknown>>;
export async function criarFazenda(ctx: Contexto, dados: Record<string, unknown>) {
  return (await criar(ctx, 'fazendas', dados)).registro as unknown as FazendaResumo;
}
