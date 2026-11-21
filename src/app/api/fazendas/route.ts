import { rota } from '@/lib/rota';
import { criarFazenda, listarFazendas } from '@/servicos/fazendas';

export const GET = rota((ctx) => listarFazendas(ctx));
export const POST = rota(async (ctx, req) => criarFazenda(ctx, await req.json()));
