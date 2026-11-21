import { rota } from '@/lib/rota';
import { obterEmbarque } from '@/servicos/embarques';

export const GET = rota<{ id: string }>((ctx, _req, p) => obterEmbarque(ctx, p.id));
