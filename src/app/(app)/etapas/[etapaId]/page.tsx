import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { exigirContexto } from '@/lib/contexto';
import { listarMovimentos } from '@/servicos/consultas';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { SeloSituacao } from '@/componentes/operacao/comum';
import { dataHora, num, pct } from '@/lib/formatos';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Movimentos da etapa' };

const ABAS = [
  { id: 'ABERTO', rotulo: 'Abertos' },
  { id: 'PROCESSADO', rotulo: 'Processados' },
  { id: 'ESTORNADO', rotulo: 'Estornados' },
  { id: 'todos', rotulo: 'Todos' },
];

export default async function PaginaEtapa({ params, searchParams }: { params: Promise<{ etapaId: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await exigirContexto();
  const { etapaId } = await params;
  const { status = 'ABERTO', q } = await searchParams;
  let dados;
  try {
    dados = await listarMovimentos(ctx, etapaId, { status: status === 'todos' ? undefined : status, busca: q });
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound();
    throw e;
  }
  const { etapa, movimentos } = dados;
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('movimento.lancar');
  const estoque = etapa.classe === 'ESTOQUE';
  return (
    <>
      <TituloPagina grupo="Etapas" titulo={`${etapa.nome} · ${etapa.prefixo}`}>
        <Link href="/etapas" className={estiloBotao({ variante: 'secundario' })}>Voltar</Link>
        {pode ? <Link href={`/etapas/${etapa.id}/novo`} className={estiloBotao()}><Plus className="size-4" /> Novo movimento</Link> : null}
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <nav aria-label="Situação" className="sombra inline-flex flex-wrap gap-1 justify-self-start rounded-[11px] border border-linha bg-superficie p-1">
          {ABAS.map((a) => (
            <Link key={a.id} href={`/etapas/${etapa.id}?status=${a.id}`} aria-current={status === a.id ? 'page' : undefined} className={cn('rounded-lg px-3.5 py-2 text-sm font-medium', status === a.id ? 'bg-destaque-suave text-destaque' : 'text-tinta-2 hover:text-tinta')}>
              {a.rotulo}
            </Link>
          ))}
        </nav>
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-3">Nº</th><th className="px-3 py-3">Entrada</th><th className="px-3 py-3">Fazenda</th><th className="px-3 py-3">Local</th>
                <th className="px-3 py-3 text-right">Entrada</th><th className="px-3 py-3 text-right">Saída</th><th className="px-3 py-3 text-right">{estoque ? 'Rendimento' : 'Quebra'}</th>
                <th className="px-3 py-3">Lotes gerados</th><th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length ? movimentos.map((m) => (
                <tr key={m.id} className="border-t border-linha align-top">
                  <td className="px-3 py-2.5 font-mono"><Link href={`/movimentos/${m.id}`} className="font-semibold text-destaque hover:underline">{etapa.prefixo}#{m.numero}</Link>{m.natureza !== 'NORMAL' ? <div className="text-[11px] text-ouro">ajuste de inventário</div> : null}</td>
                  <td className="px-3 py-2.5">{dataHora(m.dataEntrada)}</td>
                  <td className="px-3 py-2.5">{m.fazenda}</td>
                  <td className="px-3 py-2.5">{m.local ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(m.entrada)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(m.saida)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{m.rendimento ? `${num(m.rendimento)} kg/med.` : pct(m.quebra, 2)}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">{m.lotes.join(', ') || '—'}</td>
                  <td className="px-3 py-2.5"><SeloSituacao status={m.status} /></td>
                </tr>
              )) : (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-tinta-2">Nenhum movimento {status === 'todos' ? '' : ABAS.find((a) => a.id === status)?.rotulo.toLowerCase()} nesta etapa.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
