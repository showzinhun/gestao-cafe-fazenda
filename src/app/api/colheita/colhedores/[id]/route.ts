import { z } from 'zod';
import { rota } from '@/lib/rota';
import { definirAtivoColhedor, salvarColhedor } from '@/servicos/colhedores';

type P = { id: string };
export const PUT = rota<P>(async (ctx, req, p) => salvarColhedor(ctx, p.id, await req.json()));
export const PATCH = rota<P>(async (ctx, req, p) => definirAtivoColhedor(ctx, p.id, z.object({ ativo: z.boolean() }).parse(await req.json()).ativo));
