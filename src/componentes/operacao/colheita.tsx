'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { acaoEstornar, acaoRegistrarCarga } from '@/app/(app)/operacao/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Indicador } from '@/componentes/ui/cartao';
import { Aviso } from '@/componentes/ui/aviso';
import { ConfirmarComMotivo, Documentos, SeloSituacao, num } from './comum';

type Opcao = { valor: string; rotulo: string; grupo?: string };
type Carga = {
  id: string; numero: number; status: string; data: string; modoColheita: string | null; quantidade: string | null; fazenda: string | null; talhao: string | null; observacao: string | null;
  lote: { id: string; codigo: string; tipo: string | null; saldo: string; status: string } | null;
};
const MODO: Record<string, string> = { MANUAL: 'Manual', SEMIMECANIZADA: 'Semimecanizada', MECANICA: 'Mecânica' };

/** Cargas do dia (§12 item 6): cada carga gera um movimento de colheita com 1 lote (§6.2). */
export function TelaColheita({ data, cargas, opcoes, podeLancar }: { data: string; cargas: Carga[]; opcoes: Record<string, Opcao[]>; podeLancar: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const validas = cargas.filter((c) => c.status !== 'ESTORNADO');
  const total = validas.reduce((s, c) => s.plus(c.quantidade ?? 0), new Decimal(0));
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Dia" className="w-44">
          <Entrada type="date" value={data} onChange={(e) => e.target.value && router.push(`/colheita?data=${e.target.value}`)} />
        </Campo>
        <div className="ml-auto flex gap-2">
          <Documentos csv={{ nome: `cargas-${data}.csv`, linhas: [['Nº', 'Fazenda', 'Talhão', 'Modo', 'Medidas', 'Lote', 'Situação'], ...cargas.map((c) => [String(c.numero), c.fazenda, c.talhao, MODO[c.modoColheita ?? ''] ?? '', c.quantidade, c.lote?.codigo ?? '', c.status])] }} />
          {podeLancar && !novo ? <Botao onClick={() => { setMsg(null); setNovo(true); }}><Plus className="size-4" /> Nova carga</Botao> : null}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Indicador valor={validas.length} rotulo="cargas no dia" />
        <Indicador valor={num(total.toString())} rotulo="medidas recebidas" cor="ouro" />
        <Indicador valor={new Set(validas.map((c) => c.talhao)).size} rotulo="talhões colhidos" cor="ok" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {novo ? (
        <NovaCarga
          opcoes={opcoes}
          pendente={pendente}
          aoCancelar={() => setNovo(false)}
          aoSalvar={(d) =>
            iniciar(async () => {
              const r = await acaoRegistrarCarga(d);
              if (!r.ok) return setMsg({ tipo: 'erro', texto: r.erro });
              setMsg({ tipo: 'ok', texto: `Carga registrada: lote ${r.dados?.lote}.` });
              setNovo(false);
              router.refresh();
            })
          }
        />
      ) : null}
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="px-3 py-3">Nº</th><th className="px-3 py-3">Talhão</th><th className="px-3 py-3">Modo</th><th className="px-3 py-3 text-right">Medidas</th>
              <th className="px-3 py-3">Lote gerado</th><th className="px-3 py-3 text-right">Saldo</th><th className="px-3 py-3">Situação</th><th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {cargas.length ? cargas.map((c) => (
              <tr key={c.id} className="border-t border-linha align-top">
                <td className="px-3 py-2.5 font-mono"><Link className="text-destaque hover:underline" href={`/movimentos/${c.id}`}>{c.numero}</Link></td>
                <td className="px-3 py-2.5"><b>{c.fazenda}</b> · {c.talhao}{c.observacao ? <div className="text-[12px] text-tinta-2">{c.observacao}</div> : null}</td>
                <td className="px-3 py-2.5">{MODO[c.modoColheita ?? ''] ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{num(c.quantidade)}</td>
                <td className="px-3 py-2.5 font-mono">{c.lote ? <Link className="text-destaque hover:underline" href={`/rastreabilidade/lote/${c.lote.id}?direcao=baixo`}>{c.lote.codigo}</Link> : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{c.lote ? num(c.lote.saldo) : '—'}</td>
                <td className="px-3 py-2.5"><SeloSituacao status={c.status === 'ESTORNADO' ? 'ESTORNADO' : (c.lote?.status ?? c.status)} lote /></td>
                <td className="px-3 py-2.5 text-right">
                  {podeLancar && c.status === 'PROCESSADO' && c.lote?.status === 'ABERTO' ? (
                    estornando === c.id ? (
                      <ConfirmarComMotivo
                        rotulo="Estornar"
                        titulo={`Estornar a carga nº ${c.numero}?`}
                        explicacao="O lote fica estornado. Nada é apagado."
                        pendente={pendente}
                        aoConfirmar={(motivo) => iniciar(async () => {
                          const r = await acaoEstornar(c.id, motivo);
                          setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro });
                          setEstornando(null);
                          router.refresh();
                        })}
                      />
                    ) : (
                      <Botao variante="secundario" tamanho="pequeno" onClick={() => setEstornando(c.id)}>Estornar</Botao>
                    )
                  ) : null}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-tinta-2">Nenhuma carga neste dia.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NovaCarga({ opcoes, pendente, aoSalvar, aoCancelar }: { opcoes: Record<string, Opcao[]>; pendente: boolean; aoSalvar: (d: Parameters<typeof acaoRegistrarCarga>[0]) => void; aoCancelar: () => void }) {
  const [fazendaId, setFazendaId] = useState(opcoes.fazendas?.[0]?.valor ?? '');
  const talhoes = useMemo(() => (opcoes.talhoes ?? []).filter((t) => t.grupo === fazendaId), [opcoes.talhoes, fazendaId]);
  return (
    <form
      className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        aoSalvar({
          fazendaId, talhaoId: String(f.get('talhaoId')), safraId: String(f.get('safraId')), tipoCafeId: String(f.get('tipoCafeId')),
          quantidade: String(f.get('quantidade')), modoColheita: f.get('modoColheita') as 'MANUAL', observacao: String(f.get('observacao') ?? ''),
        });
      }}
    >
      <h2 className="font-display text-[19px] font-semibold">Nova carga</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Campo rotulo="Fazenda *"><Selecao value={fazendaId} onChange={(e) => setFazendaId(e.target.value)} required>{(opcoes.fazendas ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Talhão *"><Selecao name="talhaoId" required key={fazendaId}>{talhoes.length ? talhoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>) : <option value="">Fazenda sem talhões</option>}</Selecao></Campo>
        <Campo rotulo="Safra *"><Selecao name="safraId" required>{(opcoes.safras ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Tipo de café *"><Selecao name="tipoCafeId" required defaultValue={opcoes.tiposCafe?.find((t) => t.rotulo.startsWith('NAT'))?.valor}>{(opcoes.tiposCafe ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Selecao></Campo>
        <Campo rotulo="Medidas na recepção *" dica="Quantidade medida ao receber"><Entrada name="quantidade" inputMode="decimal" required /></Campo>
        <Campo rotulo="Modo de colheita"><Selecao name="modoColheita" defaultValue="MANUAL">{Object.entries(MODO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Selecao></Campo>
        <Campo rotulo="Observação" className="sm:col-span-2"><Entrada name="observacao" /></Campo>
      </div>
      <div className="flex gap-2"><Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : 'Registrar carga'}</Botao><Botao type="button" variante="secundario" onClick={aoCancelar}>Cancelar</Botao></div>
    </form>
  );
}
