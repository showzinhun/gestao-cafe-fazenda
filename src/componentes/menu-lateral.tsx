'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, Boxes, ClipboardList, Droplets, FileCheck2, GitBranch, Home, Leaf, Map, Menu, Settings2, ShieldCheck, Ship, Smartphone, Sprout, Users, Wallet, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from './marca';

type Item = { href: string; rotulo: string; icone: React.ComponentType<{ className?: string }>; fase?: number; tambem?: string[] };

/** Menu agrupado (§12). Itens com "fase" ainda não existem e aparecem desativados. */
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Operação', itens: [
    { href: '/inicio', rotulo: 'Início', icone: Home },
    { href: '/colheita', rotulo: 'Colheita', icone: Sprout },
    { href: '/colheita/colhedores', rotulo: 'Colhedores', icone: Users },
    { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
    { href: '/etapas', rotulo: 'Etapas', icone: ClipboardList, tambem: ['/movimentos'] },
    { href: '/secagem', rotulo: 'Secagem', icone: Droplets },
    { href: '/estoque', rotulo: 'Estoque', icone: Boxes },
  ] },
  { titulo: 'Consulta', itens: [{ href: '/rastreabilidade', rotulo: 'Rastreabilidade', icone: GitBranch }, { href: '/alertas', rotulo: 'Alertas', icone: Bell }] },
  { titulo: 'Comercial', itens: [
    { href: '/contratos', rotulo: 'Contratos', icone: FileCheck2, fase: 6 },
    { href: '/embarques', rotulo: 'Embarques', icone: Ship, fase: 6 },
    { href: '/conformidade', rotulo: 'Conformidade', icone: ShieldCheck, fase: 7 },
  ] },
  { titulo: 'Configuração', itens: [
    { href: '/cadastros/fazendas', rotulo: 'Fazendas', icone: Map },
    { href: '/cadastros', rotulo: 'Cadastros', icone: Leaf },
    { href: '/config/fluxo', rotulo: 'Fluxo de etapas', icone: Settings2 },
    { href: '/config/usuarios', rotulo: 'Usuários e acessos', icone: Users },
    { href: '/campo', rotulo: 'App de campo', icone: Smartphone },
  ] },
];

export function MenuLateral({ empresa, usuario, perfil, alertas = 0, acaoSair, acaoTrocar }: { empresa: string; usuario: string; perfil: string; alertas?: number; acaoSair: () => Promise<void>; acaoTrocar: () => Promise<void> }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ini = usuario.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const ativo = (href: string) => {
    if (href === '/colheita') return caminho === '/colheita';
    if (GRUPOS.some((g) => g.itens.some((i) => i.href === href && i.tambem?.some((p) => caminho.startsWith(p))))) return true;
    if (href === '/cadastros') return caminho === '/cadastros' || (caminho.startsWith('/cadastros/') && !caminho.startsWith('/cadastros/fazendas'));
    return caminho === href || (href !== '/inicio' && caminho.startsWith(href + '/'));
  };
  return (
    <aside className={cn('z-40 bg-menu text-menu-tinta', 'max-lg:sticky max-lg:top-0', 'lg:fixed lg:inset-y-0 lg:left-0 lg:w-63 lg:overflow-y-auto')}>
      <div className="flex min-h-full flex-col gap-1 px-3 py-3 lg:py-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="grid size-10 place-items-center rounded-[10px] border border-menu-ouro/25 bg-menu-ouro/10">
            <Logo />
          </div>
          <div className="min-w-0">
            <p className="rotulo-secao truncate text-menu-ouro">{empresa}</p>
            <p className="font-display text-[17px] font-semibold">Gestão do Café</p>
          </div>
          <button
            type="button"
            className="ml-auto grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 lg:hidden"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            onClick={() => setAberto((a) => !a)}
          >
            {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <nav aria-label="Seções" className={cn('grid gap-0.5', !aberto && 'max-lg:hidden')}>
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="grid gap-0.5">
              <p className="rotulo-secao px-2.5 pt-4 pb-1.5 text-menu-sub/80">{g.titulo}</p>
              {g.itens.map((i) =>
                i.fase ? (
                  <span key={i.href} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-menu-sub/60" title={`Chega na Fase ${i.fase}`}>
                    <i.icone className="size-[18px]" />
                    {i.rotulo}
                    <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px]">F{i.fase}</span>
                  </span>
                ) : (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setAberto(false)}
                    aria-current={ativo(i.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium text-menu-sub transition hover:bg-white/5 hover:text-menu-tinta',
                      ativo(i.href) && 'bg-menu-ouro/15 text-white [&>svg]:text-menu-ouro',
                    )}
                  >
                    <i.icone className="size-[18px]" />
                    {i.rotulo}
                    {i.href === '/alertas' && alertas > 0 ? <span className="ml-auto rounded-full bg-menu-ouro px-1.5 py-0.5 font-mono text-[11px] font-bold text-menu" aria-label={`${alertas} não lidos`}>{alertas}</span> : null}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className={cn('mt-auto grid grid-cols-[36px_1fr] items-center gap-x-2.5 border-t border-white/10 px-2.5 pt-3', !aberto && 'max-lg:hidden')}>
          <span className="row-span-2 grid size-9 place-items-center rounded-full bg-menu-ouro/20 text-[13px] font-semibold text-menu-ouro">{ini}</span>
          <b className="truncate text-[13px]">{usuario}</b>
          <span className="text-[12px] text-menu-sub">{perfil}</span>
          <div className="col-span-2 mt-2 flex gap-2">
            <form action={acaoTrocar}>
              <button type="submit" className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-semibold">Trocar empresa</button>
            </form>
            <form action={acaoSair}>
              <button type="submit" className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-semibold">Sair</button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
