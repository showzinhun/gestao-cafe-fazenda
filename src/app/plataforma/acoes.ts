'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { falha, type ResultadoAcao } from '@/lib/resultado-acao';
import { ErroPermissao } from '@/dominio/erros';
import { alterarPlano, alterarStatusEmpresa, criarEmpresaPlataforma } from '@/servicos/plataforma';

/** Ações da plataforma (SUPERADMIN): finas; o serviço confere o usuário (regra 2). */

async function usuario() {
  const s = await auth();
  if (!s?.usuarioId) throw new ErroPermissao('Sessão expirada. Entre de novo.');
  return s.usuarioId;
}
async function executar<T>(mensagem: string, fn: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    const dados = await fn();
    revalidatePath('/plataforma');
    return { ok: true, mensagem, dados };
  } catch (e) {
    return falha(e);
  }
}

export const acaoCriarEmpresa = async (d: Parameters<typeof criarEmpresaPlataforma>[1]) =>
  executar('Empresa criada. O administrador já pode entrar.', async () => criarEmpresaPlataforma(await usuario(), d));
export const acaoStatusEmpresa = async (id: string, status: 'ATIVA' | 'SUSPENSA', motivo?: string) =>
  executar(status === 'SUSPENSA' ? 'Empresa suspensa: os usuários perderam o acesso.' : 'Empresa reativada.', async () => alterarStatusEmpresa(await usuario(), id, status, motivo));
export const acaoPlano = async (id: string, plano: string) => executar('Plano alterado.', async () => alterarPlano(await usuario(), id, plano));
