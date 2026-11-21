import { rota } from '@/lib/rota';
import { abrirInventario, listarInventarios } from '@/servicos/estoque';

export const GET = rota((ctx) => listarInventarios(ctx));
export const POST = rota(async (ctx, req) => abrirInventario(ctx, await req.json()));
