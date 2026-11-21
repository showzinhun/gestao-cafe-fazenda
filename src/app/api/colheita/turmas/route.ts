import { rota } from '@/lib/rota';
import { listarTurmas, salvarTurma } from '@/servicos/colhedores';

export const GET = rota((ctx, req) => listarTurmas(ctx, { incluirInativas: new URL(req.url).searchParams.get('inativas') === '1' }));
export const POST = rota(async (ctx, req) => salvarTurma(ctx, null, await req.json()));
