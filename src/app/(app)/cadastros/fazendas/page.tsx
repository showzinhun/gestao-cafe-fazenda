import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listar, listarOpcoes } from '@/servicos/cadastros';
import { CadastroGenerico } from '@/componentes/cadastros/cadastro-generico';
import type { Registro } from '@/componentes/cadastros/config';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { permissoesDoPerfil } from '@/dominio/permissoes';

export const metadata: Metadata = { title: 'Fazendas' };

export default async function Fazendas() {
  const ctx = await exigirContexto();
  const [registros, opcoes] = await Promise.all([listar(ctx, 'fazendas', { incluirInativos: true }), listarOpcoes(ctx, ['produtores'])]);
  const podeEditar = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('cadastros.editar');
  return (
    <>
      <TituloPagina grupo="Cadastros" titulo="Fazendas" />
      <div className="px-4 pt-6 lg:px-6">
        <CadastroGenerico recurso="fazendas" registros={JSON.parse(JSON.stringify(registros)) as Registro[]} opcoes={opcoes} podeEditar={podeEditar} />
      </div>
    </>
  );
}
