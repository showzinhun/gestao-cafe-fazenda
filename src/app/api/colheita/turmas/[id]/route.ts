import { rota } from '@/lib/rota';
import { salvarTurma } from '@/servicos/colhedores';

export const PUT = rota<{ id: string }>(async (ctx, req, p) => salvarTurma(ctx, p.id, await req.json()));
