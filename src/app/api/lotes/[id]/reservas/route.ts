import { rota } from '@/lib/rota';
import { criarReserva } from '@/servicos/reservas';

export const POST = rota<{ id: string }>(async (ctx, req, p) => criarReserva(ctx, { ...(await req.json()), loteId: p.id }));
