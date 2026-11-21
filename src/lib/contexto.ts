import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { permissoesEfetivas, vinculoAtivo } from '@/servicos/acesso';
import type { Contexto } from '@/servicos/transacao';
import { ErroNaoEncontrado } from '@/dominio/erros';

/**
 * Contexto da requisição a partir da sessão. O vínculo com a empresa é conferido
 * a cada requisição: usuário inativado ou empresa suspensa perdem o acesso na hora.
 */
export async function contextoDaSessao(): Promise<Contexto | null> {
  const s = await auth();
  if (!s?.usuarioId || !s.empresaId) return null;
  try {
    const v = await vinculoAtivo(s.usuarioId, s.empresaId);
    const h = await headers();
    const base = { empresaId: v.empresaId, usuarioId: s.usuarioId, perfil: v.perfil };
    return { ...base, permissoes: await permissoesEfetivas(base), ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null };
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) return null;
    throw e;
  }
}

/** Para páginas: sem sessão → /login; sem empresa ativa válida → /empresa. */
export async function exigirContexto(): Promise<Contexto> {
  const s = await auth();
  if (!s?.usuarioId) redirect('/login');
  const ctx = await contextoDaSessao();
  if (!ctx) redirect('/empresa');
  return ctx;
}
