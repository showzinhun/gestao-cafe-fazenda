import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { ehRecurso, listar, listarOpcoes, type FonteOpcao } from '@/servicos/cadastros';
import { CADASTROS, type Registro } from '@/componentes/cadastros/config';
import { CadastroGenerico } from '@/componentes/cadastros/cadastro-generico';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { permissoesDoPerfil } from '@/dominio/permissoes';

const GENERICOS = ['parceiros', 'safras', 'tipos-cafe', 'peneiras', 'locais', 'turnos', 'motoristas', 'certificados', 'precos-colheita'];

export async function generateMetadata({ params }: { params: Promise<{ recurso: string }> }): Promise<Metadata> {
  const { recurso } = await params;
  return { title: CADASTROS[recurso]?.titulo ?? 'Cadastros' };
}

export default async function PaginaCadastro({ params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  if (!GENERICOS.includes(recurso) || !ehRecurso(recurso)) notFound();
  const ctx = await exigirContexto();
  const cfg = CADASTROS[recurso]!;
  const fontes = cfg.campos.map((c) => c.opcoes).filter((o): o is FonteOpcao => typeof o === 'string');
  const [registros, opcoes] = await Promise.all([listar(ctx, recurso, { incluirInativos: true }), listarOpcoes(ctx, fontes)]);
  const podeEditar = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('cadastros.editar');
  return (
    <>
      <TituloPagina grupo="Cadastros" titulo={cfg.titulo} />
      <div className="px-4 pt-6 lg:px-6">
        <CadastroGenerico recurso={recurso} registros={JSON.parse(JSON.stringify(registros)) as Registro[]} opcoes={opcoes} podeEditar={podeEditar} />
      </div>
    </>
  );
}
