import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { listarAlertas } from '@/servicos/alertas';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { CentralAlertas } from '@/componentes/secagem/alertas';

export const metadata: Metadata = { title: 'Alertas' };
export const dynamic = 'force-dynamic';

export default async function PaginaAlertas() {
  const ctx = await exigirContexto();
  const alertas = await listarAlertas(ctx);
  return (
    <>
      <TituloPagina grupo="Consulta" titulo="Central de alertas" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <CentralAlertas alertas={alertas.map((a) => ({ id: a.id, tipo: a.tipo, entidade: a.entidade, entidadeId: a.entidadeId, mensagem: a.mensagem, severidade: a.severidade, criadoEm: a.criadoEm.toISOString(), lido: !!a.lidoEm }))} />
      </div>
    </>
  );
}
