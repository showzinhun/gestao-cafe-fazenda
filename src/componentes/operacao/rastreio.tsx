'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Geometry } from 'geojson';
import { ProtecaoMapa } from '@/componentes/mapa/protecao-mapa';
import type { NoRastreio } from '@/servicos/consultas';
import { SeloSituacao, num, un } from './comum';

const MapaTalhoes = dynamic(() => import('@/componentes/mapa/mapa-talhoes').then((m) => m.MapaTalhoes), { ssr: false, loading: () => <div className="h-[380px] rounded-xl border border-linha bg-superficie-2" /> });

/** Árvore para cima (origens até a colheita) ou para baixo (destinos), em lista aninhada. */
export function ArvoreRastreio({ raiz, direcao }: { raiz: NoRastreio; direcao: 'cima' | 'baixo' }) {
  return (
    <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie p-4">
      <ul className="grid gap-1.5" role="tree" aria-label={direcao === 'cima' ? 'Origens do lote' : 'Destinos do lote'}>
        <No no={raiz} direcao={direcao} nivel={0} />
      </ul>
    </div>
  );
}

function No({ no, direcao, nivel }: { no: NoRastreio; direcao: 'cima' | 'baixo'; nivel: number }) {
  const folha = no.lote.id.startsWith('mov-');
  return (
    <li role="treeitem" aria-expanded={no.filhos.length ? true : undefined} aria-selected={nivel === 0} className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-linha px-3 py-2 text-[13.5px]" style={{ marginLeft: nivel * 18 }}>
        {nivel ? <span className="text-tinta-2" aria-hidden>{direcao === 'cima' ? '↑' : '↓'}</span> : null}
        {folha ? (
          <Link href={`/movimentos/${no.movimento!.id}`} className="font-semibold text-destaque hover:underline">{no.lote.codigo}</Link>
        ) : (
          <Link href={`/rastreabilidade/lote/${no.lote.id}?direcao=${direcao}`} className="font-mono font-semibold text-destaque hover:underline">{no.lote.codigo}</Link>
        )}
        <span className="text-tinta-2">{no.lote.etapa}</span>
        {no.quantidadeLigacao ? <span className="font-mono text-[12.5px]">{direcao === 'cima' ? 'usou' : 'foi'} {num(no.quantidadeLigacao)} {un(no.lote.unidade)}</span> : <span className="font-mono text-[12.5px]">{num(no.lote.quantidade)} {un(no.lote.unidade)}</span>}
        {no.talhao ? <span className="rounded bg-ouro/15 px-1.5 py-0.5 text-[12px] font-medium">talhão {no.talhao.codigo} · {no.talhao.fazenda}</span> : null}
        {!folha && no.movimento ? <Link href={`/movimentos/${no.movimento.id}`} className="text-[12px] text-tinta-2 hover:underline">{no.movimento.etapa} #{no.movimento.numero}</Link> : null}
        <span className="ml-auto"><SeloSituacao status={no.lote.status} lote={!folha} /></span>
      </div>
      {no.filhos.length ? (
        <ul role="group" className="grid gap-1.5">
          {no.filhos.map((f, i) => <No key={`${f.lote.id}-${i}`} no={f} direcao={direcao} nivel={nivel + 1} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function MapaOrigem({ origens }: { origens: { id: string; codigo: string; geometria: unknown; geometriaTipo: string | null }[] }) {
  const comGeo = origens.filter((o) => o.geometria);
  if (!comGeo.length) return <p className="rounded-xl border border-linha bg-superficie-2 p-6 text-center text-[13.5px] text-tinta-2">Os talhões de origem não têm geometria cadastrada.</p>;
  return (
    <ProtecaoMapa>
      <MapaTalhoes talhoes={comGeo.map((o) => ({ id: o.id, codigo: o.codigo, geometria: o.geometria as Geometry, geometriaTipo: o.geometriaTipo as 'POLIGONO' }))} />
    </ProtecaoMapa>
  );
}
