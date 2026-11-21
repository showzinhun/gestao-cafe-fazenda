'use server';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export async function entrar(_: { erro?: string } | undefined, dados: FormData) {
  try {
    await signIn('credentials', { email: dados.get('email'), senha: dados.get('senha'), redirectTo: '/empresa' });
  } catch (e) {
    if (e instanceof AuthError) return { erro: 'E-mail ou senha inválidos.' };
    throw e;
  }
  return {};
}
