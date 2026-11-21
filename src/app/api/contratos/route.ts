import { rota } from '@/lib/rota';
import { criarContrato, listarContratos } from '@/servicos/contratos';

export const GET = rota((ctx, req) => listarContratos(ctx, { status: new URL(req.url).searchParams.get('status') ?? undefined }));
export const POST = rota(async (ctx, req) => criarContrato(ctx, await req.json()));
