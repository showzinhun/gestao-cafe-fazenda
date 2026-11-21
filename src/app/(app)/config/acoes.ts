'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { aplicarModelo, definirEtapaAtiva, moverEtapa, salvarEtapa, salvarTransicoes, type EntradaEtapa } from '@/servicos/fluxo';
import { adicionarUsuario, alterarUsuario, definirPermissao } from '@/servicos/usuarios';
import { ErroNaoEncontrado } from '@/dominio/erros';
import type { Perfil, Permissao } from '@/dominio/perfis';

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}
const ok = (mensagem: string, caminho: string): ResultadoAcao => {
  revalidatePath(caminho);
  return { ok: true, mensagem };
};

export async function acaoSalvarEtapa(id: string | null, dados: EntradaEtapa): Promise<ResultadoAcao> {
  try {
    await salvarEtapa(await ctx(), id, dados);
    return ok(id ? 'Etapa alterada.' : 'Etapa criada. Agora ligue-a ao fluxo nas transições.', '/config/fluxo');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoEtapaAtiva(id: string, ativa: boolean): Promise<ResultadoAcao> {
  try {
    await definirEtapaAtiva(await ctx(), id, ativa);
    return ok(ativa ? 'Etapa reativada.' : 'Etapa desativada. Ela não recebe novos movimentos.', '/config/fluxo');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoMoverEtapa(id: string, direcao: -1 | 1): Promise<ResultadoAcao> {
  try {
    await moverEtapa(await ctx(), id, direcao);
    return ok('Ordem alterada.', '/config/fluxo');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoSalvarTransicoes(fazendaId: string | null, pares: [string, string][]): Promise<ResultadoAcao> {
  try {
    const f = await salvarTransicoes(await ctx(), { fazendaId, pares });
    revalidatePath('/config/fluxo');
    return { ok: true, mensagem: 'Transições salvas.', avisos: f.pendencias.map((p) => (p.etapa ? `${p.etapa}: ${p.mensagem}` : p.mensagem)) };
  } catch (e) {
    return falha(e);
  }
}
export async function acaoAplicarModelo(codigo: string): Promise<ResultadoAcao> {
  try {
    await aplicarModelo(await ctx(), codigo);
    return ok('Modelo aplicado. Ajuste as etapas como quiser.', '/config/fluxo');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoAdicionarUsuario(dados: { nome: string; email: string; perfil: Perfil; senhaInicial?: string; fazendaIds: string[] }): Promise<ResultadoAcao> {
  try {
    const r = await adicionarUsuario(await ctx(), dados);
    return ok(r.novo ? 'Usuário criado. Passe a senha inicial a ele por um canal seguro.' : 'O e-mail já tinha cadastro: o acesso a esta empresa foi liberado.', '/config/usuarios');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoAlterarUsuario(usuarioId: string, dados: { perfil: Perfil; ativo: boolean; fazendaIds: string[] }): Promise<ResultadoAcao> {
  try {
    await alterarUsuario(await ctx(), usuarioId, dados);
    return ok('Acesso atualizado.', '/config/usuarios');
  } catch (e) {
    return falha(e);
  }
}
export async function acaoPermissao(perfil: Exclude<Perfil, 'ADMIN_EMPRESA'>, permissao: Permissao, permitido: boolean): Promise<ResultadoAcao> {
  try {
    await definirPermissao(await ctx(), { perfil, permissao, permitido });
    return ok('Permissão salva.', '/config/usuarios');
  } catch (e) {
    return falha(e);
  }
}
