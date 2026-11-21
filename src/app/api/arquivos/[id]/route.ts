import { download } from '@/lib/rota';
import { obterArquivo } from '@/servicos/conformidade';

/** GET /api/arquivos/{id}: evidência ou certificado em PDF (outra empresa → 404). */
export const GET = download<{ id: string }>(async (ctx, _req, p) => {
  const a = await obterArquivo(ctx, p.id);
  return { conteudo: Buffer.from(a.conteudo), tipo: 'application/pdf', nome: a.nome, inline: true };
});
