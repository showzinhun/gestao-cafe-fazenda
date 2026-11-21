import { z } from 'zod';
import { rota } from '@/lib/rota';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { assinarContrato, cancelarContrato, registrarFixacao, reservarParaContrato } from '@/servicos/contratos';

/** POST /api/contratos/{id}/assinar | cancelar {motivo} | reservas {itens} | fixacoes {...} */
export const POST = rota<{ id: string; acao: string }>(async (ctx, req, p) => {
  const corpo = await req.json().catch(() => ({}));
  switch (p.acao) {
    case 'assinar': return assinarContrato(ctx, p.id);
    case 'cancelar': return cancelarContrato(ctx, p.id, z.object({ motivo: z.string() }).parse(corpo).motivo);
    case 'reservas': return reservarParaContrato(ctx, p.id, Array.isArray(corpo) ? corpo : corpo.itens);
    case 'fixacoes': return registrarFixacao(ctx, p.id, corpo);
    default: throw new ErroNaoEncontrado();
  }
});
