import { z } from 'zod';
import { rota } from '@/lib/rota';
import { estornarMovimento } from '@/servicos/movimentos';

export const POST = rota<{ id: string }>(async (ctx, req, p) => estornarMovimento(ctx, p.id, z.object({ motivo: z.string() }).parse(await req.json()).motivo));
