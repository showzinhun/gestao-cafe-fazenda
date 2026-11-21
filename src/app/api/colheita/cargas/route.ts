import { rota } from '@/lib/rota';
import { listarCargas } from '@/servicos/consultas';
import { registrarCarga } from '@/servicos/movimentos';

export const GET = rota((ctx, req) => listarCargas(ctx, { data: new URL(req.url).searchParams.get('data') ?? undefined }));
export const POST = rota(async (ctx, req) => registrarCarga(ctx, await req.json()));
