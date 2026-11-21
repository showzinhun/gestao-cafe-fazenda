import { rota } from '@/lib/rota';
import { buscar } from '@/servicos/consultas';

export const GET = rota((ctx, req) => buscar(ctx, new URL(req.url).searchParams.get('q') ?? ''));
