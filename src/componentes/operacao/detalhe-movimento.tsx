'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { Plus, Trash2 } from 'lucide-react';
import { acaoAdicionarEntradas, acaoApagarResultados, acaoCertificadosLote, acaoEstornar, acaoLancarLeitura, acaoLancarResultados, acaoRemoverEntrada } from '@/app/(app)/operacao/acoes';
import { CurvaUmidade } from '@/componentes/secagem/curva';
import { formatarNumero } from '@/lib/formatacao';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Indicador } from '@/componentes/ui/cartao';
import { Aviso } from '@/componentes/ui/aviso';
import { Abas, ConfirmarComMotivo, Documentos, LinhaDoTempo, SeloSituacao, dataHora, num, pct, un } from './comum';
import { paraApi } from '@/lib/formatos';
import { SeletorLotes, type Escolha, type LoteDisponivel } from './seletor-lotes';

type Opcao = { valor: string; rotulo: string; grupo?: string };
type Mov = {
  id: string; numero: number; status: string; natureza: string; unidade: string; servicoTipo: string | null; observacao: string | null; motivoEstorno: string | null;
  etapa: { id: string; nome: string; classe: string; prefixo: string; modeloResultado: string; unidadeEntrada: string; unidadeSaida: string; monitoraSecagem: boolean; tiposResultado: { id: string; codigo: string; nome: string }[] };
  local: { id: string; codigo: string; nome: string } | null; fazenda: string; safra: string; talhao: string | null;
  quantidades: { entrada: string | null; saida: string | null; perda: string | null; quebra: string | null; rendimento: string | null; umidadeFinal: string | null };
  entradas: { id: string; loteId: string; codigo: string; etapa: string; tipo: string | null; tipoCafeId: string | null; quantidade: string | null; unidade: string; local: string | null; reserva: string }[];
  lotes: { id: string; codigo: string; status: string; tipo: string | null; peneira: string | null; unidade: string; quantidade: string | null; percentual: string | null; saldo: string; certificados: string[]; locais: { codigo: string; quantidade: string }[] }[];
  composicao: { talhaoId: string; talhao: string; nome: string; fazenda: string; percentual: string; quantidade: string }[];
  ultimaUmidade: string | null;
  linhaDoTempo: { etapa: string; feita: boolean; quando: string | null; quem: string | null }[];
  historico: { id: string; acao: string; quando: string; quem: string | null; depois: unknown }[];
};
type Aba = 'entradas' | 'resultados' | 'leituras' | 'composicao' | 'rastreabilidade' | 'historico';
type Curva = { metaMin: string | null; metaMax: string | null; leituras: { id: string; dataHora: string; umidade: string; temperaturaMassa: string | null; temperaturaAr: string | null; observacao: string | null }[]; previsao: { horas: number; em: string } | null };
const ACOES: Record<string, string> = {
  SINCRONIZAR: 'Sincronizado', CRIAR: 'Movimento aberto', CARGA: 'Carga registrada', ENTRADA: 'Entradas acrescentadas', RETIRAR_ENTRADA: 'Entrada retirada', RESULTADO: 'Resultados lançados', APAGAR_RESULTADOS: 'Resultados apagados', ESTORNAR: 'Estornado', FINALIZAR: 'Finalizado', REABRIR: 'Reaberto' };

