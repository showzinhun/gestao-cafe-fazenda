import { z } from 'zod';
import { rota } from '@/lib/rota';
import { arquivoDoForm, camposDoForm } from '@/lib/formulario-arquivo';
import { alterarCertificadoFazenda, alterarStatusCertificadoFazenda } from '@/servicos/conformidade';

/**
 * PUT /api/certificados-fazenda/{id}
 * - {status: VALIDO|SUSPENSO, motivo}: suspende (com motivo) ou reativa;
 * - {numero, validadeInicio, validadeFim, parcial} (JSON ou multipart com "arquivo"): corrige o certificado.
 */
export const PUT = rota<{ id: string }>(async (ctx, req, p) => {
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData();
    return alterarCertificadoFazenda(ctx, p.id, camposDoForm(f) as never, await arquivoDoForm(f));
  }
  const corpo = await req.json();
  if ('status' in corpo) {
    const d = z.object({ status: z.enum(['VALIDO', 'SUSPENSO']), motivo: z.string().optional().nullable() }).parse(corpo);
    return alterarStatusCertificadoFazenda(ctx, p.id, d.status, d.motivo);
  }
  return alterarCertificadoFazenda(ctx, p.id, corpo);
});
