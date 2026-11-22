import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listarEmpresasDoUsuario } from '@/servicos/acesso';
import { ehSuperadmin } from '@/servicos/plataforma';
import Link from 'next/link';
import { NOME_PERFIL } from '@/dominio/perfis';
import { Logo } from '@/componentes/marca';
import { escolherEmpresa, sair } from './acoes';

export const metadata: Metadata = { title: 'Escolher empresa' };

export default async function PaginaEmpresa() {
  const s = await auth();
  if (!s?.usuarioId) redirect('/login');
  const [empresas, superadmin] = await Promise.all([listarEmpresasDoUsuario(s.usuarioId), ehSuperadmin(s.usuarioId)]);
  return (
    <main className="grid min-h-dvh place-items-center bg-menu p-4">
      <div className="grid w-full max-w-md gap-4 rounded-2xl bg-superficie p-7 shadow-2xl">
        <div className="grid size-11 place-items-center rounded-xl bg-menu">
          <Logo />
        </div>
        <div>
          <p className="rotulo-secao text-ouro-texto">Olá, {s.user?.name}</p>
          <h1 className="mt-1 font-display text-[22px] font-semibold">Escolha a empresa</h1>
          <p className="mt-1 text-tinta-2">Os dados de cada empresa ficam separados. Você pode trocar depois pelo menu.</p>
        </div>
        {empresas.length ? (
          <ul className="grid gap-2">
            {empresas.map((e) => (
              <li key={e.empresaId}>
                <form action={escolherEmpresa}>
                  <input type="hidden" name="empresaId" value={e.empresaId} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-xl border border-linha bg-superficie px-4 py-3 text-left transition hover:border-destaque hover:bg-destaque-suave"
                  >
                    <span className="font-semibold">{e.nome}</span>
                    <span className="text-[12.5px] text-tinta-2">{NOME_PERFIL[e.perfil]}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : superadmin ? null : (
          <p className="rounded-lg bg-aviso-fundo px-3 py-2 text-[13px] text-aviso">Seu usuário não tem acesso a nenhuma empresa ativa. Fale com o administrador.</p>
        )}
        {superadmin ? (
          <Link href="/plataforma" className="flex items-center justify-between rounded-xl border border-ouro/40 bg-ouro/10 px-4 py-3 font-semibold hover:border-ouro">
            Área da plataforma <span className="text-[12.5px] font-normal text-tinta-2">empresas, planos e suspensão</span>
          </Link>
        ) : null}
        <form action={sair}>
          <button type="submit" className="text-[13px] text-destaque underline-offset-2 hover:underline">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
