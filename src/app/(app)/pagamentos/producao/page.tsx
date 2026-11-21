import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { relatorioProducao } from '@/servicos/pagamentos';
import { listarOpcoes } from '@/servicos/cadastros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { formatarMoeda } from '@/lib/formatacao';
import { num } from '@/lib/formatos';

export const metadata: Metadata = { title: 'Relatório de produção' };

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const AGRUPAR = { colhedor: 'Colhedor', turma: 'Turma', talhao: 'Talhão' } as const;

/** Produção por colhedor, turma e talhão; custo da colheita por saca, aproximado pela composição (§6.3). */
export default async function PaginaProducao({ searchParams }: { searchParams: Promise<{ inicio?: string; fim?: string; fazenda?: string; agrupar?: string }> }) {
  const ctx = await exigirContexto();
  const p = await searchParams;
  const inicio = p.inicio || hoje().slice(0, 8) + '01';
  const fim = p.fim || hoje();
  const agrupar = (p.agrupar && p.agrupar in AGRUPAR ? p.agrupar : 'colhedor') as keyof typeof AGRUPAR;
  const [r, opcoes] = await Promise.all([relatorioProducao(ctx, { inicio, fim, fazendaId: p.fazenda || undefined, agrupar }), listarOpcoes(ctx, ['fazendas'])]);
  return (
    <>
      <TituloPagina grupo="Pagamentos" titulo="Relatório de produção">
        <Link href="/pagamentos" className={estiloBotao({ variante: 'secundario' })}>Fechamentos</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <form className="sombra grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3 rounded-xl border border-linha bg-superficie p-4">
          <Campo rotulo="Início"><Entrada type="date" name="inicio" defaultValue={inicio} /></Campo>
          <Campo rotulo="Fim"><Entrada type="date" name="fim" defaultValue={fim} /></Campo>
          <Campo rotulo="Fazenda"><Selecao name="fazenda" defaultValue={p.fazenda ?? ''}><option value="">Todas</option>{(opcoes.fazendas ?? []).map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</Selecao></Campo>
          <Campo rotulo="Agrupar por"><Selecao name="agrupar" defaultValue={agrupar}>{Object.entries(AGRUPAR).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Selecao></Campo>
          <Botao type="submit">Ver</Botao>
        </form>
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">{AGRUPAR[agrupar]}</th><th className="px-3 py-3 text-right">Medidas</th><th className="px-3 py-3 text-right">Valor</th><th className="px-3 py-3 text-right">Dias</th><th className="px-3 py-3 text-right">Apontamentos</th></tr></thead>
            <tbody>
              {r.linhas.map((l) => (
                <tr key={l.chave} className="border-t border-linha"><td className="px-3 py-2.5"><b>{l.chave}</b></td><td className="px-3 py-2.5 text-right font-mono">{num(l.medidas)}</td><td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(l.valor)}</td><td className="px-3 py-2.5 text-right font-mono">{l.dias}</td><td className="px-3 py-2.5 text-right font-mono">{l.apontamentos}</td></tr>
              ))}
              {!r.linhas.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-tinta-2">Sem apontamentos no período.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {agrupar === 'talhao' && r.custoPorSaca.length ? (
          <section className="grid gap-2">
            <h2 className="font-display text-[19px] font-semibold">Custo da colheita por saca</h2>
            <p className="text-[13px] text-tinta-2">Custo dos apontamentos do talhão ÷ sacas no estoque cuja composição inclui o talhão (aproximado pela composição, §6.3).</p>
            <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
              <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Talhão</th><th className="px-3 py-3 text-right">Custo</th><th className="px-3 py-3 text-right">Sacas no estoque</th><th className="px-3 py-3 text-right">Por saca</th></tr></thead>
                <tbody>
                  {r.custoPorSaca.map((c) => (
                    <tr key={c.talhao} className="border-t border-linha"><td className="px-3 py-2.5">{c.talhao}</td><td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(c.custo)}</td><td className="px-3 py-2.5 text-right font-mono">{num(c.sacas, 2)}</td><td className="px-3 py-2.5 text-right font-mono">{c.porSaca ? formatarMoeda(c.porSaca) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
