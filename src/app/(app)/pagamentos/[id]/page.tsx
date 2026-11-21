import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { obterFechamento } from '@/servicos/pagamentos';
import { podeRevelar } from '@/servicos/colhedores';
import { ErroNaoEncontrado, ErroPermissao } from '@/dominio/erros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { DetalheFechamento } from '@/componentes/pagamentos/fechamento';

export const metadata: Metadata = { title: 'Fechamento' };

export default async function PaginaFechamento({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  let f;
  try {
    f = await obterFechamento(ctx, id);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado || e instanceof ErroPermissao) notFound();
    throw e;
  }
  return (
    <>
      <TituloPagina grupo="Pagamentos" titulo={`Fechamento nº ${f.numero}`} />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <DetalheFechamento f={JSON.parse(JSON.stringify(f))} admin={ctx.perfil === 'ADMIN_EMPRESA'} podePix={podeRevelar(ctx)} />
      </div>
    </>
  );
}
