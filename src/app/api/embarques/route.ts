import { rota } from '@/lib/rota';
import { criarEmbarque, listarEmbarques } from '@/servicos/embarques';

export const GET = rota((ctx) => listarEmbarques(ctx));
/** POST /api/embarques {contratoId} (§14). */
export const POST = rota(async (ctx, req) => criarEmbarque(ctx, await req.json()));
