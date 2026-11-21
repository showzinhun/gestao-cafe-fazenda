import { download, versaoDaUrl } from '@/lib/rota';
import { obterPacote } from '@/servicos/dossie';

/** GET /api/embarques/{id}/pacote.geojson?versao= (§17): um polígono por talhão da composição. */
export const GET = download<{ id: string }>(async (ctx, req, p) => {
  const k = await obterPacote(ctx, p.id, versaoDaUrl(req));
  return { conteudo: JSON.stringify(k.geojson, null, 2), tipo: 'application/geo+json; charset=utf-8', nome: `${k.nome}.geojson` };
});
