import { rota } from '@/lib/rota';
import { arquivoDoForm, camposDoForm } from '@/lib/formulario-arquivo';
import { adicionarCertificadoFazenda, listarCertificadosFazenda } from '@/servicos/conformidade';

/** GET /api/fazendas/{id}/certificados. */
export const GET = rota<{ id: string }>(async (ctx, _req, p) => listarCertificadosFazenda(ctx, p.id));

/** POST /api/fazendas/{id}/certificados: JSON ou multipart com o PDF do certificado em "arquivo". */
export const POST = rota<{ id: string }>(async (ctx, req, p) => {
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData();
    return adicionarCertificadoFazenda(ctx, p.id, camposDoForm(f) as never, await arquivoDoForm(f));
  }
  return adicionarCertificadoFazenda(ctx, p.id, await req.json());
});
