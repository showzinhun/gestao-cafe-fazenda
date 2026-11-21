'use server';
import { redirect } from 'next/navigation';
import { auth, signOut, unstable_update } from '@/auth';
import { vinculoAtivo } from '@/servicos/acesso';

export async function escolherEmpresa(dados: FormData) {
  const s = await auth();
  if (!s?.usuarioId) redirect('/login');
  const v = await vinculoAtivo(s.usuarioId, String(dados.get('empresaId') ?? ''));
  await unstable_update({ empresaId: v.empresaId } as never);
  redirect('/inicio');
}

export async function sair() {
  await signOut({ redirectTo: '/login' });
}
