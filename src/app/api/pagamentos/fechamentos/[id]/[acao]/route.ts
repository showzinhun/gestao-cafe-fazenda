import { z } from 'zod';
import { rota } from '@/lib/rota';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { atualizarFechamento, cancelarFechamento, fecharFechamento, pagarFechamento, reabrirFechamento } from '@/servicos/pagamentos';

/** POST /api/pagamentos/fechamentos/{id}/fechar | pagar | reabrir | cancelar | atualizar (§14). */
export const POST = rota<{ id: string; acao: string }>(async (ctx, req, p) => {
  const motivo = async () => z.object({ motivo: z.string() }).parse(await req.json()).motivo;
  switch (p.acao) {
    case 'fechar': return fecharFechamento(ctx, p.id);
    case 'pagar': return pagarFechamento(ctx, p.id);
    case 'atualizar': return atualizarFechamento(ctx, p.id).then(() => null);
    case 'reabrir': return reabrirFechamento(ctx, p.id, await motivo());
    case 'cancelar': return cancelarFechamento(ctx, p.id, await motivo());
    default: throw new ErroNaoEncontrado();
  }
});
