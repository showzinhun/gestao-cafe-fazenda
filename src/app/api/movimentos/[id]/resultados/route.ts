import { z } from 'zod';
import { rota } from '@/lib/rota';
import { apagarResultados, lancarResultados } from '@/servicos/movimentos';

type P = { id: string };
export const POST = rota<P>(async (ctx, req, p) => lancarResultados(ctx, p.id, await req.json()));
/** Apagar resultados (RN-06) pede motivo no corpo. */
export const DELETE = rota<P>(async (ctx, req, p) => apagarResultados(ctx, p.id, z.object({ motivo: z.string() }).parse(await req.json()).motivo));
