import { rota } from '@/lib/rota';
import { obterFechamento } from '@/servicos/pagamentos';

export const GET = rota<{ id: string }>((ctx, _req, p) => obterFechamento(ctx, p.id));
