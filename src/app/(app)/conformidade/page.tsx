import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { painelConformidade } from '@/servicos/conformidade';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { TelaConformidade } from '@/componentes/conformidade/tela';

export const metadata: Metadata = { title: 'Conformidade' };
export const dynamic = 'force-dynamic';

/** Conformidade (§12, item 13): certificados vencendo, talhões sem geometria/checagem e dossiês pendentes. */
export default async function PaginaConformidade() {
  const ctx = await exigirContexto();
  const painel = await painelConformidade(ctx);
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('cadastros.editar');
  return (
    <>
      <TituloPagina grupo="Comercial" titulo="Conformidade" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <TelaConformidade painel={JSON.parse(JSON.stringify(painel))} podeEditar={pode} hoje={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())} />
      </div>
    </>
  );
}
