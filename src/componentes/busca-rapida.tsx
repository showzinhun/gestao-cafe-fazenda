'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { acaoBuscar } from '@/app/(app)/operacao/acoes';

/**
 * Busca rápida da barra de título (§12): nº de movimento ("TE#12") abre direto;
 * código exato de lote abre a rastreabilidade; texto livre filtra o estoque.
 */
export function BuscaRapida() {
  const router = useRouter();
  const [termo, setTermo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      role="search"
      className="relative w-full sm:w-64"
      onSubmit={(e) => {
        e.preventDefault();
        const t = termo.trim();
        if (!t) return;
        iniciar(async () => {
          const r = await acaoBuscar(t);
          if (!r.ok) return setAviso(r.erro);
          if (!r.dados) return;
          const { lotes, movimentos } = r.dados;
          const exato = lotes.find((l) => l.codigo === t.toUpperCase());
          if (movimentos.length === 1) router.push(`/movimentos/${movimentos[0]!.id}`);
          else if (exato) router.push(`/rastreabilidade/lote/${exato.id}`);
          else router.push(`/rastreabilidade?q=${encodeURIComponent(t)}`);
          setAviso(null);
        });
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
      <input
        aria-label="Busca rápida"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Lote, TE#12 ou talhão…"
        disabled={pendente}
        className="h-9 w-full rounded-lg border border-linha bg-superficie pr-3 pl-9 text-[13.5px] outline-none focus:border-destaque"
      />
      {aviso ? <span role="alert" className="absolute top-full mt-1 text-[12px] text-erro">{aviso}</span> : null}
    </form>
  );
}
