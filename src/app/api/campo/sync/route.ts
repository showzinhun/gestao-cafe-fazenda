import { rota } from '@/lib/rota';
import { sincronizar } from '@/servicos/apontamentos';

/** POST /api/campo/sync {dispositivoId, apontamentos:[...]} → idempotente pelo UUID de cada registro (RN-23). */
export const POST = rota(async (ctx, req) => {
  const corpo = (await req.json()) as { dispositivoId?: string; apontamentos?: unknown[] };
  return { resultados: await sincronizar({ ...ctx, dispositivoId: corpo.dispositivoId ?? ctx.dispositivoId }, { dispositivoId: corpo.dispositivoId, apontamentos: corpo.apontamentos ?? [] }) };
});
