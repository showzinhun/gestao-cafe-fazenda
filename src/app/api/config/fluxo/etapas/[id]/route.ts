import { z } from 'zod';
import { rota } from '@/lib/rota';
import { definirEtapaAtiva, salvarEtapa } from '@/servicos/fluxo';

export const PUT = rota<{ id: string }>(async (ctx, req, { id }) => salvarEtapa(ctx, id, await req.json()));
export const PATCH = rota<{ id: string }>(async (ctx, req, { id }) => definirEtapaAtiva(ctx, id, z.object({ ativa: z.boolean() }).parse(await req.json()).ativa));
