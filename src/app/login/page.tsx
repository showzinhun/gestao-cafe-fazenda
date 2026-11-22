import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Logo } from '@/componentes/marca';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Entrar' };

export default async function PaginaLogin() {
  const s = await auth();
  if (s?.usuarioId) redirect('/empresa');
  return (
    <main className="grid min-h-dvh place-items-center bg-menu p-4">
      <div className="grid w-full max-w-sm gap-4 rounded-2xl bg-superficie p-7 shadow-2xl">
        <div className="grid size-11 place-items-center rounded-xl bg-menu">
          <Logo />
        </div>
        <div>
          <p className="rotulo-secao text-ouro-texto">Gestão do Café · Fazenda</p>
          <h1 className="mt-1 font-display text-[22px] font-semibold">Entrar no sistema</h1>
          <p className="mt-1 text-tinta-2">Use o e-mail e a senha cadastrados pelo administrador da sua empresa.</p>
        </div>
        <FormularioLogin />
      </div>
    </main>
  );
}
