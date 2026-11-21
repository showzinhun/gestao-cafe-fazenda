import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { listarFechamentos } from '@/servicos/pagamentos';
import { listarOpcoes } from '@/servicos/cadastros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { SeloSituacao } from '@/componentes/operacao/comum';
import { NovoFechamento } from '@/componentes/pagamentos/fechamento';
import { formatarMoeda } from '@/lib/formatacao';
import { num } from '@/lib/formatos';

export const metadata: Metadata = { title: 'Pagamentos' };

const data = (iso: string) => iso.split('-').reverse().join('/');

export default async function PaginaPagamentos() {
  const ctx = await exigirContexto();
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('pagamento.fechar');
  const [lista, opcoes] = await Promise.all([pode ? listarFechamentos(ctx) : Promise.resolve([]), listarOpcoes(ctx, ['fazendas'])]);
  return (
    <>
      <TituloPagina grupo="Colheita" titulo="Pagamentos">
        <Link href="/pagamentos/producao" className={estiloBotao({ variante: 'secundario' })}>Relatório de produção</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        {!pode ? <p className="text-tinta-2">Seu perfil não fecha pagamentos. Fale com o financeiro.</p> : (
          <>
            <p className="text-tinta-2">O fechamento junta os apontamentos pendentes do período de uma fazenda. Ao fechar, o preço por medida fica congelado em cada apontamento (RN-20).</p>
            <NovoFechamento fazendas={opcoes.fazendas ?? []} />
            <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
              <table className="w-full min-w-[700px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                    <th className="px-3 py-3">Nº</th><th className="px-3 py-3">Fazenda</th><th className="px-3 py-3">Período</th><th className="px-3 py-3 text-right">Colhedores</th>
                    <th className="px-3 py-3 text-right">Medidas</th><th className="px-3 py-3 text-right">Líquido</th><th className="px-3 py-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length ? lista.map((f) => (
                    <tr key={f.id} className="border-t border-linha">
                      <td className="px-3 py-2.5 font-mono"><Link className="font-semibold text-destaque hover:underline" href={`/pagamentos/${f.id}`}>{f.numero}</Link></td>
                      <td className="px-3 py-2.5">{f.fazenda}</td>
                      <td className="px-3 py-2.5">{data(f.periodoInicio)} a {data(f.periodoFim)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{f.colhedores}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{num(f.totalMedidas)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarMoeda(f.totalLiquido)}</td>
                      <td className="px-3 py-2.5"><SeloSituacao status={f.status} /></td>
                    </tr>
                  )) : <tr><td colSpan={7} className="px-3 py-8 text-center text-tinta-2">Nenhum fechamento ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
