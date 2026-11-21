import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { listarMovimentos, lotesParaEntrada } from '@/servicos/consultas';
import { listarOpcoes } from '@/servicos/cadastros';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { NovoMovimento } from '@/componentes/operacao/novo-movimento';

export const metadata: Metadata = { title: 'Novo movimento' };

export default async function PaginaNovoMovimento({ params, searchParams }: { params: Promise<{ etapaId: string }>; searchParams: Promise<{ lotes?: string }> }) {
  const ctx = await exigirContexto();
  const { etapaId } = await params;
  const { lotes: pre } = await searchParams;
  let etapa;
  try {
    etapa = (await listarMovimentos(ctx, etapaId, { status: 'ABERTO' })).etapa;
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound();
    throw e;
  }
  const [lotes, opcoes] = await Promise.all([lotesParaEntrada(ctx, etapaId), listarOpcoes(ctx, ['locais'])]);
  return (
    <>
      <TituloPagina grupo={etapa.nome} titulo="Novo movimento" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <NovoMovimento etapa={etapa} lotes={lotes} locais={(opcoes.locais ?? []).filter((l) => l.grupo === etapaId)} inicial={pre ? pre.split(',') : []} />
      </div>
    </>
  );
}
