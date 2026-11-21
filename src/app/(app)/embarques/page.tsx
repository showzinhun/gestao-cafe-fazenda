import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { listarEmbarques } from '@/servicos/embarques';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Selo } from '@/componentes/ui/selo';
import { num } from '@/lib/formatos';

export const metadata: Metadata = { title: 'Embarques' };
export const dynamic = 'force-dynamic';
const ETAPA: Record<string, 'ok' | 'aviso' | 'erro' | 'neutro'> = { Criado: 'neutro', Programado: 'aviso', Carregado: 'aviso', Finalizado: 'ok', Estornado: 'erro' };

/** Embarques (§9.4): nascem do contrato e passam por programação → carregamento → finalização. */
export default async function PaginaEmbarques() {
  const ctx = await exigirContexto();
  const lista = await listarEmbarques(ctx);
  return (
    <>
      <TituloPagina grupo="Comercial" titulo="Embarques" />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <p className="text-[13px] text-tinta-2">Para criar um embarque, abra o contrato e use <b>Novo embarque</b>.</p>
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-3">Embarque</th><th className="px-3 py-3">Contrato</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3 text-right">kg</th><th className="px-3 py-3">Placa</th><th className="px-3 py-3">Data</th><th className="px-3 py-3">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="border-t border-linha">
                  <td className="px-3 py-2.5"><Link href={`/embarques/${e.id}`} className="font-mono font-semibold text-destaque hover:underline">{e.rotulo}</Link></td>
                  <td className="px-3 py-2.5 font-mono">{e.contrato}</td><td className="px-3 py-2.5">{e.cliente}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(e.kg)}</td><td className="px-3 py-2.5 font-mono">{e.placa ?? '—'}</td>
                  <td className="px-3 py-2.5">{e.dataEmbarque ? e.dataEmbarque.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-3 py-2.5"><Selo tipo={ETAPA[e.etapa] ?? 'neutro'}>{e.etapa}</Selo></td>
                </tr>
              ))}
              {!lista.length ? <tr><td colSpan={7} className="px-3 py-8 text-center text-tinta-2">Nenhum embarque.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
