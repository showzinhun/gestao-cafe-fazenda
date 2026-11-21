import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { resumoEtapas } from '@/servicos/consultas';
import { NOME_CLASSE } from '@/dominio/fluxo';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { formatarNumero } from '@/lib/formatacao';

export const metadata: Metadata = { title: 'Etapas' };

/** Etapas operacionais (§12 item 8): processamento, estoque e serviço, na ordem do fluxo. */
export default async function PaginaEtapas() {
  const ctx = await exigirContexto();
  const etapas = (await resumoEtapas(ctx)).filter((e) => ['PROCESSAMENTO', 'ESTOQUE', 'SERVICO'].includes(e.classe));
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Etapas" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <p className="text-tinta-2">Cada etapa recebe lotes das anteriores (conforme o fluxo) e gera novos lotes. A colheita fica em <Link className="text-destaque hover:underline" href="/colheita">Colheita</Link>.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {etapas.map((e) => (
            <Link key={e.id} href={`/etapas/${e.id}`} className="sombra group grid gap-3 rounded-xl border border-linha bg-superficie p-4 hover:border-destaque">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-destaque font-mono text-[13px] font-bold text-destaque-tinta">{e.prefixo}</span>
                <span className="grid">
                  <b className="font-display text-[17px] group-hover:text-destaque">{e.nome}</b>
                  <span className="text-[12px] text-tinta-2">{NOME_CLASSE[e.classe as keyof typeof NOME_CLASSE]}</span>
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span><b className="font-mono">{e.abertos}</b> <span className="text-tinta-2">aberto(s)</span></span>
                <span><b className="font-mono">{formatarNumero(e.saldo)}</b> <span className="text-tinta-2">{e.unidade === 'KG' ? 'kg' : 'medidas'} parados</span></span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
