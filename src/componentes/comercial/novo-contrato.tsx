'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acaoCriarContrato } from '@/app/(app)/comercial/acoes';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { paraApi } from '@/lib/formatos';

type Opcao = { valor: string; rotulo: string };

/** Contrato novo (§4.7): nasce rascunho; assinar é um passo à parte. */
export function NovoContrato({ clientes, opcoes }: { clientes: Opcao[]; opcoes: Record<string, Opcao[]> }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<'FIXO' | 'A_FIXAR'>('FIXO');
  const [certs, setCerts] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = (k: string) => String(f.get(k) ?? '').trim();
      iniciar(async () => {
        const r = await acaoCriarContrato({
          clienteId: v('clienteId'), safraId: v('safraId'), quantidadeSacas: paraApi(v('sacas')), toleranciaPerc: v('tolerancia') ? paraApi(String(Number(paraApi(v('tolerancia'))) / 100)) : '0',
          descricaoPadrao: v('descricao'), peneiraMinId: v('peneiraMinId'), moeda: v('moeda') as 'BRL', tipoPreco: tipo, precoPorSaca: tipo === 'FIXO' ? paraApi(v('preco')) : null,
          diferencial: tipo === 'A_FIXAR' && v('diferencial') ? paraApi(v('diferencial')) : null, referenciaBolsa: v('bolsa'), prazoEmbarqueInicio: v('inicio'), prazoEmbarqueFim: v('fim'),
          incoterm: v('incoterm'), destinoPais: v('destino'), exigeEudr: f.get('eudr') === 'on', observacao: v('obs'), certificadoIds: certs,
        });
        if (!r.ok) return setErro(r.erro);
        router.push(`/contratos/${r.dados}`);
      });
    }}>
      <section className="sombra grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 rounded-xl border border-linha bg-superficie p-5">
        <Campo rotulo="Cliente *" className="sm:col-span-2"><Selecao name="clienteId" required>{clientes.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Safra"><Selecao name="safraId"><option value="">—</option>{(opcoes.safras ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Sacas (60 kg) *"><Entrada name="sacas" inputMode="decimal" required /></Campo>
        <Campo rotulo="Tolerância (%)"><Entrada name="tolerancia" inputMode="decimal" placeholder="0" /></Campo>
        <Campo rotulo="Peneira mínima"><Selecao name="peneiraMinId"><option value="">Qualquer</option>{(opcoes.peneiras ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Padrão (tipo, peneira, bebida)" className="sm:col-span-2"><Entrada name="descricao" /></Campo>
      </section>
      <section className="sombra grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 rounded-xl border border-linha bg-superficie p-5">
        <Campo rotulo="Preço"><Selecao value={tipo} onChange={(e) => setTipo(e.target.value as 'FIXO')}><option value="FIXO">Fixo</option><option value="A_FIXAR">A fixar</option></Selecao></Campo>
        <Campo rotulo="Moeda"><Selecao name="moeda"><option value="BRL">R$</option><option value="USD">US$</option></Selecao></Campo>
        {tipo === 'FIXO' ? <Campo rotulo="Preço por saca *"><Entrada name="preco" inputMode="decimal" required /></Campo> : (
          <>
            <Campo rotulo="Diferencial"><Entrada name="diferencial" inputMode="decimal" /></Campo>
            <Campo rotulo="Referência na bolsa"><Entrada name="bolsa" placeholder="KC Mar/27" /></Campo>
          </>
        )}
      </section>
      <section className="sombra grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 rounded-xl border border-linha bg-superficie p-5">
        <Campo rotulo="Embarque a partir de"><Entrada type="date" name="inicio" /></Campo>
        <Campo rotulo="Embarque até"><Entrada type="date" name="fim" /></Campo>
        <Campo rotulo="Incoterm"><Entrada name="incoterm" placeholder="FOB" /></Campo>
        <Campo rotulo="País de destino"><Entrada name="destino" /></Campo>
        <div className="grid gap-2 sm:col-span-2">
          <b className="text-[13px]">Certificados exigidos (RN-17)</b>
          <div className="flex flex-wrap gap-2">
            {(opcoes.certificados ?? []).map((c) => (
              <label key={c.valor} className="flex items-center gap-1.5 rounded-lg border border-linha px-2.5 py-1.5 text-[13px]">
                <input type="checkbox" checked={certs.includes(c.valor)} onChange={(e) => setCerts(e.target.checked ? [...certs, c.valor] : certs.filter((x) => x !== c.valor))} /> {c.rotulo}
              </label>
            ))}
            <label className="flex items-center gap-1.5 rounded-lg border border-linha px-2.5 py-1.5 text-[13px]"><input type="checkbox" name="eudr" /> Exige EUDR</label>
          </div>
        </div>
        <Campo rotulo="Observação" className="sm:col-span-2"><Entrada name="obs" /></Campo>
      </section>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      <div className="flex gap-2"><Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Criar contrato'}</Botao><Link href="/contratos" className={estiloBotao({ variante: 'secundario' })}>Cancelar</Link></div>
    </form>
  );
}
