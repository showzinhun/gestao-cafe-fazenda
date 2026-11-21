import { rota } from '@/lib/rota';
import { movimentosEmSecagem } from '@/servicos/secagem';

export const GET = rota((ctx) => movimentosEmSecagem(ctx));
