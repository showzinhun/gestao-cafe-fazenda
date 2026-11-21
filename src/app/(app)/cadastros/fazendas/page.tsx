import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { listarFazendas } from '@/servicos/fazendas';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Selo } from '@/componentes/ui/selo';

export const metadata: Metadata = { title: 'Fazendas' };

export default async function Fazendas() {
  const ctx = await exigirContexto();
  const lista = await listarFazendas(ctx);
  return (
    <>
      <TituloPagina grupo="Configuração" titulo="Fazendas" />
      <div className="grid gap-4 px-4 pt-6 lg:px-6">
        <p className="text-tinta-2">Cadastro mínimo da Fase 0. Talhões, produtor, CAR e certificados chegam na Fase 1.</p>
        <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Fazenda</th>
                <th className="px-3 py-3">Município / UF</th>
                <th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.length ? (
                lista.map((f) => (
                  <tr key={f.id} className="border-t border-linha hover:bg-superficie-2">
                    <td className="px-3 py-3 font-mono font-medium">
                      <Link href={`/cadastros/fazendas/${f.id}`} className="text-destaque hover:underline">
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{f.nome}</td>
                    <td className="px-3 py-3">{[f.municipio, f.uf].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-3">{f.ativo ? <Selo>Ativa</Selo> : <Selo tipo="neutro">Inativa</Selo>}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-tinta-2">
                    Nenhuma fazenda cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
