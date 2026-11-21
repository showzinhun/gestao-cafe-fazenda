'use client';
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { num, un } from './comum';
import { paraApi } from '@/lib/formatos';

export type LoteDisponivel = {
  id: string; codigo: string; etapa: string; tipo: string | null; peneira: string | null; fazenda: string; unidade: string; saldo: string; livre: string;
  locais: { id: string; codigo: string; quantidade: string }[];
};
export type Escolha = { loteId: string; quantidade: string; localId?: string };

/** Lotes que podem entrar na etapa (transição configurada e saldo livre), com quantidade e local (RN-25). */
export function SeletorLotes({ lotes, inicial = [], aoMudar }: { lotes: LoteDisponivel[]; inicial?: string[]; aoMudar: (e: Escolha[]) => void }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Record<string, Escolha>>(() =>
    Object.fromEntries(lotes.filter((l) => inicial.includes(l.id)).map((l) => [l.id, { loteId: l.id, quantidade: l.livre.replace('.', ','), localId: l.locais.length > 1 ? undefined : l.locais[0]?.id }])),
  );
  const atualizar = (n: Record<string, Escolha>) => {
    setSel(n);
    aoMudar(Object.values(n));
  };
  const visiveis = useMemo(() => lotes.filter((l) => !busca || `${l.codigo} ${l.tipo ?? ''} ${l.fazenda}`.toLowerCase().includes(busca.toLowerCase())), [lotes, busca]);
  const total = Object.values(sel).reduce((s, e) => {
    try {
      return s.plus(paraApi(e.quantidade) || 0);
    } catch {
      return s;
    }
  }, new Decimal(0));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Entrada aria-label="Filtrar lotes" placeholder="Filtrar por código, tipo ou fazenda…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <span className="text-[13px] text-tinta-2">{Object.keys(sel).length} lote(s) · total <b className="font-mono text-tinta">{num(total.toString())}</b></span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-linha">
        <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="w-10 px-3 py-2.5" /><th className="px-3 py-2.5">Lote</th><th className="px-3 py-2.5">De</th><th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5 text-right">Livre</th><th className="px-3 py-2.5">Quantidade</th><th className="px-3 py-2.5">Local</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length ? visiveis.map((l) => {
              const e = sel[l.id];
              return (
                <tr key={l.id} className="border-t border-linha">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Usar ${l.codigo}`}
                      checked={!!e}
                      onChange={(ev) => {
                        const n = { ...sel };
                        if (ev.target.checked) n[l.id] = { loteId: l.id, quantidade: l.livre.replace('.', ','), localId: l.locais.length === 1 ? l.locais[0]!.id : undefined };
                        else delete n[l.id];
                        atualizar(n);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{l.codigo}</td>
                  <td className="px-3 py-2">{l.etapa} · {l.fazenda}</td>
                  <td className="px-3 py-2">{[l.tipo, l.peneira ? `P${l.peneira}` : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{num(l.livre)} {un(l.unidade)}</td>
                  <td className="px-3 py-2">
                    <Entrada aria-label={`Quantidade de ${l.codigo}`} inputMode="decimal" disabled={!e} value={e?.quantidade ?? ''} className="h-8 w-28" onChange={(ev) => atualizar({ ...sel, [l.id]: { ...e!, quantidade: ev.target.value } })} />
                  </td>
                  <td className="px-3 py-2">
                    {l.locais.length > 1 ? (
                      <Selecao aria-label={`Local de ${l.codigo}`} disabled={!e} value={e?.localId ?? ''} className="h-8" onChange={(ev) => atualizar({ ...sel, [l.id]: { ...e!, localId: ev.target.value || undefined } })}>
                        <option value="">Escolha…</option>
                        {l.locais.map((x) => <option key={x.id} value={x.id}>{x.codigo} ({num(x.quantidade)})</option>)}
                      </Selecao>
                    ) : (l.locais[0]?.codigo ?? '—')}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-tinta-2">Nenhum lote com saldo pode entrar nesta etapa. Confira as transições do fluxo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
