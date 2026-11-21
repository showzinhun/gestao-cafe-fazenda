import { rota } from '@/lib/rota';
import { painelSecagem } from '@/servicos/secagem';

export const GET = rota((ctx) => painelSecagem(ctx));
