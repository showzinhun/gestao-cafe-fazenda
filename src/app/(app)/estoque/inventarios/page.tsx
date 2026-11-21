import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { listarInventarios } from '@/servicos/estoque';
import { listarOpcoes } from '@/servicos/cadastros';
import { resumoEtapas } from '@/servicos/consultas';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { SeloSituacao } from '@/componentes/operacao/comum';
import { dataHora } from '@/lib/formatos';
import { NovoInventario } from '@/componentes/operacao/inventario';

export const metadata: Metadata = { title: 'Inventários' };

export default async function PaginaInventarios() {
  const ctx = await exigirContexto();
  const [lista, opcoes, etapas] = await Promise.all([listarInventarios(ctx), listarOpcoes(ctx, ['locais']), resumoEtapas(ctx)]);
  const estoques = new Set(etapas.filter((e) => e.classe === 'ESTOQUE').map((e) => e.id));
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('movimento.lancar');
  return (
    <>
      <TituloPagina grupo="Estoque" titulo="Inventários">
        <Link href="/estoque" className={estiloBotao({ variante: 'secundario' })}>Voltar ao estoque</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <p className="text-tinta-2">A contagem não altera o estoque. Só a aprovação, por quem tem a permissão, lança os ajustes de cada lote e local (RN-29).</p>
        {pode ? <NovoInventario locais={(opcoes.locais ?? []).filter((l) => estoques.has(l.grupo ?? ''))} /> : null}
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-3">Nº</th><th className="px-3 py-3">Aberto em</th><th className="px-3 py-3">Locais</th><th className="px-3 py-3 text-right">Itens</th><th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.length ? lista.map((i) => (
                <tr key={i.id} className="border-t border-linha">
                  <td className="px-3 py-2.5 font-mono"><Link className="font-semibold text-destaque hover:underline" href={`/estoque/inventarios/${i.id}`}>{i.numero}</Link></td>
                  <td className="px-3 py-2.5">{dataHora(i.dataContagem)}</td>
                  <td className="px-3 py-2.5">{i.locaisCodigos.join(', ')}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{i._count.itens}</td>
                  <td className="px-3 py-2.5"><SeloSituacao status={i.status} /></td>
                </tr>
              )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-tinta-2">Nenhum inventário ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
