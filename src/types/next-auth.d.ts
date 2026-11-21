import type { Perfil } from '@/dominio/perfis';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    usuarioId: string;
    empresaId: string | null;
    perfil: Perfil | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    usuarioId?: string;
    empresaId?: string | null;
    perfil?: Perfil | null;
  }
}
