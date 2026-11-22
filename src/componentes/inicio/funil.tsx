import Link from 'next/link';
import Decimal from 'decimal.js';
import { num } from '@/lib/formatos';

type Etapa = { id: string; nome: string; classe: string; unidade: string; saldo: string; abertos: number };

/**
 * Funil de saldo por etapa (§12, item 2). Uma série (saldo), uma cor; medidas e kg em grupos separados,
 * cada um com a sua escala (nunca dois eixos). Cada barra traz o rótulo e o valor em texto; a lista é navegável.
 */
export function Funil({ etapas }: { etapas: Etapa[] }) {
  const grupos = [
    { unidade: 'MEDIDA', titulo: 'Café em medidas (colheita até a tulha)', sufixo: 'med.' },
    { unidade: 'KG', titulo: 'Café em kg (estoque, serviço e saída)', sufixo: 'kg' },
  ].map((g) => ({ ...g, etapas: etapas.filter((e) => e.unidade === g.unidade) })).filter((g) => g.etapas.length);
  return (
    <div className="grid gap-5">
      {grupos.map((g) => {
        const max = Decimal.max(...g.etapas.map((e) => new Decimal(e.saldo)), 0);
        return (
          <figure key={g.unidade} className="grid gap-2">
            <figcaption className="text-[12.5px] font-semibold text-tinta-2">{g.titulo}</figcaption>
            <ul className="grid gap-1.5">
              {g.etapas.map((e) => {
                const v = new Decimal(e.saldo);
                const pct = max.gt(0) ? v.div(max).times(100).toNumber() : 0;
                return (
                  <li key={e.id}>
                    <Link href={`/etapas/${e.id}`} className="group grid grid-cols-[minmax(96px,170px)_1fr_minmax(5.5rem,auto)] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-superficie-2" title={`${e.nome}: ${num(e.saldo)} ${g.sufixo} em saldo, ${e.abertos} movimento(s) aberto(s)`}>
                      <span className="min-w-0 text-[13px]">
                        <span className="block truncate">{e.nome}</span>
                        {e.abertos ? <span className="block text-[11.5px] text-tinta-2">{e.abertos} aberto{e.abertos > 1 ? 's' : ''}</span> : null}
                      </span>
                      <span className="relative h-3 rounded-r-[4px] bg-superficie-2" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-destaque transition-[width] group-hover:opacity-85" style={{ width: `${v.gt(0) ? Math.max(pct, 1.5) : 0}%` }} />
                      </span>
                      <span className="text-right font-mono text-[12.5px]">
                        {num(e.saldo)} {g.sufixo}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </figure>
        );
      })}
    </div>
  );
}
