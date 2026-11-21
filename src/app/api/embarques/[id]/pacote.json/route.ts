import { download, versaoDaUrl } from '@/lib/rota';
import { obterPacote } from '@/servicos/dossie';

/** GET /api/embarques/{id}/pacote.json?versao= (§17): conteúdo congelado, com hash. */
export const GET = download<{ id: string }>(async (ctx, req, p) => {
  const k = await obterPacote(ctx, p.id, versaoDaUrl(req));
  return { conteudo: JSON.stringify(k.conteudo, null, 2), tipo: 'application/json; charset=utf-8', nome: `${k.nome}.json` };
});
