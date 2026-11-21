import { download, versaoDaUrl } from '@/lib/rota';
import { gerarDossiePdf } from '@/lib/pdf-dossie';
import { obterDossie } from '@/servicos/dossie';
import { resumoEmpresa } from '@/servicos/acesso';

/** GET /api/embarques/{id}/dossie.pdf?versao= (§14). */
export const GET = download<{ id: string }>(async (ctx, req, p) => {
  const d = await obterDossie(ctx, p.id, versaoDaUrl(req));
  const empresa = await resumoEmpresa(ctx);
  return { conteudo: await gerarDossiePdf(empresa?.nome ?? '', d.conteudo, d.versao, d.congelado), tipo: 'application/pdf', nome: `dossie-${d.conteudo.embarque.codigo}-v${d.versao}.pdf`, inline: true };
});
