'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { FileText, FileJson, Map as Mapa, Sheet } from 'lucide-react';
import { acaoCancelarNota, acaoCarregar, acaoDesprogramar, acaoFinalizarEmbarque, acaoGerarDossie, acaoLogistica, acaoNota, acaoProgramar, acaoReabrirEmbarque, acaoReemitirPacote } from '@/app/(app)/comercial/acoes';
import type { obterEmbarque } from '@/servicos/embarques';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { Indicador } from '@/componentes/ui/cartao';
import { ConfirmarComMotivo, Documentos, LinhaDoTempo, SeloSituacao, dataHora, num } from '@/componentes/operacao/comum';
import type { LoteLivre } from './reservar-lotes';
import { paraApi } from '@/lib/formatos';

type E = Awaited<ReturnType<typeof obterEmbarque>>;
type R = { ok: boolean; mensagem?: string; erro?: string };
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const kgPt = (v: string) => new Decimal(v).toString().replace('.', ',');

/** Embarque em etapas (§9.4): programação (RN-26) → carregamento com pesagem (RN-27) → notas → finalização. */
export function DetalheEmbarque({ e, lotes, motoristas, pode }: { e: E; lotes: LoteLivre[]; motoristas: { id: string; nome: string; placa: string | null }[]; pode: { programar: boolean; carregar: boolean; finalizar: boolean; reabrir: boolean } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<R>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) { depois?.(); router.refresh(); }
    });
  const aberto = e.status === 'ABERTO';
  const carregado = !!e.carregamento;
  const programado = e.programacao.length > 0;
  const fase = !aberto ? 'fim' : carregado ? 'notas' : programado ? 'carregar' : 'programar';
  return (
    <>
      <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloSituacao status={e.status} />
          <span className="text-[13px]">Contrato <Link href={`/contratos/${e.contrato.id}`} className="font-mono font-semibold text-destaque hover:underline">{e.contrato.codigo}</Link> · {e.contrato.cliente}</span>
          <span className="text-[13px] text-tinta-2">exige {[...e.contrato.certificados, e.contrato.exigeEudr ? 'EUDR' : null].filter(Boolean).join(', ') || 'nada'} · saldo do contrato {num(e.contrato.saldo)} kg</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {pode.finalizar && aberto && carregado ? <Botao disabled={pendente} onClick={() => rodar(() => acaoFinalizarEmbarque(e.id))}>Finalizar embarque</Botao> : null}
            {pode.reabrir && e.status === 'FINALIZADO' && !e.logistica.numeroDds ? <ConfirmarComMotivo rotulo="Reabrir" titulo="Reabrir o embarque?" explicacao="Os kg voltam aos lotes. Bloqueado depois que a DDS é informada (RN-14)." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoReabrirEmbarque(e.id, m))} /> : null}
          </div>
        </div>
        <LinhaDoTempo passos={e.linhaDoTempo} />
      </section>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {carregado ? <Indicador valor={num(e.contrato.kg)} rotulo="kg do contrato" cor="ouro" /> : <Indicador valor={num(e.programadoKg)} rotulo="kg programados" cor="ouro" />}
        <Indicador valor={num(e.kgEntradas)} rotulo="kg carregados (lotes)" />
        <Indicador valor={e.carregamento?.pesoLiquido ? num(e.carregamento.pesoLiquido) : '—'} rotulo="peso líquido (balança)" cor="ok" />
        <Indicador valor={e.notas.length} rotulo="notas fiscais" cor="destaque" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}

      {fase === 'programar' && pode.programar ? <Programar e={e} lotes={lotes} pendente={pendente} rodar={rodar} /> : null}

      {programado || carregado ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[17px] font-semibold">{carregado ? 'Lotes carregados' : 'Lotes programados'}</h2>
            {fase === 'carregar' && pode.programar ? <span className="ml-auto"><ConfirmarComMotivo rotulo="Desfazer programação" titulo="Desfazer a programação?" explicacao="As reservas do embarque são canceladas e os kg voltam a ficar livres." pendente={pendente} perigo={false} aoConfirmar={(m) => rodar(() => acaoDesprogramar(e.id, m))} /></span> : null}
          </div>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Lote</th><th>Peneira</th><th>Certificação</th><th className="text-right">kg</th></tr></thead>
            <tbody>
              {(carregado ? e.entradas : e.programacao.map((p) => ({ ...p, certificados: p.certificados.map((c) => c.codigo) }))).map((l) => (
                <tr key={l.id} className="border-t border-linha">
                  <td className="py-1.5"><Link href={`/rastreabilidade/lote/${l.loteId}`} className="font-mono font-semibold text-destaque hover:underline">{l.lote}</Link></td>
                  <td>{l.peneira ? `P${l.peneira}` : '—'}</td><td>{l.certificados.join(', ') || '—'}</td>
                  <td className="text-right font-mono">{num(l.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {fase === 'carregar' && pode.carregar ? <Carregar e={e} motoristas={motoristas} pendente={pendente} rodar={rodar} /> : null}

      {e.carregamento ? (
        <section className="sombra grid gap-2 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Carregamento</h2>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2 text-[13px]">
            <Item r="Motorista" v={e.carregamento.motorista ?? '—'} /><Item r="Placa" v={e.carregamento.placa ?? '—'} />
            <Item r="Lacres" v={e.carregamento.lacres.join(', ') || '—'} />
            <Item r="Bruto / tara" v={`${num(e.carregamento.pesoBruto ?? '0')} / ${num(e.carregamento.tara ?? '0')} kg`} />
            <Item r="Diferença" v={`${num(e.carregamento.diferencaKg ?? '0')} kg (${new Decimal(e.carregamento.diferencaPerc ?? 0).times(100).toFixed(2).replace('.', ',')}%)`} />
            {e.carregamento.motivoDiferenca ? <Item r="Motivo da diferença" v={e.carregamento.motivoDiferenca} /> : null}
            <Item r="Vendido como" v={e.venda.rotulo ?? '—'} />
          </dl>
          {e.venda.rebaixamentos.length ? (
            <Aviso tipo="aviso">Rebaixamento (RN-28): {e.venda.rebaixamentos.map((r) => `${r.lote ?? 'lote'} perde ${r.perdidos.join(', ')} em ${num(r.kg)} kg`).join('; ')}. Motivo: {e.venda.rebaixamentos[0]!.motivo}</Aviso>
          ) : null}
        </section>
      ) : null}

      {carregado ? <Notas e={e} pode={pode.programar} pendente={pendente} rodar={rodar} /> : null}
      {carregado ? <Dossie e={e} pode={pode.programar} pendente={pendente} rodar={rodar} /> : null}
      {e.pacotes.length ? <Pacotes e={e} pode={pode.finalizar} pendente={pendente} rodar={rodar} /> : null}
      <Logistica e={e} pode={pode.programar} pendente={pendente} rodar={rodar} />

      <section className="sombra grid gap-2 rounded-xl border border-linha bg-superficie p-4">
        <h2 className="font-display text-[17px] font-semibold">Documentos</h2>
        <div className="flex flex-wrap gap-2">
          {carregado ? <a href={`/api/embarques/${e.id}/romaneio.pdf`} target="_blank" rel="noreferrer" className={estiloBotao({ variante: 'secundario' })}><FileText className="size-4" /> Romaneio (PDF)</a> : <span className="text-[13px] text-tinta-2">O romaneio fica disponível depois do carregamento.</span>}
        </div>
        <Documentos csv={{ nome: `embarque-${e.rotulo}`, linhas: [['Lote', 'Peneira', 'kg'], ...(carregado ? e.entradas : e.programacao).map((l) => [l.lote, l.peneira, l.quantidade])] }} />
      </section>
    </>
  );
}

function Item({ r, v }: { r: string; v: string }) {
  return <div><dt className="text-[11.5px] text-tinta-2">{r}</dt><dd className="font-medium">{v}</dd></div>;
}

type Rodar = (f: () => Promise<R>, depois?: () => void) => void;

function Programar({ e, lotes, pendente, rodar }: { e: E; lotes: LoteLivre[]; pendente: boolean; rodar: Rodar }) {
  const [modo, setModo] = useState<'contrato' | 'lotes'>(e.reservasDoContrato.length ? 'contrato' : 'lotes');
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const itens = lotes.filter((l) => (qtd[l.id] ?? '').trim()).map((l) => ({ loteId: l.id, quantidade: paraApi(qtd[l.id] ?? '') }));
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <h2 className="font-display text-[17px] font-semibold">1. Programação</h2>
      <p className="text-[13px] text-tinta-2">Os kg programados ficam reservados para este embarque (RN-26).</p>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <label className="flex items-center gap-1.5"><input type="radio" checked={modo === 'contrato'} onChange={() => setModo('contrato')} disabled={!e.reservasDoContrato.length} /> Usar as reservas do contrato ({e.reservasDoContrato.length})</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={modo === 'lotes'} onChange={() => setModo('lotes')} /> Escolher lotes livres</label>
      </div>
      {modo === 'contrato' ? (
        <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
          <tbody>{e.reservasDoContrato.map((r) => <tr key={r.id} className="border-t border-linha"><td className="py-1.5 font-mono font-semibold">{r.lote}</td><td className="text-right font-mono">{num(r.quantidade)} kg</td></tr>)}</tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
          <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Lote</th><th>Peneira</th><th>Certificação</th><th className="text-right">Livre</th><th className="w-36 text-right">Programar (kg)</th></tr></thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id} className="border-t border-linha">
                <td className="py-1.5 font-mono font-semibold">{l.codigo}</td><td>{l.peneira ? `P${l.peneira}` : '—'}</td><td>{l.certificados.join(', ') || '—'}</td><td className="text-right font-mono">{num(l.livre)}</td>
                <td className="text-right"><Entrada className="h-8 text-right" inputMode="decimal" aria-label={`Programar do lote ${l.codigo}`} value={qtd[l.id] ?? ''} onChange={(ev) => setQtd({ ...qtd, [l.id]: ev.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Botao className="justify-self-start" disabled={pendente || (modo === 'lotes' && !itens.length)} onClick={() => rodar(() => acaoProgramar(e.id, modo === 'contrato' ? undefined : itens))}>Programar embarque</Botao>
    </section>
  );
}

function Carregar({ e, motoristas, pendente, rodar }: { e: E; motoristas: { id: string; nome: string; placa: string | null }[]; pendente: boolean; rodar: Rodar }) {
  // Vender como (RN-28): só o que todos os lotes têm; desmarcar = rebaixamento, com motivo.
  const todos = [...new Map(e.programacao.flatMap((p) => p.certificados).map((c) => [c.id, c])).values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const comuns = todos.filter((c) => e.programacao.every((p) => p.certificados.some((x) => x.id === c.id)));
  const [vendidos, setVendidos] = useState<string[]>(comuns.map((c) => c.id));
  const perde = e.programacao.filter((p) => p.certificados.some((c) => !vendidos.includes(c.id)));
  const [placa, setPlaca] = useState('');
  const [bruto, setBruto] = useState('');
  const [tara, setTara] = useState('');
  let previa: { liquido: Decimal; dif: Decimal; perc: Decimal } | null = null;
  try {
    if (bruto && tara) {
      const liquido = new Decimal(paraApi(bruto)).minus(paraApi(tara));
      const dif = liquido.minus(e.programadoKg);
      previa = { liquido, dif, perc: new Decimal(e.programadoKg).gt(0) ? dif.div(e.programadoKg).times(100) : new Decimal(0) };
    }
  } catch { /* digitando */ }
  return (
    <form className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4" onSubmit={(ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      const v = (k: string) => String(f.get(k) ?? '').trim();
      rodar(() => acaoCarregar(e.id, {
        motoristaId: v('motoristaId') || null, placa, lacres: v('lacres').split(/[,;\s]+/).filter(Boolean), pesoBruto: paraApi(bruto), tara: paraApi(tara),
        motivoDiferenca: v('motivo') || null, dataEmbarque: v('dataEmbarque') || null, certificadosVendidos: vendidos, motivoRebaixamento: v('motivoRebaixamento') || null,
      }));
    }}>
      <h2 className="font-display text-[17px] font-semibold">2. Carregamento</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Campo rotulo="Motorista"><Selecao name="motoristaId" onChange={(ev) => { const m = motoristas.find((x) => x.id === ev.target.value); if (m?.placa && !placa) setPlaca(m.placa); }}><option value="">—</option>{motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</Selecao></Campo>
        <Campo rotulo="Placa *"><Entrada value={placa} onChange={(ev) => setPlaca(ev.target.value.toUpperCase())} required placeholder="ABC1D23" /></Campo>
        <Campo rotulo="Lacres" dica="separados por vírgula"><Entrada name="lacres" /></Campo>
        <Campo rotulo="Data do embarque"><Entrada type="date" name="dataEmbarque" defaultValue={hoje()} /></Campo>
        <Campo rotulo="Peso bruto (kg) *"><Entrada value={bruto} onChange={(ev) => setBruto(ev.target.value)} inputMode="decimal" required /></Campo>
        <Campo rotulo="Tara (kg) *"><Entrada value={tara} onChange={(ev) => setTara(ev.target.value)} inputMode="decimal" required /></Campo>
      </div>
      {previa ? (
        <p className="text-[13px]">Líquido <b className="font-mono">{num(previa.liquido.toFixed(3))} kg</b> · programado {num(e.programadoKg)} kg · diferença <b className="font-mono">{num(previa.dif.toFixed(3))} kg ({previa.perc.toFixed(2).replace('.', ',')}%)</b></p>
      ) : null}
      <Campo rotulo="Motivo da diferença" dica="obrigatório se a diferença passar do limite (RN-27)"><Entrada name="motivo" /></Campo>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-semibold">Vender como</legend>
        <div className="flex flex-wrap gap-2">
          {todos.map((c) => {
            const emTodos = comuns.some((x) => x.id === c.id);
            return (
              <label key={c.id} className="flex items-center gap-1.5 rounded-lg border border-linha px-2.5 py-1.5 text-[13px]" title={emTodos ? undefined : 'Nem todos os lotes têm este certificado'}>
                <input type="checkbox" disabled={!emTodos} checked={vendidos.includes(c.id)} onChange={(ev) => setVendidos(ev.target.checked ? [...vendidos, c.id] : vendidos.filter((x) => x !== c.id))} /> {c.codigo}
              </label>
            );
          })}
          {!todos.length ? <span className="text-[13px] text-tinta-2">Lotes convencionais.</span> : null}
        </div>
        <p className="text-[12.5px] text-tinta-2">{vendidos.length ? `Vendido como ${todos.filter((c) => vendidos.includes(c.id)).map((c) => c.codigo).join(' + ')}.` : 'Vendido como convencional.'} {e.contrato.certificados.length ? `O contrato exige ${e.contrato.certificados.join(', ')}.` : ''}</p>
        {perde.length ? (
          <Campo rotulo="Motivo do rebaixamento *" dica={`${perde.map((p) => p.lote).join(', ')} perde(m) certificado (RN-28)`}><Entrada name="motivoRebaixamento" required minLength={5} /></Campo>
        ) : null}
      </fieldset>
      <Botao type="submit" className="justify-self-start" disabled={pendente}>Registrar carregamento</Botao>
    </form>
  );
}

function Notas({ e, pode, pendente, rodar }: { e: E; pode: boolean; pendente: boolean; rodar: Rodar }) {
  const editavel = pode && e.status === 'ABERTO';
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <h2 className="font-display text-[17px] font-semibold">3. Notas fiscais</h2>
      <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
        <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Nota</th><th>Emissão</th><th>Chave</th><th className="text-right">kg</th><th className="text-right">sacas</th><th /></tr></thead>
        <tbody>
          {e.notas.map((n) => (
            <tr key={n.id} className="border-t border-linha">
              <td className="py-1.5 font-mono">{n.numero}{n.serie ? `-${n.serie}` : ''}</td><td>{data(n.dataEmissao)}</td><td className="font-mono text-[11px] break-all">{n.chave ?? '—'}</td>
              <td className="text-right font-mono">{num(n.kg)}</td><td className="text-right font-mono">{num(n.sacas)}</td>
              <td className="text-right">{editavel ? <Botao tamanho="pequeno" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoCancelarNota(e.id, n.id))}>Cancelar</Botao> : null}</td>
            </tr>
          ))}
          {!e.notas.length ? <tr><td colSpan={6} className="py-3 text-tinta-2">Nenhuma nota.</td></tr> : null}
        </tbody>
      </table>
      {editavel ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget); const form = ev.currentTarget;
          const v = (k: string) => String(f.get(k) ?? '').trim();
          rodar(() => acaoNota(e.id, { numeroNota: v('numero'), serie: v('serie') || null, chaveNfe: v('chave') || null, dataEmissao: v('data'), qtdKg: paraApi(v('kg')) }), () => form.reset());
        }}>
          <Campo rotulo="Número"><Entrada name="numero" required className="w-28" /></Campo>
          <Campo rotulo="Série"><Entrada name="serie" className="w-16" /></Campo>
          <Campo rotulo="Chave NF-e (44 dígitos)"><Entrada name="chave" inputMode="numeric" className="w-[22rem] max-w-full" /></Campo>
          <Campo rotulo="Emissão"><Entrada type="date" name="data" defaultValue={hoje()} required /></Campo>
          <Campo rotulo="kg"><Entrada name="kg" inputMode="decimal" required defaultValue={kgPt(e.kgEntradas)} className="w-28" /></Campo>
          <Botao type="submit" disabled={pendente}>Adicionar nota</Botao>
        </form>
      ) : null}
    </section>
  );
}

