'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { acaoRemocao } from '@/app/(app)/operacao/acoes';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Indicador } from '@/componentes/ui/cartao';
import { Aviso } from '@/componentes/ui/aviso';
import { Documentos, num } from './comum';
import { paraApi } from '@/lib/formatos';
import { ReservarLotes, type ContratoAberto } from '@/componentes/comercial/reservar-lotes';
import { SeloEudr } from '@/componentes/conformidade/selos';

type Opcao = { valor: string; rotulo: string; grupo?: string };
type Linha = {
  id: string; codigo: string; etapa: string; etapaId: string; safra: string; fazenda: string; tipo: string | null; peneira: string | null; unidade: string; data: string;
  saldo: string; livre: string; reservado: string; reservas: string[]; certificados: string[]; locais: { id: string; codigo: string; quantidade: string }[]; eudr: string;
};
type Dados = { lotes: Linha[]; totais: { kg: { saldo: string; livre: string; reservado: string }; medidas: { saldo: string } } };

const FILTROS: { nome: string; rotulo: string; fonte: string; vazio: string }[] = [
  { nome: 'etapa', rotulo: 'Etapa', fonte: 'etapas', vazio: 'Todo o estoque' },
  { nome: 'safra', rotulo: 'Safra', fonte: 'safras', vazio: 'Todas' },
  { nome: 'fazenda', rotulo: 'Fazenda', fonte: 'fazendas', vazio: 'Todas' },
  { nome: 'peneira', rotulo: 'Peneira', fonte: 'peneiras', vazio: 'Todas' },
  { nome: 'certificado', rotulo: 'Certificado', fonte: 'certificados', vazio: 'Todos' },
  { nome: 'local', rotulo: 'Local', fonte: 'locais', vazio: 'Todos' },
];

