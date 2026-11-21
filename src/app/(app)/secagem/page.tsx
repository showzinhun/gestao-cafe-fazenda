import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { exigirContexto } from '@/lib/contexto';
import { painelSecagem } from '@/servicos/secagem';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Indicador } from '@/componentes/ui/cartao';
import { cn } from '@/lib/cn';
import { num, pct } from '@/lib/formatos';
import { formatarNumero } from '@/lib/formatacao';

export const metadata: Metadata = { title: 'Painel de secagem' };
export const dynamic = 'force-dynamic';

const COR = {
  LIVRE: { rotulo: 'Livre', cartao: 'border-linha bg-superficie', faixa: 'bg-linha' },
  SECANDO: { rotulo: 'Em secagem', cartao: 'border-destaque/40 bg-destaque-suave/40', faixa: 'bg-destaque' },
  NO_PONTO: { rotulo: 'No ponto', cartao: 'border-ok bg-ok-fundo', faixa: 'bg-ok' },
  ATENCAO: { rotulo: 'Atenção', cartao: 'border-aviso bg-aviso-fundo', faixa: 'bg-aviso' },
} as const;

const SETA = { caindo: ArrowDownRight, subindo: ArrowUpRight, estavel: ArrowRight } as const;
const horasAtras = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? 'há menos de 1 h' : h < 48 ? `há ${Math.floor(h)} h` : `há ${Math.floor(h / 24)} dias`;
};

/** Painel de secagem (§7): um cartão por local das etapas que monitoram secagem. */
export default async function PaginaSecagem() {
  const ctx = await exigirContexto();
  const { cartoes, resumo, limites } = await painelSecagem(ctx);
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Painel de secagem" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <Indicador valor={resumo.SECANDO} rotulo="em secagem" />
          <Indicador valor={resumo.NO_PONTO} rotulo="no ponto" cor="ok" />
          <Indicador valor={resumo.ATENCAO} rotulo="pedem atenção" cor="ouro" />
          <Indicador valor={resumo.LIVRE} rotulo="locais livres" cor="destaque" />
        </div>
        <ul className="flex flex-wrap gap-3 text-[12.5px] text-tinta-2" aria-label="Legenda">
          {Object.entries(COR).map(([k, c]) => <li key={k} className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm', c.faixa)} aria-hidden />{c.rotulo}</li>)}
          <li>· Atenção: mais de {limites.limiteDias} dias secando, sem leitura há mais de {limites.limiteHoras} h ou abaixo da meta.</li>
        </ul>
        {cartoes.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {cartoes.map((c) => {
              const cor = COR[c.situacao];
              return (
                <article key={c.localId ?? c.movimentos[0]?.id} className={cn('sombra grid content-start gap-3 rounded-xl border-2 p-4', cor.cartao)} aria-label={`${c.local}: ${cor.rotulo}`}>
                  <header className="flex items-start justify-between gap-2">
                    <span className="grid">
                      <b className="font-display text-[17px]">{c.local}</b>
                      <span className="text-[12px] text-tinta-2">{c.etapa}</span>
                    </span>
                    <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', c.situacao === 'LIVRE' ? 'bg-linha text-tinta-2' : c.situacao === 'NO_PONTO' ? 'bg-ok text-white' : c.situacao === 'ATENCAO' ? 'bg-aviso text-white' : 'bg-destaque text-destaque-tinta')}>{cor.rotulo}</span>
                  </header>
                  {c.ocupacao != null ? (
                    <div className="grid gap-1">
                      <div className="h-2 overflow-hidden rounded-full bg-linha" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Number(c.ocupacao) * 100)} aria-label="Ocupação">
                        <div className={cn('h-full', Number(c.ocupacao) > 1 ? 'bg-erro' : cor.faixa)} style={{ width: `${Math.min(100, Number(c.ocupacao) * 100)}%` }} />
                      </div>
                      <span className="text-[12px] text-tinta-2">Ocupação {pct(c.ocupacao)} de {num(c.capacidade)} medidas</span>
                    </div>
                  ) : null}
                  {c.movimentos.length ? c.movimentos.map((m) => {
                    const Seta = m.tendencia ? SETA[m.tendencia as keyof typeof SETA] : null;
                    return (
                      <Link key={m.id} href={`/movimentos/${m.id}?aba=leituras`} className="grid gap-1 rounded-lg bg-superficie/80 p-2.5 text-[13px] hover:ring-2 hover:ring-destaque">
                        <span className="flex items-center justify-between gap-2"><b className="font-mono">{m.rotulo}</b><span className="font-mono">{num(m.volume)} {m.unidade === 'KG' ? 'kg' : 'med.'}</span></span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tinta-2">
                          <span>{m.dias} dia(s)</span>
                          {m.ultimaUmidade ? (
                            <span className="flex items-center gap-1 text-tinta">
                              umidade <b className="font-mono text-[15px]">{formatarNumero(m.ultimaUmidade, 1)}%</b>{Seta ? <Seta className="size-4" aria-label={m.tendencia ?? ''} /> : null}
                            </span>
                          ) : <span>sem leitura</span>}
                          {m.ultimaLeitura ? <span>{horasAtras(m.ultimaLeitura)}</span> : null}
                        </span>
                        {m.metaMin ? <span className="text-[12px] text-tinta-2">Meta {formatarNumero(m.metaMin, 1)}–{formatarNumero(m.metaMax!, 1)}%{m.previsaoHoras != null && m.situacao !== 'NO_PONTO' ? ` · ponto estimado em ~${formatarNumero(String(m.previsaoHoras), 1)} h` : ''}</span> : null}
                        {m.motivos.length ? <span className="text-[12px] font-medium text-aviso">{m.motivos.join(' · ')}</span> : null}
                      </Link>
                    );
                  }) : <p className="text-[13px] text-tinta-2">Livre.</p>}
                </article>
              );
            })}
          </div>
        ) : <p className="text-tinta-2">Nenhum local nas etapas que monitoram secagem. Ative “monitora secagem” no Fluxo de etapas e cadastre os locais.</p>}
      </div>
    </>
  );
}
