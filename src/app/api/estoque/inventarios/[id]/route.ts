import { rota } from '@/lib/rota';
import { obterInventario } from '@/servicos/estoque';

export const GET = rota<{ id: string }>((ctx, _req, p) => obterInventario(ctx, p.id));