/** Estoque (§12 item 10): lotes com saldo, filtros e seleção múltipla para o serviço. */
export function TelaEstoque({ dados, filtro, opcoes, servicos, podeLancar, contratos = [], podeReservar = false }: { dados: Dados; filtro: Record<string, string | undefined>; opcoes: Record<string, Opcao[]>; servicos: { id: string; nome: string }[]; podeLancar: boolean; contratos?: ContratoAberto[]; podeReservar?: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [reservando, setReservando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const aplicar = (f: FormData) => {
    const q = new URLSearchParams();
    for (const [k, v] of f.entries()) if (String(v)) q.set(k, String(v));
    router.push(`/estoque?${q.toString()}`);
  };
  const kgSel = dados.lotes.filter((l) => sel.includes(l.id) && l.unidade === 'KG').reduce((s, l) => s.plus(l.livre), new Decimal(0));
  return (
    <>
      <form
        className="sombra grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3 rounded-xl border border-linha bg-superficie p-4"
        onSubmit={(e) => { e.preventDefault(); aplicar(new FormData(e.currentTarget)); }}
      >
        {FILTROS.map((f) => (
          <Campo key={f.nome} rotulo={f.rotulo}>
            <Selecao name={f.nome} defaultValue={filtro[f.nome] ?? ''}>
              <option value="">{f.vazio}</option>
              {f.nome === 'fazenda' ? <option value="MIX">MIX (várias)</option> : null}
              {(opcoes[f.fonte] ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </Selecao>
          </Campo>
        ))}
        <Campo rotulo="Situação">
          <Selecao name="situacao" defaultValue={filtro.situacao ?? ''}><option value="">Todos</option><option value="livre">Com saldo livre</option><option value="reservado">Com reserva</option></Selecao>
        </Campo>
        <Campo rotulo="EUDR">
          <Selecao name="eudr" defaultValue={filtro.eudr ?? ''}><option value="">Todos</option><option value="apto">Só aptos à EUDR</option></Selecao>
        </Campo>
        <Campo rotulo="Código"><Entrada name="q" defaultValue={filtro.q ?? ''} placeholder="AR-NS…" /></Campo>
        <div className="flex gap-2">
          <Botao type="submit">Filtrar</Botao>
          <Botao type="button" variante="secundario" onClick={() => router.push('/estoque')}>Limpar</Botao>
        </div>
      </form>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Indicador valor={num(dados.totais.kg.saldo)} rotulo="kg em estoque" />
        <Indicador valor={num(new Decimal(dados.totais.kg.saldo).div(60).toDecimalPlaces(2).toString(), 2)} rotulo="sacas" cor="ouro" />
        <Indicador valor={num(dados.totais.kg.livre)} rotulo="kg livres" cor="ok" />
        <Indicador valor={num(dados.totais.kg.reservado)} rotulo="kg reservados" cor="erro" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] text-tinta-2">{sel.length ? <>{sel.length} lote(s) selecionado(s) · <b className="font-mono text-tinta">{num(kgSel.toString())}</b> kg livres</> : `${dados.lotes.length} lote(s)`}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {podeLancar ? servicos.map((s) => (
            <Botao key={s.id} disabled={!sel.length} onClick={() => router.push(`/etapas/${s.id}/novo?lotes=${sel.join(',')}`)}>Enviar para {s.nome}</Botao>
          )) : null}
          {podeReservar ? <Botao variante="secundario" disabled={!sel.length || !contratos.length} title={contratos.length ? undefined : 'Nenhum contrato assinado com saldo a reservar'} onClick={() => setReservando(true)}>Reservar para contrato</Botao> : null}
          <Link href="/embarques" className={estiloBotao({ variante: 'secundario' })}>Embarques</Link>
          <Documentos csv={{ nome: 'estoque.csv', linhas: [['Lote', 'Etapa', 'Safra', 'Fazenda', 'Tipo', 'Peneira', 'Saldo', 'Livre', 'Reservado', 'Unidade', 'Certificados', 'EUDR', 'Locais'], ...dados.lotes.map((l) => [l.codigo, l.etapa, l.safra, l.fazenda, l.tipo, l.peneira, l.saldo, l.livre, l.reservado, l.unidade, l.certificados.join(' '), l.eudr, l.locais.map((x) => `${x.codigo}:${x.quantidade}`).join(' ')])] }} />
        </div>
      </div>
      {reservando ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Reservar para contrato</h2>
          <ReservarLotes
            key={sel.join(',')}
            contratos={contratos}
            lotes={dados.lotes.filter((l) => sel.includes(l.id) && l.unidade === 'KG' && new Decimal(l.livre).gt(0)).map((l) => ({ id: l.id, codigo: l.codigo, livre: l.livre, peneira: l.peneira, certificados: l.certificados, etapa: l.etapa }))}
          />
          <Botao variante="secundario" className="justify-self-start" onClick={() => setReservando(false)}>Fechar</Botao>
        </section>
      ) : null}
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[1080px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="w-10 px-3 py-3">
                <input type="checkbox" aria-label="Selecionar todos" checked={!!dados.lotes.length && sel.length === dados.lotes.length} onChange={(e) => setSel(e.target.checked ? dados.lotes.map((l) => l.id) : [])} />
              </th>
              <th className="px-3 py-3">Lote</th><th className="px-3 py-3">Safra · fazenda</th><th className="px-3 py-3">Tipo / peneira</th><th className="px-3 py-3 text-right">Saldo</th>
              <th className="px-3 py-3 text-right">Livre</th><th className="px-3 py-3">Reservas</th><th className="px-3 py-3">Certificados</th><th className="px-3 py-3">EUDR</th><th className="px-3 py-3">Locais</th><th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {dados.lotes.length ? dados.lotes.map((l) => (
              <tr key={l.id} className="border-t border-linha align-top">
                <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Selecionar ${l.codigo}`} checked={sel.includes(l.id)} onChange={(e) => setSel(e.target.checked ? [...sel, l.id] : sel.filter((x) => x !== l.id))} /></td>
                <td className="px-3 py-2.5 font-mono"><Link className="text-destaque hover:underline" href={`/rastreabilidade/lote/${l.id}`}>{l.codigo}</Link></td>
                <td className="px-3 py-2.5">{l.safra} · {l.fazenda}</td>
                <td className="px-3 py-2.5">{[l.tipo, l.peneira ? `P${l.peneira}` : null].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{num(l.saldo)} {l.unidade === 'KG' ? 'kg' : 'med.'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{num(l.livre)}</td>
                <td className="px-3 py-2.5 text-[12.5px]">{l.reservas.join(', ') || '—'}</td>
                <td className="px-3 py-2.5">{l.certificados.join(', ') || <span className="text-tinta-2">convencional</span>}</td>
                <td className="px-3 py-2.5"><SeloEudr situacao={l.eudr} /></td>
                <td className="px-3 py-2.5 text-[12.5px]">
                  {removendo === l.id ? (
                    <FormRemocao lote={l} locais={(opcoes.locais ?? []).filter((x) => x.grupo === l.etapaId)} pendente={pendente} aoCancelar={() => setRemovendo(null)}
                      aoSalvar={(d) => iniciar(async () => {
                        const r = await acaoRemocao({ loteId: l.id, ...d });
                        setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro });
                        if (r.ok) { setRemovendo(null); router.refresh(); }
                      })} />
                  ) : l.locais.map((x) => `${x.codigo}: ${num(x.quantidade)}`).join(' · ') || '—'}
                </td>
                <td className="px-3 py-2.5 text-right">{podeLancar && l.locais.length && removendo !== l.id ? <Botao variante="secundario" tamanho="pequeno" onClick={() => setRemovendo(l.id)}>Remover</Botao> : null}</td>
              </tr>
            )) : (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-tinta-2">Nenhum lote com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Remoção: troca de local sem mudar o saldo (RN-25). */
function FormRemocao({ lote, locais, pendente, aoSalvar, aoCancelar }: { lote: Linha; locais: Opcao[]; pendente: boolean; aoSalvar: (d: { localOrigemId: string; localDestinoId: string; quantidade: string; motivo: string }) => void; aoCancelar: () => void }) {
  const [origem, setOrigem] = useState(lote.locais[0]?.id ?? '');
  return (
    <form className="grid min-w-[230px] gap-1.5" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); aoSalvar({ localOrigemId: origem, localDestinoId: String(f.get('destino')), quantidade: paraApi(String(f.get('quantidade'))), motivo: String(f.get('motivo') ?? '') }); }}>
      <Selecao aria-label="Local de origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className="h-8">{lote.locais.map((x) => <option key={x.id} value={x.id}>De {x.codigo} ({num(x.quantidade)})</option>)}</Selecao>
      <Selecao aria-label="Local de destino" name="destino" required className="h-8"><option value="">Para…</option>{locais.filter((x) => x.valor !== origem).map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}</Selecao>
      <Entrada aria-label="Quantidade a remover" name="quantidade" inputMode="decimal" placeholder="kg" required className="h-8" defaultValue={lote.locais.find((x) => x.id === origem)?.quantidade.replace('.', ',')} key={origem} />
      <Entrada aria-label="Motivo da remoção" name="motivo" placeholder="Motivo (opcional)" className="h-8" />
      <div className="flex gap-1.5"><Botao tamanho="pequeno" type="submit" disabled={pendente}>Remover</Botao><Botao tamanho="pequeno" type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao></div>
    </form>
  );
}
