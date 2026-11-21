import { rota } from '@/lib/rota';
import { sincronizar } from '@/servicos/apontamentos';
import { registrarLeituras } from '@/servicos/secagem';

/** POST /api/campo/sync {dispositivoId, apontamentos:[...], leituras:[...]} → idempotente pelo UUID de cada registro (RN-23). */
export const POST = rota(async (ctx, req) => {
  const corpo = (await req.json()) as { dispositivoId?: string; apontamentos?: unknown[]; leituras?: unknown[] };
  const resultados = corpo.apontamentos?.length ? await sincronizar(ctx, { dispositivoId: corpo.dispositivoId, apontamentos: corpo.apontamentos }) : [];
  const leituras = corpo.leituras?.length ? await registrarLeituras(ctx, { dispositivoId: corpo.dispositivoId, leituras: corpo.leituras }) : [];
  return { resultados, leituras };
});