/** Texto do usuário ("1.234,5" ou "0,20") → Decimal; inválido vira null. */
function dec(t: string): Decimal | null {
  const s = t.trim();
  if (!s) return null;
  try {
    const d = new Decimal(paraApi(s));
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function DetalheMovimento({ m, disponiveis, opcoes, podeLancar, podeEstornar, avisos, curva, abaInicial, podeLer }: { m: Mov; disponiveis: LoteDisponivel[]; opcoes: Record<string, Opcao[]>; podeLancar: boolean; podeEstornar: boolean; avisos: string[]; curva: Curva | null; abaInicial?: string; podeLer: boolean }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(abaInicial === 'leituras' && curva ? 'leituras' : m.status === 'ABERTO' && m.entradas.length ? 'resultados' : m.lotes.length ? 'resultados' : 'entradas');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'aviso'; texto: string } | null>(avisos.length ? { tipo: 'aviso', texto: avisos.join(' ') } : null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string; avisos?: string[] }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? (r.avisos?.length ? { tipo: 'aviso', texto: `${r.mensagem ?? ''} ${r.avisos.join(' ')}` } : { tipo: 'ok', texto: r.mensagem ?? 'Pronto.' }) : { tipo: 'erro', texto: r.erro ?? 'Erro.' });
      if (r.ok) {
        depois?.();
        router.refresh();
      }
    });
  const normal = m.natureza === 'NORMAL';
  const colheita = m.etapa.classe === 'COLHEITA';
  const estoque = m.etapa.classe === 'ESTOQUE';
  const voltar = colheita ? '/colheita' : `/etapas/${m.etapa.id}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <SeloSituacao status={m.status} />
        {!normal ? <span className="text-[13px] font-medium text-ouro">Ajuste de inventário</span> : null}
        <span className="text-[13px] text-tinta-2">{[m.fazenda !== 'MIX' ? `Fazenda ${m.fazenda}` : 'Várias fazendas (MIX)', `Safra ${m.safra}`, m.local ? `Local ${m.local.codigo}` : null, m.talhao ? `Talhão ${m.talhao}` : null].filter(Boolean).join(' · ')}</span>
        <div className="ml-auto flex flex-wrap items-start gap-2 print:hidden">
          <Link href={voltar} className={estiloBotao({ variante: 'secundario' })}>Voltar</Link>
          <Documentos csv={{ nome: `${m.etapa.prefixo}-${m.numero}.csv`, linhas: [['Tipo', 'Lote', 'Quantidade', 'Unidade'], ...m.entradas.map((e) => ['Entrada', e.codigo, e.quantidade, e.unidade]), ...m.lotes.map((l) => ['Gerado', l.codigo, l.quantidade, l.unidade])] }} />
          {podeLancar && normal && m.status === 'ABERTO' && !colheita && m.etapa.classe !== 'SAIDA' ? <Botao onClick={() => setAba('resultados')}>Lançar resultados</Botao> : null}
          {podeEstornar && normal && m.status === 'PROCESSADO' && !colheita ? (
            <ConfirmarComMotivo rotulo="Apagar resultados" titulo="Apagar os resultados?" explicacao="Os lotes gerados ficam estornados e o movimento volta a aberto (RN-06)." pendente={pendente} perigo={false} aoConfirmar={(motivo) => rodar(() => acaoApagarResultados(m.id, motivo))} />
          ) : null}
          {podeEstornar && normal && (m.status === 'ABERTO' || m.status === 'PROCESSADO') ? (
            <ConfirmarComMotivo rotulo="Estornar" titulo={`Estornar ${m.etapa.prefixo}#${m.numero}?`} explicacao="Os lotes de origem recebem a quantidade de volta. Nada é apagado (RN-05)." pendente={pendente} aoConfirmar={(motivo) => rodar(() => acaoEstornar(m.id, motivo))} />
          ) : null}
        </div>
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {m.status === 'ESTORNADO' && m.motivoEstorno ? <Aviso tipo="erro">Estornado: {m.motivoEstorno}</Aviso> : null}
      <LinhaDoTempo passos={m.linhaDoTempo} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Indicador valor={`${num(m.quantidades.entrada)} ${un(m.unidade)}`} rotulo={colheita ? 'medidas recebidas' : 'entrada'} />
        <Indicador valor={m.quantidades.saida ? `${num(m.quantidades.saida)} ${un(m.etapa.unidadeSaida)}` : '—'} rotulo="saída" cor="ok" />
        {m.quantidades.rendimento ? (
          <Indicador valor={`${num(m.quantidades.rendimento)}`} rotulo="kg por medida (rendimento)" cor="ouro" />
        ) : (
          <Indicador valor={pct(m.quantidades.quebra, 2)} rotulo={`quebra${m.quantidades.perda ? ` · perda ${num(m.quantidades.perda)}` : ''}`} cor="ouro" />
        )}
        <Indicador valor={m.lotes.filter((l) => l.status !== 'ESTORNADO').length} rotulo="lotes gerados" />
      </div>
      <Abas<Aba>
        rotulo="Seções do movimento"
        atual={aba}
        aoTrocar={setAba}
        abas={[
          { id: 'entradas', rotulo: 'Entradas', conta: m.entradas.length },
          { id: 'resultados', rotulo: 'Resultados', conta: m.lotes.filter((l) => l.status !== 'ESTORNADO').length },
          ...(curva ? [{ id: 'leituras' as const, rotulo: 'Leituras', conta: curva.leituras.length }] : []),
          { id: 'composicao', rotulo: 'Composição por talhão' },
          { id: 'rastreabilidade', rotulo: 'Rastreabilidade' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />
      {aba === 'entradas' ? <Entradas m={m} disponiveis={disponiveis} podeLancar={podeLancar && normal} pendente={pendente} rodar={rodar} /> : null}
      {aba === 'resultados' ? (
        <>
          {m.status === 'ABERTO' && podeLancar && normal && !colheita && m.etapa.classe !== 'SAIDA' ? (
            m.entradas.length ? <FormResultados m={m} opcoes={opcoes} pendente={pendente} aoLancar={(d) => rodar(() => acaoLancarResultados(m.id, d))} /> : <Aviso tipo="aviso">Acrescente entradas antes de lançar os resultados.</Aviso>
          ) : null}
          <LotesGerados m={m} estoque={estoque} certificados={opcoes.certificados ?? []} podeLancar={podeLancar} pendente={pendente} rodar={rodar} />
        </>
      ) : null}
      {aba === 'leituras' && curva ? <Leituras m={m} curva={curva} podeLer={podeLer && m.status === 'ABERTO'} pendente={pendente} rodar={rodar} /> : null}
      {aba === 'composicao' ? <Composicao m={m} /> : null}
      {aba === 'rastreabilidade' ? <Rastreio m={m} /> : null}
      {aba === 'historico' ? (
        <ol className="sombra grid gap-0 rounded-xl border border-linha bg-superficie">
          {m.historico.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-4 border-b border-linha px-4 py-3 text-[13.5px] last:border-b-0">
              <span className="w-36 font-mono text-[12.5px] text-tinta-2">{dataHora(h.quando)}</span>
              <b>{ACOES[h.acao] ?? h.acao}</b>
              <span className="text-tinta-2">{h.quem ?? ''}</span>
              {h.depois && typeof h.depois === 'object' && 'motivo' in (h.depois as object) ? <span className="text-tinta-2">· {String((h.depois as { motivo: unknown }).motivo)}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

type Rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string; avisos?: string[] }>, depois?: () => void) => void;

function Entradas({ m, disponiveis, podeLancar, pendente, rodar }: { m: Mov; disponiveis: LoteDisponivel[]; podeLancar: boolean; pendente: boolean; rodar: Rodar }) {
  const [acrescentar, setAcrescentar] = useState(false);
  const [escolhas, setEscolhas] = useState<Escolha[]>([]);
  if (m.etapa.classe === 'COLHEITA') return <Aviso tipo="ok">A carga de colheita não tem entradas: o lote nasce 100% do talhão {m.talhao}.</Aviso>;
  const aberto = m.status === 'ABERTO' && podeLancar;
  return (
    <div className="grid gap-3">
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="px-3 py-3">Lote</th><th className="px-3 py-3">De</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Local</th><th className="px-3 py-3 text-right">Quantidade</th><th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {m.entradas.map((e) => (
              <tr key={e.id} className="border-t border-linha">
                <td className="px-3 py-2.5 font-mono"><Link className="text-destaque hover:underline" href={`/rastreabilidade/lote/${e.loteId}`}>{e.codigo}</Link>{e.reserva !== 'NENHUMA' ? <div className="text-[11px] text-ouro">da reserva de {e.reserva.toLowerCase()}</div> : null}</td>
                <td className="px-3 py-2.5">{e.etapa}</td>
                <td className="px-3 py-2.5">{e.tipo ?? '—'}</td>
                <td className="px-3 py-2.5">{e.local ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{num(e.quantidade)} {un(e.unidade)}</td>
                <td className="px-3 py-2.5 text-right">
                  {aberto ? <Botao variante="secundario" tamanho="pequeno" disabled={pendente} aria-label={`Retirar ${e.codigo}`} onClick={() => rodar(() => acaoRemoverEntrada(m.id, e.loteId))}><Trash2 className="size-3.5" /> Retirar</Botao> : null}
                </td>
              </tr>
            ))}
            {!m.entradas.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-tinta-2">Sem entradas.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {aberto ? (
        acrescentar ? (
          <div className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
            <b>Acrescentar entradas</b>
            <SeletorLotes lotes={disponiveis.filter((l) => !m.entradas.some((e) => e.loteId === l.id))} aoMudar={setEscolhas} />
            <div className="flex gap-2">
              <Botao disabled={pendente || !escolhas.length} onClick={() => rodar(() => acaoAdicionarEntradas(m.id, escolhas.map((x) => ({ loteId: x.loteId, quantidade: paraApi(x.quantidade), localId: x.localId ?? null }))), () => setAcrescentar(false))}>Acrescentar</Botao>
              <Botao variante="secundario" onClick={() => setAcrescentar(false)}>Cancelar</Botao>
            </div>
          </div>
        ) : (
          <Botao variante="secundario" className="justify-self-start" onClick={() => setAcrescentar(true)}><Plus className="size-4" /> Acrescentar entradas</Botao>
        )
      ) : null}
    </div>
  );
}

type LinhaLote = { quantidade: string; peneiraId: string; tipoCafeId: string; localId: string };

function FormResultados({ m, opcoes, pendente, aoLancar }: { m: Mov; opcoes: Record<string, Opcao[]>; pendente: boolean; aoLancar: (d: Parameters<typeof acaoLancarResultados>[1]) => void }) {
  const modelo = m.etapa.modeloResultado;
  const entrada = new Decimal(m.quantidades.entrada ?? 0);
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const grupos = useMemo(() => {
    const g = new Map<string, { tipoCafeId: string | null; tipo: string; total: Decimal }>();
    for (const e of m.entradas) {
      const k = e.tipoCafeId ?? '';
      const atual = g.get(k) ?? { tipoCafeId: e.tipoCafeId, tipo: e.tipo ?? 'sem tipo', total: new Decimal(0) };
      atual.total = atual.total.plus(e.quantidade ?? 0);
      g.set(k, atual);
    }
    return [...g.values()];
  }, [m.entradas]);
  const [fatores, setFatores] = useState<Record<string, string>>({});
  const [linhas, setLinhas] = useState<LinhaLote[]>([{ quantidade: '', peneiraId: '', tipoCafeId: '', localId: m.local?.id ?? '' }]);
  // A umidade final é sugerida pela última leitura (§7).
  const [umidade, setUmidade] = useState(m.ultimaUmidade ? m.ultimaUmidade.replace('.', ',') : '');
  // Serviço: perder certificado de alguma origem (RN-28) ou passar do limite de quebra (RN-31) exige motivo.
  const servico = m.etapa.classe === 'SERVICO';
  const [motivoRebaixamento, setMotivoRebaixamento] = useState('');
  const [motivoQuebra, setMotivoQuebra] = useState('');

  // Prévia (o servidor recalcula e confere: RN-10, RN-12).
  let saidas: { rotulo: string; q: Decimal | null }[] = [];
  if (modelo === 'PERCENTUAL_POR_TIPO') saidas = m.etapa.tiposResultado.map((t) => ({ rotulo: t.codigo, q: dec(pcts[t.id] ?? '')?.div(100).times(entrada).toDecimalPlaces(3) ?? null }));
  if (modelo === 'CAFE_E_PERDA') saidas = grupos.map((g) => ({ rotulo: g.tipo, q: dec(fatores[g.tipoCafeId ?? ''] ?? '')?.div(100).times(g.total).toDecimalPlaces(3) ?? null }));
  if (modelo === 'CONVERSAO_ESTOQUE' || modelo === 'POR_PENEIRA') saidas = linhas.map((l, i) => ({ rotulo: `Lote ${i + 1}`, q: dec(l.quantidade) }));
  const soma = saidas.reduce((s, x) => s.plus(x.q ?? 0), new Decimal(0));
  const conversao = modelo === 'CONVERSAO_ESTOQUE' && m.unidade === 'MEDIDA';

  const enviar = () => {
    const base = { umidadeFinal: umidade ? paraApi(umidade) : null, ...(servico ? { motivoRebaixamento: motivoRebaixamento || null, motivoQuebra: motivoQuebra || null } : {}) };
    if (modelo === 'PERCENTUAL_POR_TIPO')
      return aoLancar({ ...base, parametros: { modelo, resultados: m.etapa.tiposResultado.filter((t) => dec(pcts[t.id] ?? '')).map((t) => ({ tipoCafeId: t.id, percentual: dec(pcts[t.id]!)!.div(100).toString() })) } });
    if (modelo === 'CAFE_E_PERDA')
      return aoLancar({ ...base, parametros: { modelo, fatores: grupos.map((g) => ({ tipoCafeId: g.tipoCafeId, fator: dec(fatores[g.tipoCafeId ?? ''] ?? '')?.div(100).toString() ?? '' })) } });
    if (modelo === 'CONVERSAO_ESTOQUE')
      return aoLancar({ ...base, parametros: { modelo, lotes: linhas.map((l) => ({ quantidade: paraApi(l.quantidade), peneiraId: l.peneiraId || null, tipoCafeId: l.tipoCafeId || null, localId: l.localId || null })) } });
    if (modelo === 'POR_PENEIRA') return aoLancar({ ...base, parametros: { modelo, lotes: linhas.map((l) => ({ quantidade: paraApi(l.quantidade), peneiraId: l.peneiraId, tipoCafeId: l.tipoCafeId || null })) } });
  };

  return (
    <form className="sombra grid gap-4 rounded-xl border border-linha bg-superficie p-5" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      <h2 className="font-display text-[19px] font-semibold">Lançar resultados</h2>
      {modelo === 'PERCENTUAL_POR_TIPO' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          {m.etapa.tiposResultado.map((t) => (
            <Campo key={t.id} rotulo={`${t.codigo} · ${t.nome} (%)`}><Entrada inputMode="decimal" value={pcts[t.id] ?? ''} onChange={(e) => setPcts({ ...pcts, [t.id]: e.target.value })} /></Campo>
          ))}
        </div>
      ) : null}
      {modelo === 'CAFE_E_PERDA' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {grupos.map((g) => (
            <Campo key={g.tipoCafeId ?? 'x'} rotulo={`Café ${g.tipo} (%)`} dica={`Entrou ${num(g.total.toString())} ${un(m.unidade)}. Ex.: 90 = sobram 90%`}>
              <Entrada inputMode="decimal" value={fatores[g.tipoCafeId ?? ''] ?? ''} onChange={(e) => setFatores({ ...fatores, [g.tipoCafeId ?? '']: e.target.value })} />
            </Campo>
          ))}
        </div>
      ) : null}
      {modelo === 'CONVERSAO_ESTOQUE' || modelo === 'POR_PENEIRA' ? (
        <div className="grid gap-2">
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3">
              <Campo rotulo={`Lote ${i + 1}: ${modelo === 'CONVERSAO_ESTOQUE' ? 'peso (kg) *' : 'quantidade (kg) *'}`}><Entrada inputMode="decimal" value={l.quantidade} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} required /></Campo>
              <Campo rotulo={`Peneira${modelo === 'POR_PENEIRA' ? ' *' : ''}`}>
                <Selecao value={l.peneiraId} required={modelo === 'POR_PENEIRA'} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, peneiraId: e.target.value } : x)))}>
                  <option value="">—</option>{(opcoes.peneiras ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Tipo">
                <Selecao value={l.tipoCafeId} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, tipoCafeId: e.target.value } : x)))}>
                  <option value="">{modelo === 'CONVERSAO_ESTOQUE' ? 'O das entradas' : '—'}</option>{(opcoes.tiposCafe ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </Selecao>
              </Campo>
              {modelo === 'CONVERSAO_ESTOQUE' ? (
                <Campo rotulo="Local *">
                  <Selecao value={l.localId} required onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, localId: e.target.value } : x)))}>
                    <option value="">Escolha…</option>{(opcoes.locais ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </Selecao>
                </Campo>
              ) : null}
              {linhas.length > 1 ? <Botao type="button" variante="secundario" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>Tirar</Botao> : null}
            </div>
          ))}
          <Botao type="button" variante="texto" className="justify-self-start px-0" onClick={() => setLinhas([...linhas, { quantidade: '', peneiraId: '', tipoCafeId: '', localId: m.local?.id ?? '' }])}><Plus className="size-4" /> Outro lote</Botao>
        </div>
      ) : null}
      {servico ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <Campo rotulo="Motivo do rebaixamento" dica="Se alguma origem tiver certificado que o resultado não terá (RN-28)"><Entrada value={motivoRebaixamento} onChange={(e) => setMotivoRebaixamento(e.target.value)} /></Campo>
          <Campo rotulo="Motivo da quebra" dica="Se a quebra passar do limite do tipo de serviço (RN-31)"><Entrada value={motivoQuebra} onChange={(e) => setMotivoQuebra(e.target.value)} /></Campo>
        </div>
      ) : null}
      {m.etapa.monitoraSecagem ? <Campo rotulo="Umidade final (%)" className="max-w-[200px]"><Entrada inputMode="decimal" value={umidade} onChange={(e) => setUmidade(e.target.value)} /></Campo> : null}
      <div className="rounded-lg bg-superficie-2 px-4 py-3 text-[13.5px]" aria-live="polite">
        <b>Prévia:</b> entrada {num(entrada.toString())} {un(m.unidade)} → {saidas.map((s) => `${s.rotulo} ${s.q ? num(s.q.toString()) : '—'}`).join(' · ')}
        {conversao
          ? soma.gt(0) && entrada.gt(0) ? <> · rendimento <b>{num(soma.div(entrada).toDecimalPlaces(3).toString())} kg/medida</b> · {num(soma.div(60).toDecimalPlaces(2).toString(), 2)} sacas</> : null
          : <> · perda <b>{num(entrada.minus(soma).toString())}</b> · quebra <b>{entrada.gt(0) ? pct(entrada.minus(soma).div(entrada).toString(), 2) : '—'}</b></>}
      </div>
      <Botao type="submit" className="justify-self-start" disabled={pendente}>{pendente ? 'Lançando…' : 'Lançar resultados'}</Botao>
    </form>
  );
}

