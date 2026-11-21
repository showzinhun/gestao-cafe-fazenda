import { download, versaoDaUrl } from '@/lib/rota';
import { csvDossie } from '@/dominio/pacote';
import { obterDossie } from '@/servicos/dossie';

/** GET /api/embarques/{id}/dossie.csv?versao= (§14). */
export const GET = download<{ id: string }>(async (ctx, req, p) => {
  const d = await obterDossie(ctx, p.id, versaoDaUrl(req));
  return { conteudo: '﻿' + csvDossie(d.conteudo), tipo: 'text/csv; charset=utf-8', nome: `dossie-${d.conteudo.embarque.codigo}-v${d.versao}.csv` };
});
