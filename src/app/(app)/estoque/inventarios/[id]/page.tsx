import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { obterInventario } from '@/servicos/estoque';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { DetalheInventario } from '@/componentes/operacao/inventario';

export const metadata: Metadata = { title: 'Inventário' };

export default async function PaginaInventario({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  let inv;
  try {
    inv = await obterInventario(ctx, id);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound();
    throw e;
  }
  const perm = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  return (
    <>
      <TituloPagina grupo="Estoque" titulo={`Inventário nº ${inv.numero}`} />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <DetalheInventario inv={JSON.parse(JSON.stringify(inv))} podeContar={perm.includes('movimento.lancar')} podeAprovar={perm.includes('inventario.aprovar')} />
      </div>
    </>
  );
}
