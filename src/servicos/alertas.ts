import type { TipoAlerta, SeveridadeAlerta } from '@prisma/client';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { comTransacao, ehUuid, type Contexto, type Tx } from './transacao';
import { janela } from './paginacao';

/**
 * Central de alertas (§4.6, §7). Cada alerta tem uma chave (ex.: PONTO_SECAGEM:<movimento>) para não se repetir.
 * Alertas não são apagados: ficam lidos.
 */
export async function emitirAlerta(tx: Tx, empresaId: string, a: { tipo: TipoAlerta; chave: string; entidade: string; entidadeId: string; mensagem: string; severidade?: SeveridadeAlerta }) {
  await tx.alerta.createMany({ data: [{ empresaId, severidade: 'AVISO', ...a }], skipDuplicates: true });
}

export async function listarAlertas(ctx: Contexto, f: { naoLidos?: boolean; pagina?: number } = {}) {
  return comTransacao(ctx, async (tx) =>
    tx.alerta.findMany({ where: f.naoLidos ? { lidoEm: null } : {}, orderBy: [{ lidoEm: { sort: 'asc', nulls: 'first' } }, { criadoEm: 'desc' }], ...(f.pagina ? janela(f.pagina) : { skip: 0, take: 300 }) }),
  );
}

export async function contarAlertasNaoLidos(ctx: Contexto) {
  return comTransacao(ctx, (tx) => tx.alerta.count({ where: { lidoEm: null } }));
}

/** POST /api/alertas/{id}/lido (§14). */
export async function marcarAlertaLido(ctx: Contexto, id: string) {
  if (!ehUuid(id)) throw new ErroNaoEncontrado('Alerta não encontrado.');
  return comTransacao(ctx, async (tx) => {
    const a = await tx.alerta.findFirst({ where: { id } });
    if (!a) throw new ErroNaoEncontrado('Alerta não encontrado.');
    if (a.lidoEm) return a;
    return tx.alerta.update({ where: { id }, data: { lidoEm: new Date(), lidoPor: ctx.usuarioId } });
  });
}

export async function marcarTodosLidos(ctx: Contexto) {
  return comTransacao(ctx, (tx) => tx.alerta.updateMany({ where: { lidoEm: null }, data: { lidoEm: new Date(), lidoPor: ctx.usuarioId } }));
}
