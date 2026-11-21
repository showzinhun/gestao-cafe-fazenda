import { rota } from '@/lib/rota';
import { alterarContrato, obterContrato } from '@/servicos/contratos';

type P = { id: string };
export const GET = rota<P>((ctx, _req, p) => obterContrato(ctx, p.id));
export const PUT = rota<P>(async (ctx, req, p) => alterarContrato(ctx, p.id, await req.json()));