function Logistica({ e, pode, pendente, rodar }: { e: E; pode: boolean; pendente: boolean; rodar: Rodar }) {
  const l = e.logistica;
  const finalizado = e.status === 'FINALIZADO';
  if (!pode && !l.container && !l.numeroDds) return null;
  return (
    <form className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4" onSubmit={(ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      const v = (k: string) => String(f.get(k) ?? '').trim() || null;
      rodar(() => acaoLogistica(e.id, finalizado ? { numeroDds: v('dds') } : { dataVenda: v('dataVenda'), container: v('container'), navio: v('navio'), booking: v('booking'), numeroDds: v('dds') }));
    }}>
      <h2 className="font-display text-[17px] font-semibold">Logística e DDS</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Campo rotulo="Data da venda"><Entrada type="date" name="dataVenda" defaultValue={l.dataVenda ?? ''} disabled={!pode || finalizado} /></Campo>
        <Campo rotulo="Container"><Entrada name="container" defaultValue={l.container ?? ''} disabled={!pode || finalizado} /></Campo>
        <Campo rotulo="Navio"><Entrada name="navio" defaultValue={l.navio ?? ''} disabled={!pode || finalizado} /></Campo>
        <Campo rotulo="Booking"><Entrada name="booking" defaultValue={l.booking ?? ''} disabled={!pode || finalizado} /></Campo>
        <Campo rotulo="Nº da DDS" dica={finalizado ? 'trava a reabertura (RN-14)' : undefined}><Entrada name="dds" defaultValue={l.numeroDds ?? ''} disabled={!pode || e.status === 'ESTORNADO'} /></Campo>
      </div>
      {pode && e.status !== 'ESTORNADO' ? <Botao type="submit" variante="secundario" className="justify-self-start" disabled={pendente}>Salvar logística</Botao> : null}
    </form>
  );
}

