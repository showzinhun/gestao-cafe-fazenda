import { rota } from '@/lib/rota';
import { registrarAmostra } from '@/servicos/contratos';

export const POST = rota(async (ctx, req) => registrarAmostra(ctx, await req.json()));
