import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { listarColhedores, listarTurmas, podeRevelar } from '@/servicos/colhedores';
import { listarOpcoes } from '@/servicos/cadastros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { TelaColhedores } from '@/componentes/colheita/colhedores';

export const metadata: Metadata = { title: 'Colhedores e turmas' };

export default async function PaginaColhedores() {
  const ctx = await exigirContexto();
  const [colhedores, turmas, opcoes] = await Promise.all([listarColhedores(ctx, { incluirInativos: true }), listarTurmas(ctx, { incluirInativas: true }), listarOpcoes(ctx, ['fazendas'])]);
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('cadastros.editar');
  return (
    <>
      <TituloPagina grupo="Colheita" titulo="Colhedores e turmas">
        <Link href="/colheita" className={estiloBotao({ variante: 'secundario' })}>Cargas do dia</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <TelaColhedores colhedores={colhedores} turmas={turmas} fazendas={opcoes.fazendas ?? []} podeEditar={pode} podeRevelar={podeRevelar(ctx)} />
      </div>
    </>
  );
}