function Dossie({ e, pode, pendente, rodar }: { e: E; pode: boolean; pendente: boolean; rodar: Rodar }) {
  const d = e.dossie;
  const base = `/api/embarques/${e.id}`;
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">Dossiê EUDR e certificações</h2>
        {d ? <span className="text-[12.5px] text-tinta-2">versão {d.versao}{d.congelado ? ' · congelada na finalização' : ''} · SHA-256 <span className="font-mono">{d.hash.slice(0, 12)}…</span></span> : null}
        {pode && e.status === 'ABERTO' ? <Botao className="ml-auto" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoGerarDossie(e.id))}>{d ? 'Gerar de novo' : 'Gerar dossiê'}</Botao> : null}
      </div>
      {!d ? <p className="text-[13px] text-tinta-2">Gere o dossiê para conferir a origem por talhão, as checagens e os certificados antes de finalizar.</p> : (
        <>
          {d.pendencias.length ? (
            <Aviso tipo={e.contrato.exigeEudr ? 'erro' : 'aviso'}>
              {d.pendencias.length} pendência(s){e.contrato.exigeEudr && e.status === 'ABERTO' ? ': o embarque não finaliza assim (RN-18).' : '.'}
              <ul className="mt-1 list-disc pl-5">{d.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
            </Aviso>
          ) : <Aviso tipo="ok">Sem pendências.</Aviso>}
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Talhão</th><th className="text-right">kg</th><th className="text-right">%</th><th>Checagem</th></tr></thead>
            <tbody>
              {d.talhoes.map((t) => (
                <tr key={t.fazenda + t.talhao} className="border-t border-linha">
                  <td className="py-1.5 font-mono">{t.fazenda}/{t.talhao}</td><td className="text-right font-mono">{num(t.kg)}</td>
                  <td className="text-right font-mono">{new Decimal(t.percentual).times(100).toFixed(2).replace('.', ',')}%</td><td>{t.checagem ? t.checagem.replace('_', ' ').toLowerCase() : 'sem checagem'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <a href={`${base}/dossie.pdf`} target="_blank" rel="noreferrer" className={estiloBotao({ variante: 'secundario' })}><FileText className="size-4" /> Dossiê (PDF)</a>
            <a href={`${base}/dossie.geojson`} className={estiloBotao({ variante: 'secundario' })}><Mapa className="size-4" /> GeoJSON</a>
            <a href={`${base}/dossie.csv`} className={estiloBotao({ variante: 'secundario' })}><Sheet className="size-4" /> CSV</a>
          </div>
        </>
      )}
    </section>
  );
}

function Pacotes({ e, pode, pendente, rodar }: { e: E; pode: boolean; pendente: boolean; rodar: Rodar }) {
  const base = `/api/embarques/${e.id}`;
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">Pacote para a exportadora</h2>
        <span className="text-[12.5px] text-tinta-2">Gerado na finalização (RN-30). Envie os dois arquivos; o conteúdo não muda.</span>
        {pode && e.status === 'FINALIZADO' ? <span className="ml-auto"><ConfirmarComMotivo rotulo="Reemitir em nova versão" titulo="Reemitir o pacote?" explicacao="Gera uma nova versão com o estado atual; o hash muda. As versões anteriores ficam guardadas." perigo={false} pendente={pendente} aoConfirmar={(m) => rodar(() => acaoReemitirPacote(e.id, m))} /></span> : null}
      </div>
      <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
        <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Versão</th><th>Emitido</th><th>SHA-256</th><th>Motivo</th><th /></tr></thead>
        <tbody>
          {e.pacotes.map((p) => (
            <tr key={p.versao} className="border-t border-linha align-top">
              <td className="py-2 font-mono font-semibold">v{p.versao}</td><td className="py-2">{dataHora(p.geradoEm)}</td>
              <td className="py-2 font-mono text-[11.5px] break-all">{p.hash}</td><td className="py-2">{p.motivo ?? '—'}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <a href={`${base}/pacote.json?versao=${p.versao}`} className="mr-3 inline-flex items-center gap-1 text-destaque hover:underline"><FileJson className="size-4" /> .json</a>
                <a href={`${base}/pacote.geojson?versao=${p.versao}`} className="inline-flex items-center gap-1 text-destaque hover:underline"><Mapa className="size-4" /> .geojson</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
