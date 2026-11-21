import { rota } from '@/lib/rota';
import { registrarContagem } from '@/servicos/estoque';

export const POST = rota<{ id: string }>(async (ctx, req, p) => registrarContagem(ctx, p.id, (await req.json()).itens));
