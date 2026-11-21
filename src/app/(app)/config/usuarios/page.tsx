import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listarUsuarios, obterMatriz } from '@/servicos/usuarios';
import { listarOpcoes } from '@/servicos/cadastros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { GestaoUsuarios } from '@/componentes/usuarios/gestao-usuarios';
import { Aviso } from '@/componentes/ui/aviso';

export const metadata: Metadata = { title: 'Usuários e acessos' };

export default async function PaginaUsuarios() {
  const ctx = await exigirContexto();
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('usuarios.gerenciar');
  return (
    <>
      <TituloPagina grupo="Configuração" titulo="Usuários e acessos" />
      <div className="px-4 pt-6 lg:px-6">
        {pode ? <Conteudo /> : <Aviso tipo="aviso">Seu perfil não pode gerenciar usuários. Fale com o administrador da empresa.</Aviso>}
      </div>
    </>
  );

  async function Conteudo() {
    const [usuarios, opcoes, matriz] = await Promise.all([listarUsuarios(ctx), listarOpcoes(ctx, ['fazendas']), obterMatriz(ctx)]);
    return <GestaoUsuarios usuarios={usuarios} fazendas={opcoes.fazendas} matriz={matriz} euId={ctx.usuarioId} />;
  }
}
