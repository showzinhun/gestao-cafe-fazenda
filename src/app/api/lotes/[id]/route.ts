import { rota } from '@/lib/rota';
import { alterarLote, obterLote } from '@/servicos/lotes';

type P = { id: string };
export const GET = rota<P>((ctx, _req, p) => obterLote(ctx, p.id));
export const PATCH = rota<P>(async (ctx, req, p) => alterarLote(ctx, p.id, await req.json()));
