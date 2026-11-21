import { rota } from '@/lib/rota';
import { corrigirApontamento } from '@/servicos/apontamentos';

/** Correção depois do dia: GESTOR, com motivo (§6.1). */
export const PUT = rota<{ id: string }>(async (ctx, req, p) => corrigirApontamento(ctx, p.id, await req.json()));
