import { rota } from '@/lib/rota';
import { abrirFechamento, listarFechamentos } from '@/servicos/pagamentos';

export const GET = rota((ctx) => listarFechamentos(ctx));
export const POST = rota(async (ctx, req) => abrirFechamento(ctx, await req.json()));
