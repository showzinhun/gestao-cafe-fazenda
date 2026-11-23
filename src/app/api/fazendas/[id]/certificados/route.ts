import { rota } from '@/lib/rota';
import { arquivoDoForm, camposDoForm, certificadosDoForm } from '@/lib/formulario-arquivo';
import { adicionarCertificadoFazenda, adicionarCertificadosFazenda, listarCertificadosFazenda } from '@/servicos/conformidade';

/** GET /api/fazendas/{id}/certificados. */
export const GET = rota<{ id: string }>(async (ctx, _req, p) => listarCertificadosFazenda(ctx, p.id));

/**
 * POST /api/fazendas/{id}/certificados: um certificado (JSON ou multipart com o PDF em "arquivo"), vários de uma vez
 * (JSON em lista) ou o formulário da tela (multipart com "marcados" e os campos numero_<id>, inicio_<id>, fim_<id>, parcial_<id>, arquivo_<id>).
 * O ID (numero) é opcional em cada certificado.
 */
export const POST = rota<{ id: string }>(async (ctx, req, p) => {
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData();
    if (f.has('marcados')) return adicionarCertificadosFazenda(ctx, p.id, await certificadosDoForm(f));
    return adicionarCertificadoFazenda(ctx, p.id, camposDoForm(f) as never, await arquivoDoForm(f));
  }
  const corpo = await req.json();
  if (Array.isArray(corpo)) return adicionarCertificadosFazenda(ctx, p.id, corpo.map((entrada) => ({ entrada })));
  return adicionarCertificadoFazenda(ctx, p.id, corpo);
});
