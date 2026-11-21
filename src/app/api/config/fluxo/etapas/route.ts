import { rota } from '@/lib/rota';
import { salvarEtapa } from '@/servicos/fluxo';

export const POST = rota(async (ctx, req) => salvarEtapa(ctx, null, await req.json()));
