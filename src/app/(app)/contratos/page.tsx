import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { exigirContexto } from '@/lib/contexto';
import { listarContratos, painelComercial } from '@/servicos/contratos';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { Indicador } from '@/componentes/ui/cartao';
import { SeloContrato } from '@/componentes/comercial/selo';
import { num, preco } from '@/lib/formatos';
import { formatarNumero } from '@/lib/formatacao';
import { Paginacao } from '@/componentes/ui/paginacao';
import { cortar, numeroPagina } from '@/servicos/paginacao';

export const metadata: Metadata = { title: 'Contratos' };
export const dynamic = 'force-dynamic';
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

/** Painel comercial (§9.6) e lista de contratos. */
export default async function PaginaContratos({ searchParams }: { searchParams: Promise<{ status?: string; pagina?: string }> }) {
  const ctx = await exigirContexto();
  const { status, pagina } = await searchParams;
  const p = numeroPagina(pagina);
  const [lista, painel] = await Promise.all([listarContratos(ctx, { status, pagina: p }), painelComercial(ctx)]);
  const { itens: contratos, paginacao } = cortar(lista, p);
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('comercial.editar');
  return (
    <>
      <TituloPagina grupo="Comercial" titulo="Contratos">
        {pode ? <Link href="/contratos/novo" className={estiloBotao()}><Plus className="size-4" /> Novo contrato</Link> : null}
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Indicador valor={painel.porStatus.RASCUNHO ?? 0} rotulo="rascunhos" cor="destaque" />
          <Indicador valor={(painel.porStatus.ASSINADO ?? 0) + (painel.porStatus.EM_EXECUCAO ?? 0)} rotulo="em aberto" cor="ouro" />
          <Indicador valor={painel.porStatus.CONCLUIDO ?? 0} rotulo="concluídos" cor="ok" />
          <Indicador valor={formatarNumero(painel.aEmbarcar.reduce((s, c) => s + Number(c.saldo) / 60, 0).toFixed(2), 2)} rotulo="sacas a embarcar" cor="erro" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4">
            <h2 className="font-display text-[17px] font-semibold">Saldo a embarcar por prazo</h2>
            {painel.aEmbarcar.length ? (
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Contrato</th><th>Prazo</th><th className="text-right">Saldo (kg)</th><th className="text-right">Reservado</th></tr></thead>
                <tbody>
                  {painel.aEmbarcar.map((c) => (
                    <tr key={c.id} className="border-t border-linha">
                      <td className="py-1.5"><Link className="font-mono text-destaque hover:underline" href={`/contratos/${c.id}`}>{c.codigo}</Link> <span className="text-tinta-2">{c.cliente}</span></td>
                      <td className={c.dias !== null && c.dias <= painel.diasAlerta ? 'font-semibold text-aviso' : ''}>{data(c.prazoFim)}{c.dias !== null ? ` (${c.dias < 0 ? 'vencido' : `${c.dias} d`})` : ''}</td>
                      <td className="text-right font-mono">{num(c.saldo)}</td><td className="text-right font-mono">{num(c.reservado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-[13px] text-tinta-2">Nenhum contrato com saldo a embarcar.</p>}
          </section>
          <section className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4">
            <h2 className="font-display text-[17px] font-semibold">Estoque livre × reservado</h2>
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Certificação</th><th>Peneira</th><th className="text-right">Livre (kg)</th><th className="text-right">Reservado</th></tr></thead>
              <tbody>
                {painel.estoque.map((g) => (
                  <tr key={g.certificados + g.peneira} className="border-t border-linha"><td className="py-1.5">{g.certificados}</td><td>{g.peneira === '—' ? '—' : `P${g.peneira}`}</td><td className="text-right font-mono">{num(g.livre)}</td><td className="text-right font-mono">{num(g.reservado)}</td></tr>
                ))}
                {!painel.estoque.length ? <tr><td colSpan={4} className="py-3 text-tinta-2">Sem estoque.</td></tr> : null}
              </tbody>
            </table>
          </section>
        </div>
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-3">Contrato</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3 text-right">Sacas</th><th className="px-3 py-3">Preço</th><th className="px-3 py-3">Exige</th>
                <th className="px-3 py-3 text-right">Reservado</th><th className="px-3 py-3 text-right">Embarcado</th><th className="px-3 py-3">Prazo</th><th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} className="border-t border-linha">
                  <td className="px-3 py-2.5 font-mono"><Link className="font-semibold text-destaque hover:underline" href={`/contratos/${c.id}`}>{c.codigo}</Link></td>
                  <td className="px-3 py-2.5">{c.cliente}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(c.sacas)}</td>
                  <td className="px-3 py-2.5">{c.tipoPreco === 'FIXO' && c.precoPorSaca ? `${preco(c.precoPorSaca, c.moeda)}/sc` : 'a fixar'}</td>
                  <td className="px-3 py-2.5">{[...c.certificados, c.exigeEudr ? 'EUDR' : null].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(c.reservado)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(c.embarcado)}</td>
                  <td className="px-3 py-2.5">{data(c.prazoFim)}</td>
                  <td className="px-3 py-2.5"><SeloContrato status={c.status} /></td>
                </tr>
              ))}
              {!contratos.length ? <tr><td colSpan={9} className="px-3 py-8 text-center text-tinta-2">Nenhum contrato.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <Paginacao base="/contratos" params={{ status }} pagina={paginacao.pagina} temMais={paginacao.temMais} />
      </div>
    </>
  );
}
