'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { alterar, criar, definirAtivo, ehRecurso } from '@/servicos/cadastros';
import { ErroNaoEncontrado } from '@/dominio/erros';

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}

export async function salvarCadastro(recurso: string, id: string | null, dados: Record<string, unknown>): Promise<ResultadoAcao<{ id: string }>> {
  try {
    if (!ehRecurso(recurso)) throw new ErroNaoEncontrado();
    const c = await ctx();
    const r = id ? await alterar(c, recurso, id, dados) : await criar(c, recurso, dados);
    revalidatePath('/cadastros', 'layout');
    return { ok: true, dados: { id: String(r.registro.id) }, avisos: r.avisos, mensagem: id ? 'Alterações salvas.' : 'Cadastro criado.' };
  } catch (e) {
    return falha(e);
  }
}

export async function alternarAtivo(recurso: string, id: string, ativo: boolean): Promise<ResultadoAcao> {
  try {
    if (!ehRecurso(recurso)) throw new ErroNaoEncontrado();
    await definirAtivo(await ctx(), recurso, id, ativo);
    revalidatePath('/cadastros', 'layout');
    return { ok: true, mensagem: ativo ? 'Cadastro reativado.' : 'Cadastro inativado. Ele não aparece mais nas listas de escolha.' };
  } catch (e) {
    return falha(e);
  }
}
