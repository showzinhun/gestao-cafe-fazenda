import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listarAlertas } from '@/servicos/alertas';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { CentralAlertas } from '@/componentes/secagem/alertas';
import { Paginacao } from '@/componentes/ui/paginacao';
import { cortar, numeroPagina } from '@/servicos/paginacao';

export const metadata: Metadata = { title: 'Alertas' };
export const dynamic = 'force-dynamic';

export default async function PaginaAlertas({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const ctx = await exigirContexto();
  const p = numeroPagina((await searchParams).pagina);
  const { itens: alertas, paginacao } = cortar(await listarAlertas(ctx, { pagina: p }), p);
  return (
    <>
      <TituloPagina grupo="Consulta" titulo="Central de alertas" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <CentralAlertas alertas={alertas.map((a) => ({ id: a.id, tipo: a.tipo, entidade: a.entidade, entidadeId: a.entidadeId, mensagem: a.mensagem, severidade: a.severidade, criadoEm: a.criadoEm.toISOString(), lido: !!a.lidoEm }))} />
        <Paginacao base="/alertas" pagina={paginacao.pagina} temMais={paginacao.temMais} />
      </div>
    </>
  );
}
