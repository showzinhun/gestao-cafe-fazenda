import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Bell, Info } from 'lucide-react';
import { exigirContexto } from '@/lib/contexto';
import { painelInicio } from '@/servicos/inicio';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Indicador } from '@/componentes/ui/cartao';
import { Funil } from '@/componentes/inicio/funil';
import { dataHora, num } from '@/lib/formatos';

export const metadata: Metadata = { title: 'Início' };
export const dynamic = 'force-dynamic';

const ICONE = { CRITICO: AlertTriangle, AVISO: Bell, INFO: Info } as const;
const COR = { CRITICO: 'text-erro', AVISO: 'text-aviso', INFO: 'text-tinta-2' } as const;
const NIVEL = { CRITICO: 'crítico', AVISO: 'aviso', INFO: 'informação' } as const;

/** Início (§12, item 2): alertas, cartões e funil de saldo por etapa. */
export default async function Inicio() {
  const ctx = await exigirContexto();
  const p = await painelInicio(ctx);
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Início" />
      <div className="grid gap-5 px-4 py-6 lg:px-6">
        <section aria-label="Resumo do dia" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Link href="/estoque" className="rounded-xl"><Indicador valor={num(p.estoque.livre)} rotulo={`kg livres no estoque (${num(p.estoque.sacas, 2)} sacas no total)`} cor="ok" /></Link>
          <Link href="/estoque?situacao=reservado" className="rounded-xl"><Indicador valor={num(p.estoque.reservado)} rotulo="kg reservados" cor="ouro" /></Link>
          <Link href="/secagem" className="rounded-xl"><Indicador valor={p.secagem.noPonto} rotulo={`secagem no ponto${p.secagem.atencao ? ` · ${p.secagem.atencao} pedem atenção` : ''}`} cor="destaque" /></Link>
          <Link href="/contratos" className="rounded-xl"><Indicador valor={p.contratos.aVencer} rotulo={`contratos com prazo em até ${p.contratos.diasAlerta} dias`} cor="erro" /></Link>
          <Link href="/colheita" className="rounded-xl"><Indicador valor={num(p.apontamentos.medidas)} rotulo={`medidas apontadas hoje · ${p.apontamentos.colhedores} colhedor(es)`} cor="destaque" /></Link>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <section className="sombra grid content-start gap-3 rounded-xl border border-linha bg-superficie p-4" aria-labelledby="titulo-funil">
            <h2 id="titulo-funil" className="font-display text-[17px] font-semibold">Saldo por etapa</h2>
            {p.funil.length ? <Funil etapas={p.funil} /> : <p className="text-[13px] text-tinta-2">Configure o fluxo de etapas.</p>}
          </section>

          <div className="grid content-start gap-5">
            <section className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4" aria-labelledby="titulo-alertas">
              <div className="flex items-center gap-2">
                <h2 id="titulo-alertas" className="font-display text-[17px] font-semibold">Alertas</h2>
                <span className="text-[12.5px] text-tinta-2">{p.naoLidos} não lido(s)</span>
                <Link href="/alertas" className="ml-auto text-[13px] text-destaque hover:underline">Ver todos</Link>
              </div>
              {p.alertas.length ? (
                <ul className="grid gap-1.5">
                  {p.alertas.map((a) => {
                    const Icone = ICONE[a.severidade];
                    return (
                      <li key={a.id} className="flex items-start gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-[13px]">
                        <Icone className={`mt-0.5 size-4 shrink-0 ${COR[a.severidade]}`} aria-hidden />
                        <span className="flex-1"><span className="sr-only">{NIVEL[a.severidade]}: </span>{a.mensagem}<span className="block text-[11.5px] text-tinta-2">{dataHora(a.criadoEm)}</span></span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-[13px] text-tinta-2">Nenhum alerta pendente.</p>}
            </section>

            <section className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4" aria-labelledby="titulo-contratos">
              <div className="flex items-center gap-2">
                <h2 id="titulo-contratos" className="font-display text-[17px] font-semibold">Contratos a vencer</h2>
                <Link href="/contratos" className="ml-auto text-[13px] text-destaque hover:underline">Contratos</Link>
              </div>
              {p.contratos.lista.length ? (
                <ul className="grid gap-1.5 text-[13px]">
                  {p.contratos.lista.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <Link href={`/contratos/${c.id}`} className="font-mono font-semibold text-destaque hover:underline">{c.codigo}</Link>
                      <span className="truncate text-tinta-2">{c.cliente}</span>
                      <span className={`ml-auto font-mono ${c.dias !== null && c.dias < 0 ? 'text-erro' : 'text-aviso'}`}>{c.dias !== null && c.dias < 0 ? 'vencido' : `${c.dias} d`} · {num(c.saldo)} kg</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-tinta-2">Nenhum contrato com prazo próximo.</p>}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
