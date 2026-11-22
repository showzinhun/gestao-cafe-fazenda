import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ehSuperadmin, listarEmpresasPlataforma, PLANOS } from '@/servicos/plataforma';
import { MODELOS_FLUXO } from '@/dominio/modelos-fluxo';
import { Logo } from '@/componentes/marca';
import { TelaPlataforma } from '@/componentes/plataforma/tela';
import { sair } from '../empresa/acoes';

export const metadata: Metadata = { title: 'Plataforma' };
export const dynamic = 'force-dynamic';

/** Plataforma (§12, item 15): empresas, planos e suspensão. Só SUPERADMIN; os outros recebem 404. */
export default async function PaginaPlataforma() {
  const s = await auth();
  if (!s?.usuarioId) redirect('/login');
  if (!(await ehSuperadmin(s.usuarioId))) notFound();
  const empresas = await listarEmpresasPlataforma(s.usuarioId);
  return (
    <div className="min-h-dvh bg-fundo">
      <header className="flex flex-wrap items-center gap-3 bg-menu px-4 py-3 text-menu-tinta lg:px-6">
        <div className="grid size-10 place-items-center rounded-[10px] border border-menu-ouro/25 bg-menu-ouro/10"><Logo /></div>
        <div>
          <p className="rotulo-secao text-menu-ouro">Administração</p>
          <p className="font-display text-[17px] font-semibold">Plataforma</p>
        </div>
        <span className="ml-auto text-[13px] text-menu-sub">{s.user?.name}</span>
        <Link href="/empresa" className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-semibold">Empresas</Link>
        <form action={sair}><button type="submit" className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-semibold">Sair</button></form>
      </header>
      <main className="grid gap-4 px-4 py-6 lg:px-6">
        <h1 className="font-display text-[26px] font-semibold">Empresas</h1>
        <p className="max-w-3xl text-[13px] text-tinta-2">A plataforma vê só os dados cadastrais e de acesso das empresas. Lotes, movimentos, colhedores e contratos ficam fora daqui. Suspender corta o acesso de todos os usuários da empresa na hora; nada é apagado.</p>
        <TelaPlataforma empresas={JSON.parse(JSON.stringify(empresas))} modelos={MODELOS_FLUXO.map((m) => ({ valor: m.codigo, rotulo: m.nome }))} planos={[...PLANOS]} />
      </main>
    </div>
  );
}
