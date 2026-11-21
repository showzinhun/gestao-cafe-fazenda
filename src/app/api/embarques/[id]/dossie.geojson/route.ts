import { download, versaoDaUrl } from '@/lib/rota';
import { geojsonTalhoes } from '@/dominio/pacote';
import { obterDossie } from '@/servicos/dossie';

/** GET /api/embarques/{id}/dossie.geojson?versao= (§14): FeatureCollection dos talhões. */
export const GET = download<{ id: string }>(async (ctx, req, p) => {
  const d = await obterDossie(ctx, p.id, versaoDaUrl(req));
  return { conteudo: JSON.stringify(geojsonTalhoes(d.conteudo.talhoes), null, 2), tipo: 'application/geo+json; charset=utf-8', nome: `dossie-${d.conteudo.embarque.codigo}-v${d.versao}.geojson` };
});
