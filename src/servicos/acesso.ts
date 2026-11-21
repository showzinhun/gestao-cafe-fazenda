import { comTransacao, comUsuario, ehUuid, type Contexto } from './transacao';
import type { Perfil } from '@/dominio/perfis';
import { ErroNaoEncontrado } from '@/dominio/erros';

export interface EmpresaDoUsuario {
  empresaId: string;
  nome: string;
  perfil: Perfil;
}

/** Empresas em que o usuário tem vínculo ativo e que estão ATIVAS (§3.2). */
export async function listarEmpresasDoUsuario(usuarioId: string): Promise<EmpresaDoUsuario[]> {
  return comUsuario(usuarioId, async (tx) => {
    const vinculos = await tx.usuarioEmpresa.findMany({
      where: { usuarioId, ativo: true, empresa: { status: 'ATIVA' } },
      include: { empresa: { select: { nome: true } } },
      orderBy: { empresa: { nome: 'asc' } },
    });
    return vinculos.map((v) => ({ empresaId: v.empresaId, nome: v.empresa.nome, perfil: v.perfil }));
  });
}

/** Confirma o vínculo ativo do usuário com a empresa; outra empresa → 404 (RN-22). */
export async function vinculoAtivo(usuarioId: string, empresaId: string): Promise<EmpresaDoUsuario> {
  if (!ehUuid(empresaId)) throw new ErroNaoEncontrado();
  const lista = await listarEmpresasDoUsuario(usuarioId);
  const v = lista.find((e) => e.empresaId === empresaId);
  if (!v) throw new ErroNaoEncontrado();
  return v;
}

export async function resumoEmpresa(ctx: Contexto) {
  return comTransacao(ctx, async (tx) => {
    const [empresa, fazendas, usuarios] = await Promise.all([
      tx.empresa.findFirst({ where: { id: ctx.empresaId }, select: { nome: true, plano: true } }),
      tx.fazenda.count({ where: { ativo: true } }),
      tx.usuarioEmpresa.count({ where: { empresaId: ctx.empresaId, ativo: true } }),
    ]);
    if (!empresa) throw new ErroNaoEncontrado();
    return { ...empresa, fazendas, usuarios };
  });
}
