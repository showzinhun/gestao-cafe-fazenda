import { z } from 'zod';
import { rota } from '@/lib/rota';
import { alterarStatusCertificadoFazenda } from '@/servicos/conformidade';

/** PUT /api/certificados-fazenda/{id} {status: VALIDO|SUSPENSO, motivo}. */
export const PUT = rota<{ id: string }>(async (ctx, req, p) => {
  const d = z.object({ status: z.enum(['VALIDO', 'SUSPENSO']), motivo: z.string().optional().nullable() }).parse(await req.json());
  return alterarStatusCertificadoFazenda(ctx, p.id, d.status, d.motivo);
});
