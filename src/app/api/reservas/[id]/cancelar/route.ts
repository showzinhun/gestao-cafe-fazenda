import { z } from 'zod';
import { rota } from '@/lib/rota';
import { cancelarReserva } from '@/servicos/reservas';

export const POST = rota<{ id: string }>(async (ctx, req, p) => cancelarReserva(ctx, p.id, z.object({ motivo: z.string() }).parse(await req.json()).motivo));
