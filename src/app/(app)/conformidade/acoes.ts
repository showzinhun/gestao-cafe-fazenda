'use server';
import { revalidatePath } from 'next/cache';
import { contextoDaSessao } from '@/lib/contexto';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { arquivoDoForm, camposDoForm } from '@/lib/formulario-arquivo';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { adicionarCertificadoFazenda, alterarStatusCertificadoFazenda, checarTalhao, importarChecagem } from '@/servicos/conformidade';

/** Ações de conformidade (Fase 7): finas, só chamam os serviços (regra 2). */

async function ctx() {
  const c = await contextoDaSessao();
  if (!c) throw new ErroNaoEncontrado('Sessão expirada. Entre de novo.');
  return c;
}
async function executar<T>(mensagem: string, fn: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    const dados = await fn();
    for (const p of ['/conformidade', '/cadastros/fazendas', '/estoque', '/embarques']) revalidatePath(p, 'layout');
    return { ok: true, mensagem, dados };
  } catch (e) {
    return falha(e);
  }
}

export const acaoChecarTalhao = async (talhaoId: string) =>
  executar('Checagem registrada.', async () => (await checarTalhao(await ctx(), talhaoId)).resultado);

export const acaoImportarChecagem = async (talhaoId: string, f: FormData) =>
  executar('Resultado importado.', async () => void (await importarChecagem(await ctx(), talhaoId, camposDoForm(f) as never, await arquivoDoForm(f))));

export const acaoCertificadoFazenda = async (fazendaId: string, f: FormData) =>
  executar('Certificado cadastrado.', async () => void (await adicionarCertificadoFazenda(await ctx(), fazendaId, camposDoForm(f) as never, await arquivoDoForm(f))));

export const acaoStatusCertificado = async (id: string, status: 'VALIDO' | 'SUSPENSO', motivo?: string) =>
  executar(status === 'SUSPENSO' ? 'Certificado suspenso.' : 'Certificado reativado.', async () => void (await alterarStatusCertificadoFazenda(await ctx(), id, status, motivo)));
