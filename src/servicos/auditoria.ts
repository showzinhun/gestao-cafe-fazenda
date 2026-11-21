import type { Prisma } from '@prisma/client';
import type { Contexto, Tx } from './transacao';

/** Toda escrita grava auditoria (RN-15). Autoria e data vêm do servidor. */
export async function auditar(
  tx: Tx,
  ctx: Contexto,
  registro: { entidade: string; entidadeId: string; acao: 'CRIAR' | 'ALTERAR' | 'INATIVAR' | 'ESTORNAR' | string; antes?: unknown; depois?: unknown },
): Promise<void> {
  await tx.auditoria.create({
    data: {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidade: registro.entidade,
      entidadeId: registro.entidadeId,
      acao: registro.acao,
      antes: (registro.antes ?? undefined) as Prisma.InputJsonValue | undefined,
      depois: (registro.depois ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: ctx.ip ?? null,
      dispositivoId: ctx.dispositivoId ?? null,
    },
  });
}
