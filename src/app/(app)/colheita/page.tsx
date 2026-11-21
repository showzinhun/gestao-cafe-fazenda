import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listarCargas } from '@/servicos/consultas';
import { listarOpcoes } from '@/servicos/cadastros';
import { listarApontamentos } from '@/servicos/apontamentos';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { TelaColheita } from '@/componentes/operacao/colheita';

export const metadata: Metadata = { title: 'Colheita' };

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export default async function PaginaColheita({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const ctx = await exigirContexto();
  const { data: param } = await searchParams;
  const data = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : hoje();
  const [cargas, opcoes, apontamentos] = await Promise.all([listarCargas(ctx, { data }), listarOpcoes(ctx, ['fazendas', 'talhoes', 'safras', 'tiposCafe']), listarApontamentos(ctx, { data })]);
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('movimento.lancar');
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Colheita" />
      <div className="grid gap-5 px-4 py-6 lg:px-6">
        <TelaColheita data={data} hoje={hoje()} cargas={JSON.parse(JSON.stringify(cargas))} opcoes={opcoes} apontamentos={apontamentos} podeLancar={pode} />
      </div>
    </>
  );
}
