import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { obterFluxo } from '@/servicos/fluxo';
import { listarOpcoes } from '@/servicos/cadastros';
import { MODELOS_FLUXO } from '@/dominio/modelos-fluxo';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { EditorFluxo } from '@/componentes/fluxo/editor-fluxo';

export const metadata: Metadata = { title: 'Fluxo de etapas' };

export default async function PaginaFluxo() {
  const ctx = await exigirContexto();
  const [fluxo, opcoes] = await Promise.all([obterFluxo(ctx), listarOpcoes(ctx, ['tiposCafe', 'fazendas'])]);
  const podeEditar = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('fluxo.configurar');
  return (
    <>
      <TituloPagina grupo="Configuração" titulo="Fluxo de etapas" />
      <div className="px-4 pt-6 lg:px-6">
        <EditorFluxo {...fluxo} tiposCafe={opcoes.tiposCafe} fazendas={opcoes.fazendas} modelos={MODELOS_FLUXO.map(({ codigo, nome, descricao }) => ({ codigo, nome, descricao }))} podeEditar={podeEditar} />
      </div>
    </>
  );
}
