import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { buscar } from '@/servicos/consultas';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Botao } from '@/componentes/ui/botao';
import { Entrada } from '@/componentes/ui/campo';
import { SeloSituacao } from '@/componentes/operacao/comum';
import { num, un } from '@/lib/formatos';

export const metadata: Metadata = { title: 'Rastreabilidade' };

/** Busca por lote, nº de movimento ou talhão (§12 item 12). Embarque, nota e contrato chegam com o comercial. */
export default async function PaginaRastreabilidade({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await exigirContexto();
  const { q = '' } = await searchParams;
  const r = q.trim() ? await buscar(ctx, q) : null;
  return (
    <>
      <TituloPagina grupo="Consulta" titulo="Rastreabilidade" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <form className="flex max-w-xl gap-2" action="/rastreabilidade">
          <Entrada name="q" defaultValue={q} aria-label="Buscar lote, movimento ou talhão" placeholder="Código do lote, TE#12 ou talhão (T1)…" />
          <Botao type="submit">Buscar</Botao>
        </form>
        {r ? (
          r.lotes.length || r.movimentos.length ? (
            <div className="sombra grid rounded-xl border border-linha bg-superficie">
              {r.movimentos.map((m) => (
                <Link key={m.id} href={`/movimentos/${m.id}`} className="flex items-center gap-3 border-b border-linha px-4 py-3 hover:bg-superficie-2">
                  <b>{m.rotulo}</b> <SeloSituacao status={m.status} />
                </Link>
              ))}
              {r.lotes.map((l) => (
                <Link key={l.id} href={`/rastreabilidade/lote/${l.id}`} className="flex flex-wrap items-center gap-3 border-b border-linha px-4 py-3 last:border-b-0 hover:bg-superficie-2">
                  <b className="font-mono">{l.codigo}</b>
                  <span className="text-[13px] text-tinta-2">{l.etapa} · {num(l.quantidade)} {un(l.unidade)}</span>
                  <span className="ml-auto"><SeloSituacao status={l.status} lote /></span>
                </Link>
              ))}
            </div>
          ) : <p className="text-tinta-2">Nada encontrado para “{q}”.</p>
        ) : <p className="text-tinta-2">Digite o código de um lote para ver de onde ele veio (até os talhões) e para onde foi.</p>}
      </div>
    </>
  );
}
