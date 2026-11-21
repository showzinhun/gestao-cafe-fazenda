'use server';
import { redirect } from 'next/navigation';
import { signOut, unstable_update } from '@/auth';

export async function sair() {
  await signOut({ redirectTo: '/login' });
}

export async function trocarEmpresa() {
  await unstable_update({ empresaId: null } as never);
  redirect('/empresa');
}
