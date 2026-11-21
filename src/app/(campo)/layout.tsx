import Link from 'next/link';
import { Droplets, Home, Sprout } from 'lucide-react';
import { IndicadorSync } from '@/componentes/campo/indicador-sync';
import { exigirContexto } from '@/lib/contexto';
import { listarEmpresasDoUsuario } from '@/servicos/acesso';
import { Logo } from '@/componentes/marca';

/** Layout do app de campo (PWA, celular): barra no topo e navegação embaixo, botões grandes. */
export default async function LayoutCampo({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto();
  const empresa = (await listarEmpresasDoUsuario(ctx.usuarioId)).find((e) => e.empresaId === ctx.empresaId);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-fundo">
      <header className="sticky top-0 z-30 flex items-center gap-2.5 bg-menu px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 text-menu-tinta">
        <div className="grid size-9 place-items-center rounded-[9px] bg-menu-ouro/10">
          <Logo tamanho={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="rotulo-secao truncate text-menu-ouro">{empresa?.nome}</p>
          <p className="font-display text-[16px] font-semibold">Campo</p>
        </div>
        <IndicadorSync empresaId={ctx.empresaId} />
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <nav aria-label="Campo" className="sticky bottom-0 grid grid-cols-3 border-t border-linha bg-superficie pb-[env(safe-area-inset-bottom)]">
        {[
          { href: '/campo', rotulo: 'Início', icone: Home },
          { href: '/campo/apontar', rotulo: 'Apontar', icone: Sprout },
          { href: '/campo', rotulo: 'Secagem', icone: Droplets },
        ].map((i) => (
          <Link key={i.rotulo} href={i.href} className="flex flex-col items-center gap-1 py-2.5 text-[12px] font-medium text-tinta-2">
            <i.icone className="size-5" />
            {i.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}