function LotesGerados({ m, estoque, certificados, podeLancar, pendente, rodar }: { m: Mov; estoque: boolean; certificados: Opcao[]; podeLancar: boolean; pendente: boolean; rodar: Rodar }) {
  const [editando, setEditando] = useState<string | null>(null);
  if (!m.lotes.length) return m.status === 'ABERTO' ? null : <Aviso tipo="aviso">Este movimento não gerou lotes.</Aviso>;
  return (
    <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
      <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
            <th className="px-3 py-3">Lote</th><th className="px-3 py-3">Tipo / peneira</th><th className="px-3 py-3 text-right">Quantidade</th><th className="px-3 py-3 text-right">Saldo</th>
            <th className="px-3 py-3">Certificados</th>{estoque ? <th className="px-3 py-3">Local</th> : null}<th className="px-3 py-3">Situação</th>
          </tr>
        </thead>
        <tbody>
          {m.lotes.map((l) => (
            <tr key={l.id} className="border-t border-linha align-top">
              <td className="px-3 py-2.5 font-mono"><Link className="text-destaque hover:underline" href={`/rastreabilidade/lote/${l.id}`}>{l.codigo}</Link></td>
              <td className="px-3 py-2.5">{[l.tipo, l.peneira ? `P${l.peneira}` : null].filter(Boolean).join(' · ') || '—'}{l.percentual && !estoque ? <span className="text-tinta-2"> · {pct(l.percentual)}</span> : null}</td>
              <td className="px-3 py-2.5 text-right font-mono">{num(l.quantidade)} {un(l.unidade)}{l.unidade === 'KG' ? <div className="text-[11.5px] text-tinta-2">{num(new Decimal(l.quantidade ?? 0).div(60).toDecimalPlaces(2).toString(), 2)} sacas</div> : null}</td>
              <td className="px-3 py-2.5 text-right font-mono">{num(l.saldo)}</td>
              <td className="px-3 py-2.5">
                {editando === l.id ? (
                  <EditorCertificados atuais={l.certificados} todos={certificados} pendente={pendente} aoCancelar={() => setEditando(null)} aoSalvar={(ids, motivo) => rodar(() => acaoCertificadosLote(l.id, ids, motivo), () => setEditando(null))} />
                ) : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {l.certificados.length ? l.certificados.join(', ') : <span className="text-tinta-2">convencional</span>}
                    {estoque && podeLancar && l.status === 'ABERTO' ? <Botao variante="texto" tamanho="pequeno" className="px-1" onClick={() => setEditando(l.id)}>alterar</Botao> : null}
                  </span>
                )}
              </td>
              {estoque ? <td className="px-3 py-2.5 text-[12.5px]">{l.locais.map((x) => `${x.codigo}: ${num(x.quantidade)}`).join(' · ') || '—'}</td> : null}
              <td className="px-3 py-2.5"><SeloSituacao status={l.status} lote /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tirar certificado pede motivo; acrescentar um que as origens não têm é bloqueado no servidor (RN-08). */
function EditorCertificados({ atuais, todos, pendente, aoSalvar, aoCancelar }: { atuais: string[]; todos: Opcao[]; pendente: boolean; aoSalvar: (ids: string[], motivo?: string) => void; aoCancelar: () => void }) {
  const [sel, setSel] = useState(() => todos.filter((c) => atuais.includes(c.rotulo)).map((c) => c.valor));
  const [motivo, setMotivo] = useState('');
  const tirando = todos.some((c) => atuais.includes(c.rotulo) && !sel.includes(c.valor));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {todos.map((c) => (
          <label key={c.valor} className="flex items-center gap-1 rounded-md border border-linha px-2 py-1 text-[12.5px]">
            <input type="checkbox" checked={sel.includes(c.valor)} onChange={(e) => setSel(e.target.checked ? [...sel, c.valor] : sel.filter((x) => x !== c.valor))} /> {c.rotulo}
          </label>
        ))}
      </div>
      {tirando ? <Entrada aria-label="Motivo de tirar o certificado" placeholder="Motivo de tirar o certificado" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-8" /> : null}
      <div className="flex gap-1.5">
        <Botao tamanho="pequeno" disabled={pendente} onClick={() => aoSalvar(sel, motivo || undefined)}>Salvar</Botao>
        <Botao tamanho="pequeno" variante="secundario" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

function Composicao({ m }: { m: Mov }) {
  if (!m.composicao.length) return <Aviso tipo="aviso">Sem composição: o movimento ainda não tem entradas.</Aviso>;
  return (
    <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
      <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
            <th className="px-3 py-3">Talhão</th><th className="px-3 py-3">Fazenda</th><th className="px-3 py-3 text-right">Participação</th><th className="px-3 py-3 text-right">Equivale a</th>
          </tr>
        </thead>
        <tbody>
          {m.composicao.map((c) => (
            <tr key={c.talhaoId} className="border-t border-linha">
              <td className="px-3 py-2.5"><b className="font-mono">{c.talhao}</b> {c.nome}</td>
              <td className="px-3 py-2.5">{c.fazenda}</td>
              <td className="px-3 py-2.5 text-right font-mono">{pct(c.percentual, 2)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{num(c.quantidade)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[12px] text-tinta-2">Composição por talhão ponderada pelas quantidades (RN-09).</p>
    </div>
  );
}

function Rastreio({ m }: { m: Mov }) {
  const ativos = m.lotes.filter((l) => l.status !== 'ESTORNADO');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4">
        <b>De onde veio</b>
        {m.entradas.length ? m.entradas.map((e) => <Link key={e.id} className="font-mono text-destaque hover:underline" href={`/rastreabilidade/lote/${e.loteId}?direcao=cima`}>{e.codigo} ↑</Link>) : <span className="text-tinta-2">Colheita: talhão {m.talhao}</span>}
      </div>
      <div className="sombra grid content-start gap-2 rounded-xl border border-linha bg-superficie p-4">
        <b>Para onde foi</b>
        {ativos.length ? ativos.map((l) => <Link key={l.id} className="font-mono text-destaque hover:underline" href={`/rastreabilidade/lote/${l.id}?direcao=baixo`}>{l.codigo} ↓</Link>) : <span className="text-tinta-2">Sem lotes gerados ainda.</span>}
      </div>
    </div>
  );
}

/** Leituras de umidade (§7): curva com a meta, previsão de ponto e lançamento pelo escritório. */
function Leituras({ m, curva, podeLer, pendente, rodar }: { m: Mov; curva: Curva; podeLer: boolean; pendente: boolean; rodar: Rodar }) {
  const agora = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T');
  const ultima = curva.leituras.at(-1);
  const naMeta = ultima && curva.metaMin && curva.metaMax && new Decimal(ultima.umidade).gte(curva.metaMin) && new Decimal(ultima.umidade).lte(curva.metaMax);
  return (
    <div className="grid gap-3">
      <div className="sombra grid gap-2 rounded-xl border border-linha bg-superficie p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13.5px]">
          <b className="font-display text-[17px]">Curva de umidade</b>
          {curva.metaMin ? <span className="text-tinta-2">Meta {formatarNumero(curva.metaMin, 1)}–{formatarNumero(curva.metaMax!, 1)}%</span> : null}
          {ultima ? <span>Última <b className="font-mono">{formatarNumero(ultima.umidade, 1)}%</b> em {dataHora(ultima.dataHora)}</span> : null}
          {naMeta ? <span className="font-semibold text-ok">No ponto</span> : curva.previsao ? <span className="text-tinta-2">Ponto estimado em ~{formatarNumero(String(curva.previsao.horas), 1)} h ({dataHora(curva.previsao.em)})</span> : curva.leituras.length < 3 ? <span className="text-tinta-2">A previsão aparece com 3 leituras.</span> : null}
        </div>
        {curva.leituras.length ? <CurvaUmidade leituras={curva.leituras} metaMin={curva.metaMin} metaMax={curva.metaMax} /> : <p className="py-8 text-center text-tinta-2">Sem leituras ainda.</p>}
      </div>
      {podeLer ? (
        <form className="sombra grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3 rounded-xl border border-linha bg-superficie p-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? '').trim();
          const alvo = e.currentTarget;
          rodar(() => acaoLancarLeitura(m.id, { dataHora: new Date(`${v('dataHora')}:00-03:00`).toISOString(), umidade: paraApi(v('umidade')), temperaturaMassa: v('massa') ? paraApi(v('massa')) : null, temperaturaAr: v('ar') ? paraApi(v('ar')) : null, observacao: v('obs') }), () => alvo.reset());
        }}>
          <Campo rotulo="Quando"><Entrada type="datetime-local" name="dataHora" defaultValue={agora()} required /></Campo>
          <Campo rotulo="Umidade (%) *"><Entrada name="umidade" inputMode="decimal" required /></Campo>
          <Campo rotulo="Temp. da massa (°C)"><Entrada name="massa" inputMode="decimal" /></Campo>
          <Campo rotulo="Temp. do ar (°C)"><Entrada name="ar" inputMode="decimal" /></Campo>
          <Campo rotulo="Observação"><Entrada name="obs" /></Campo>
          <Botao type="submit" disabled={pendente}>Registrar leitura</Botao>
        </form>
      ) : null}
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
          <thead><tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase"><th className="px-3 py-3">Quando</th><th className="px-3 py-3 text-right">Umidade</th><th className="px-3 py-3 text-right">Massa</th><th className="px-3 py-3 text-right">Ar</th><th className="px-3 py-3">Observação</th></tr></thead>
          <tbody>
            {[...curva.leituras].reverse().map((l) => (
              <tr key={l.id} className="border-t border-linha">
                <td className="px-3 py-2.5">{dataHora(l.dataHora)}</td><td className="px-3 py-2.5 text-right font-mono">{formatarNumero(l.umidade, 1)}%</td>
                <td className="px-3 py-2.5 text-right font-mono">{l.temperaturaMassa ? `${formatarNumero(l.temperaturaMassa, 1)} °C` : '—'}</td><td className="px-3 py-2.5 text-right font-mono">{l.temperaturaAr ? `${formatarNumero(l.temperaturaAr, 1)} °C` : '—'}</td>
                <td className="px-3 py-2.5">{l.observacao ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
