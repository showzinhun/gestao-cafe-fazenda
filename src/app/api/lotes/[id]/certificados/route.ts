import { z } from 'zod';
import { rota } from '@/lib/rota';
import { definirCertificadosLote } from '@/servicos/lotes';

export const PUT = rota<{ id: string }>(async (ctx, req, p) => {
  const d = z.object({ certificadoIds: z.array(z.string()), motivo: z.string().optional() }).parse(await req.json());
  return definirCertificadosLote(ctx, p.id, d.certificadoIds, d.motivo);
});
