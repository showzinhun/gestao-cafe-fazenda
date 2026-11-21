import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { rastrearLote } from '@/servicos/consultas';
import { obterLote } from '@/servicos/lotes';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { Indicador } from '@/componentes/ui/cartao';
import { ArvoreRastreio, MapaOrigem } from '@/componentes/operacao/rastreio';
import { SeloSituacao } from '@/componentes/operacao/comum';
import { num, pct, un } from '@/lib/formatos';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Rastreabilidade do lote' };

export default async function PaginaRastreioLote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ direcao?: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const direcao = (await searchParams).direcao === 'baixo' ? 'baixo' : 'cima';
  let r, lote;
  try {
    [r, lote] = await Promise.all([rastrearLote(ctx, id, direcao), obterLote(ctx, id)]);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound();
    throw e;
  }
  return (
    <>
      <TituloPagina grupo="Rastreabilidade" titulo={lote.codigo}>
        <Link href={`/movimentos/${lote.movimento.id}`} className={estiloBotao({ variante: 'secundario' })}>Movimento de origem</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-tinta-2">
          <SeloSituacao status={lote.status} lote />
          {lote.etapa.nome} · safra {lote.safra.codigo} · {lote.fazenda ? `fazenda ${lote.fazenda.codigo}` : 'várias fazendas (MIX)'}
          {lote.tipoCafe ? ` · ${lote.tipoCafe.codigo}` : ''}{lote.peneira ? ` · P${lote.peneira.codigo}` : ''}
          · {lote.certificados.length ? lote.certificados.map((c) => c.certificado.codigo).join(', ') : 'convencional'}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Indicador valor={`${num(lote.quantidade.toString())} ${un(lote.unidade)}`} rotulo="quantidade gerada" />
          <Indicador valor={num(lote.saldo)} rotulo="saldo" cor="ok" />
          <Indicador valor={num(lote.quantidadeReservada.toString())} rotulo="reservado" cor="erro" />
          <Indicador valor={r.origens.length} rotulo="talhões de origem" cor="ouro" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="grid content-start gap-3">
            <nav aria-label="Direção" className="sombra inline-flex gap-1 justify-self-start rounded-[11px] border border-linha bg-superficie p-1">
              {(['cima', 'baixo'] as const).map((d) => (
                <Link key={d} href={`/rastreabilidade/lote/${id}?direcao=${d}`} aria-current={direcao === d ? 'page' : undefined} className={cn('rounded-lg px-3.5 py-2 text-sm font-medium', direcao === d ? 'bg-destaque-suave text-destaque' : 'text-tinta-2')}>
                  {d === 'cima' ? 'De onde veio ↑' : 'Para onde foi ↓'}
                </Link>
              ))}
            </nav>
            <ArvoreRastreio raiz={r.arvore} direcao={direcao} />
          </section>
          <section className="grid content-start gap-3">
            <h2 className="font-display text-[19px] font-semibold">Talhões de origem</h2>
            <MapaOrigem origens={JSON.parse(JSON.stringify(r.origens))} />
            <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
              <table className="w-full border-collapse text-[13.5px]">
                <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-2.5">Talhão</th><th className="px-3 py-2.5">Fazenda</th><th className="px-3 py-2.5 text-right">%</th><th className="px-3 py-2.5 text-right">Equivale</th></tr></thead>
                <tbody>
                  {r.origens.map((o) => (
                    <tr key={o.id} className="border-t border-linha">
                      <td className="px-3 py-2"><b className="font-mono">{o.codigo}</b> {o.nome}{!o.geometria ? <span className="text-[12px] text-aviso"> · sem geometria</span> : null}</td>
                      <td className="px-3 py-2">{o.fazenda}</td>
                      <td className="px-3 py-2 text-right font-mono">{pct(o.percentual, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{num(o.quantidade)} {un(lote.unidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
