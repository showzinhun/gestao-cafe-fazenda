import { rota } from '@/lib/rota';
import { retornoAmostra } from '@/servicos/contratos';

/** Retorno do cliente: APROVADA | REPROVADA | SEM_RETORNO. */
export const PUT = rota<{ id: string }>(async (ctx, req, p) => retornoAmostra(ctx, p.id, await req.json()));
