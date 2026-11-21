import { rota } from '@/lib/rota';
import { aprovarInventario } from '@/servicos/estoque';

export const POST = rota<{ id: string }>((ctx, _req, p) => aprovarInventario(ctx, p.id));
