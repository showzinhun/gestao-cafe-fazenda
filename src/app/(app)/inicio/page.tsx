import type { Metadata } from 'next';
import { exigirContexto } from '@/lib/contexto';
import { resumoEmpresa } from '@/servicos/acesso';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Cartao, Indicador } from '@/componentes/ui/cartao';
import { Selo } from '@/componentes/ui/selo';

export const metadata: Metadata = { title: 'Início' };

const ROTEIRO = [
  ['0', 'Esqueleto, multiempresa e autenticação', 'ok'],
  ['1', 'Cadastros e fluxo configurável', 'proxima'],
  ['2', 'Núcleo de rastreabilidade', ''],
  ['3', 'Telas operacionais e estoque', ''],
  ['4', 'Colhedores, apontamento offline e pagamento', ''],
  ['5', 'Painel de secagem', ''],
  ['6', 'Comercial e embarque', ''],
  ['7', 'Certificações, EUDR, dossiê e pacote', ''],
  ['8', 'Início, conformidade e plataforma', ''],
] as const;

export default async function Inicio() {
  const ctx = await exigirContexto();
  const r = await resumoEmpresa(ctx);
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Início" />
      <div className="grid gap-5 px-4 pt-6 lg:px-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Indicador valor={r.fazendas} rotulo="fazendas ativas" />
          <Indicador valor={r.usuarios} rotulo="usuários com acesso" cor="ouro" />
          <Indicador valor={r.plano} rotulo="plano" cor="ok" />
        </div>
        <Cartao>
          <h2 className="font-display text-[19px] font-semibold">Roteiro da plataforma</h2>
          <p className="mt-1 text-tinta-2">Os módulos aparecem no menu à medida que cada fase é entregue.</p>
          <ol className="mt-4 grid gap-2">
            {ROTEIRO.map(([fase, nome, st]) => (
              <li key={fase} className="flex items-center gap-3 rounded-lg border border-linha bg-superficie-2 px-3 py-2">
                <span className="w-7 font-mono text-tinta-2">F{fase}</span>
                <span className="flex-1">{nome}</span>
                {st === 'ok' ? <Selo>Entregue</Selo> : st === 'proxima' ? <Selo tipo="aviso">Próxima</Selo> : <Selo tipo="neutro">Planejada</Selo>}
              </li>
            ))}
          </ol>
        </Cartao>
      </div>
    </>
  );
}
