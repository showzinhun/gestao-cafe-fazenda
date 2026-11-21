import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ErroNaoEncontrado } from '@/dominio/erros';
import type { Perfil, Permissao } from '@/dominio/perfis';
import { ErroPermissao } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';

export type Tx = Prisma.TransactionClient;

/** Quem faz a operação: vem sempre da sessão no servidor (regra 8). */
export interface Contexto {
  empresaId: string;
  usuarioId: string;
  perfil: Perfil;
  ip?: string | null;
  dispositivoId?: string | null;
  /** Matriz efetiva da empresa; sem ela vale o padrão do domínio. */
  permissoes?: readonly Permissao[];
}

/** Confere a permissão no servidor (§3.2). A interface só esconde ou desativa. */
export function exigir(ctx: Contexto, permissao: Permissao): void {
  const lista = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  if (!lista.includes(permissao)) throw new ErroPermissao();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/**
 * Executa fn numa transação com app.empresa_id e app.usuario_id definidos (§3.1).
 * Todas as políticas RLS leem esses valores; fora daqui nada de negócio aparece.
 */
export async function comTransacao<T>(ctx: Contexto, fn: (tx: Tx, ctx: Contexto) => Promise<T>): Promise<T> {
  if (!ehUuid(ctx.empresaId) || !ehUuid(ctx.usuarioId)) throw new ErroNaoEncontrado();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.empresa_id', ${ctx.empresaId}, true), set_config('app.usuario_id', ${ctx.usuarioId}, true)`;
    return fn(tx, ctx);
  });
}

/**
 * Transação só com o usuário definido, sem empresa: serve apenas para listar os vínculos
 * do próprio usuário (tela de escolha de empresa). Não enxerga dados de negócio.
 */
export async function comUsuario<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ehUuid(usuarioId)) throw new ErroNaoEncontrado();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.empresa_id', '', true), set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
