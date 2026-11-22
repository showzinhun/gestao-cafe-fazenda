import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Navegação entre páginas da lista (?pagina=N), mantendo os outros filtros da URL. */
export function Paginacao({ base, params, pagina, temMais }: { base: string; params?: Record<string, string | undefined>; pagina: number; temMais: boolean }) {
  if (pagina <= 1 && !temMais) return null;
  const url = (p: number) => {
    const q = new URLSearchParams(Object.entries(params ?? {}).filter((e): e is [string, string] => !!e[1] && e[0] !== 'pagina'));
    if (p > 1) q.set('pagina', String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const estilo = 'inline-flex items-center gap-1 rounded-lg border border-linha bg-superficie px-3 py-1.5 text-[13px] font-medium hover:border-destaque';
  return (
    <nav aria-label="Páginas" className="flex items-center gap-2">
      {pagina > 1 ? <Link className={estilo} href={url(pagina - 1)} rel="prev"><ChevronLeft className="size-4" aria-hidden /> Anterior</Link> : null}
      <span className="text-[13px] text-tinta-2" aria-current="page">Página {pagina}</span>
      {temMais ? <Link className={estilo} href={url(pagina + 1)} rel="next">Próxima <ChevronRight className="size-4" aria-hidden /></Link> : null}
    </nav>
  );
}
