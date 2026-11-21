import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vinculoAtivo } from '@/servicos/acesso';

const credenciais = z.object({ email: z.string().trim().toLowerCase().email(), senha: z.string().min(1) });

/**
 * Auth.js (credentials) com sessão JWT (§3.2). Ao entrar, a sessão ainda não tem empresa;
 * a escolha da empresa ativa grava empresaId e perfil no token depois de conferir o vínculo.
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: { label: 'E-mail' }, senha: { label: 'Senha', type: 'password' } },
      async authorize(bruto) {
        const ok = credenciais.safeParse(bruto);
        if (!ok.success) throw new CredentialsSignin();
        // usuario é global (sem empresa_id), por isso a leitura não depende de contexto.
        const u = await prisma.usuario.findUnique({ where: { email: ok.data.email } });
        if (!u || !u.ativo || !(await bcrypt.compare(ok.data.senha, u.senhaHash))) throw new CredentialsSignin();
        return { id: u.id, name: u.nome, email: u.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.usuarioId = user.id;
        token.empresaId = null;
        token.perfil = null;
      }
      if (trigger === 'update' && token.usuarioId) {
        const pedido = (session as { empresaId?: unknown } | undefined)?.empresaId;
        if (pedido === null) {
          token.empresaId = null;
          token.perfil = null;
        } else if (typeof pedido === 'string') {
          const v = await vinculoAtivo(token.usuarioId, pedido); // lança 404 se não houver vínculo
          token.empresaId = v.empresaId;
          token.perfil = v.perfil;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.usuarioId = token.usuarioId ?? '';
      session.empresaId = token.empresaId ?? null;
      session.perfil = token.perfil ?? null;
      return session;
    },
  },
});
