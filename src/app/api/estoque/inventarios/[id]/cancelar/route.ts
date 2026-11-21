import { z } from 'zod';
import { rota } from '@/lib/rota';
import { cancelarInventario } from '@/servicos/estoque';

export const POST = rota<{ id: string }>(async (ctx, req, p) => cancelarInventario(ctx, p.id, z.object({ motivo: z.string() }).parse(await req.json()).motivo));
