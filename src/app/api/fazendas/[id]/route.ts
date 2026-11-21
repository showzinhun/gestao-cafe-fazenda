import { rota } from '@/lib/rota';
import { obterFazenda } from '@/servicos/fazendas';

export const GET = rota<{ id: string }>((ctx, _req, { id }) => obterFazenda(ctx, id));
