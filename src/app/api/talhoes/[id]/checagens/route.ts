import { rota } from '@/lib/rota';
import { arquivoDoForm, camposDoForm } from '@/lib/formulario-arquivo';
import { checarTalhao, importarChecagem, listarChecagens } from '@/servicos/conformidade';

/** GET /api/talhoes/{id}/checagens. */
export const GET = rota<{ id: string }>(async (ctx, _req, p) => listarChecagens(ctx, p.id));

/**
 * POST /api/talhoes/{id}/checagens (§14): JSON {provedor: "MOCK"} roda o provedor;
 * multipart com resultado, dataChecagem, provedor, areaAlertaHa, observacao e arquivo (PDF) importa o laudo.
 */
export const POST = rota<{ id: string }>(async (ctx, req, p) => {
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData();
    return importarChecagem(ctx, p.id, camposDoForm(f) as never, await arquivoDoForm(f));
  }
  const corpo = await req.json().catch(() => ({}));
  if (corpo.resultado) return importarChecagem(ctx, p.id, corpo);
  return checarTalhao(ctx, p.id, corpo.provedor ?? 'MOCK');
});
