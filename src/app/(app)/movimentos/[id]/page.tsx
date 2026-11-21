import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { detalheMovimento, lotesParaEntrada } from '@/servicos/consultas';
import { listarOpcoes } from '@/servicos/cadastros';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { DetalheMovimento } from '@/componentes/operacao/detalhe-movimento';

export const metadata: Metadata = { title: 'Movimento' };

export default async function PaginaMovimento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ avisos?: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const { avisos } = await searchParams;
  let m;
  try {
    m = await detalheMovimento(ctx, id);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound();
    throw e;
  }
  const permissoes = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  const [disponiveis, opcoes] = await Promise.all([
    m.status === 'ABERTO' && m.etapa.classe !== 'COLHEITA' ? lotesParaEntrada(ctx, m.etapa.id) : Promise.resolve([]),
    listarOpcoes(ctx, ['peneiras', 'tiposCafe', 'locais', 'certificados']),
  ]);
  const titulo = m.etapa.classe === 'COLHEITA' ? `Carga nº ${m.numero}` : `${m.etapa.nome} ${m.etapa.prefixo}#${m.numero}`;
  return (
    <>
      <TituloPagina grupo={m.etapa.nome} titulo={titulo} />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <DetalheMovimento
          m={JSON.parse(JSON.stringify(m))}
          disponiveis={disponiveis}
          opcoes={{ ...opcoes, locais: (opcoes.locais ?? []).filter((l) => l.grupo === m.etapa.id) }}
          podeLancar={permissoes.includes('movimento.lancar')}
          podeEstornar={permissoes.includes('movimento.estornar')}
          avisos={avisos ? avisos.split(' | ') : []}
        />
      </div>
    </>
  );
}
