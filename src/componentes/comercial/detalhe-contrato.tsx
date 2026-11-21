'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acaoAmostra, acaoAssinarContrato, acaoCancelarContrato, acaoCancelarFixacao, acaoCancelarReservaContrato, acaoCriarEmbarque, acaoFixar, acaoRetornoAmostra } from '@/app/(app)/comercial/acoes';
import type { obterContrato } from '@/servicos/contratos';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { Indicador } from '@/componentes/ui/cartao';
import { Selo } from '@/componentes/ui/selo';
import { Abas, ConfirmarComMotivo, Documentos, SeloSituacao, num } from '@/componentes/operacao/comum';
import { SeloContrato } from './selo';
import { ReservarLotes, type LoteLivre } from './reservar-lotes';
import { paraApi, preco } from '@/lib/formatos';
import { formatarNumero } from '@/lib/formatacao';

type C = Awaited<ReturnType<typeof obterContrato>>;
type Aba = 'reservas' | 'fixacoes' | 'amostras' | 'embarques';
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const AMOSTRA: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  ENVIADA: { rotulo: 'Enviada', tipo: 'aviso' }, APROVADA: { rotulo: 'Aprovada', tipo: 'ok' }, REPROVADA: { rotulo: 'Reprovada', tipo: 'erro' }, SEM_RETORNO: { rotulo: 'Sem retorno', tipo: 'neutro' },
};

/** Detalhe do contrato (§9.3): saldos derivados, reservas, fixações, amostras e embarques. */
export function DetalheContrato({ c, lotes, podeEditar, podeEmbarque }: { c: C; lotes: LoteLivre[]; podeEditar: boolean; podeEmbarque: boolean }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('reservas');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [reservando, setReservando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const ativo = c.status === 'ASSINADO' || c.status === 'EM_EXECUCAO';
  const moeda = c.moeda === 'USD' ? 'US$' : 'R$';
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string; dados?: unknown }>, depois?: (d: unknown) => void) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) { if (depois) depois(r.dados); else router.refresh(); }
    });
  const ativas = c.reservas.filter((r) => r.status === 'ATIVA');
  return (
    <>
      <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloContrato status={c.status} />
          <b className="text-[15px]">{c.cliente.nome}</b>
          <span className="text-[13px] text-tinta-2">{c.cliente.cpfCnpj}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {podeEditar && c.status === 'RASCUNHO' ? <Botao disabled={pendente} onClick={() => rodar(() => acaoAssinarContrato(c.id))}>Assinar contrato</Botao> : null}
            {podeEmbarque && ativo ? <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoCriarEmbarque(c.id), (id) => router.push(`/embarques/${id}`))}>Novo embarque</Botao> : null}
            {podeEditar && c.status !== 'CANCELADO' && c.status !== 'CONCLUIDO' ? (
              <ConfirmarComMotivo rotulo="Cancelar contrato" titulo="Cancelar o contrato?" explicacao="Só é possível sem reservas ativas nem embarques (RN-07)." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoCancelarContrato(c.id, m))} />
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-4 gap-y-2 text-[13px]">
          <Item r="Quantidade" v={`${num(c.quantidadeSacas)} sacas${Number(c.toleranciaPerc) ? ` ± ${formatarNumero(String(Number(c.toleranciaPerc) * 100), 1)}%` : ''}`} />
          <Item r="Preço" v={c.tipoPreco === 'FIXO' ? `${preco(c.precoPorSaca, c.moeda)}/sc` : `A fixar${c.diferencial ? ` · dif. ${preco(c.diferencial, c.moeda)}` : ''}${c.referenciaBolsa ? ` · ${c.referenciaBolsa}` : ''}`} />
          <Item r="Prazo de embarque" v={c.prazoEmbarqueInicio && c.prazoEmbarqueFim ? `${data(c.prazoEmbarqueInicio)} a ${data(c.prazoEmbarqueFim)}` : c.prazoEmbarqueFim ? `até ${data(c.prazoEmbarqueFim)}` : c.prazoEmbarqueInicio ? `a partir de ${data(c.prazoEmbarqueInicio)}` : '—'} />
          <Item r="Exige" v={[...c.certificados.map((x) => x.codigo), c.exigeEudr ? 'EUDR' : null].filter(Boolean).join(', ') || '—'} />
          <Item r="Peneira mínima" v={c.peneiraMin ? `P${c.peneiraMin.codigo}` : 'Qualquer'} />
          <Item r="Safra" v={c.safra ?? '—'} />
          <Item r="Incoterm / destino" v={[c.incoterm, c.destinoPais].filter(Boolean).join(' · ') || '—'} />
          <Item r="Padrão" v={c.descricaoPadrao || '—'} />
        </dl>
        {c.motivoCancelamento ? <Aviso tipo="erro">Cancelado: {c.motivoCancelamento}</Aviso> : null}
      </section>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Indicador valor={num(c.saldos.kg)} rotulo="kg do contrato" />
        <Indicador valor={num(c.saldos.reservado)} rotulo="kg reservados" cor="ouro" />
        <Indicador valor={num(c.saldos.embarcado)} rotulo="kg embarcados" cor="ok" />
        <Indicador valor={num(c.saldos.saldo)} rotulo="saldo a embarcar (kg)" cor="erro" />
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <Abas<Aba> rotulo="Seções do contrato" atual={aba} aoTrocar={setAba} abas={[
        { id: 'reservas', rotulo: 'Reservas', conta: ativas.length },
        ...(c.tipoPreco === 'A_FIXAR' ? [{ id: 'fixacoes' as const, rotulo: 'Fixações', conta: c.fixacoes.length }] : []),
        { id: 'amostras', rotulo: 'Amostras', conta: c.amostras.length },
        { id: 'embarques', rotulo: 'Embarques', conta: c.embarques.length },
      ]} />

      {aba === 'reservas' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[17px] font-semibold">Lotes reservados</h2>
            <span className="text-[13px] text-tinta-2">falta reservar {num(c.saldos.aReservar)} kg</span>
            {podeEditar && ativo && !reservando ? <Botao className="ml-auto" variante="secundario" onClick={() => setReservando(true)}>Reservar lotes</Botao> : null}
          </div>
          {reservando ? (
            <div className="grid gap-2 rounded-lg border border-linha bg-superficie-2 p-3">
              <ReservarLotes lotes={lotes} contratoFixo={c.id} />
              <Botao variante="secundario" className="justify-self-start" onClick={() => setReservando(false)}>Fechar</Botao>
            </div>
          ) : null}
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Lote</th><th>Peneira</th><th className="text-right">kg</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {c.reservas.map((r) => (
                <tr key={r.id} className="border-t border-linha align-top">
                  <td className="py-1.5"><Link href={`/rastreabilidade/lote/${r.loteId}`} className="font-mono font-semibold text-destaque hover:underline">{r.lote}</Link></td>
                  <td>{r.peneira ? `P${r.peneira}` : '—'}</td><td className="text-right font-mono">{num(r.quantidade)}</td>
                  <td>{r.status === 'ATIVA' ? <Selo tipo="aviso">Reservada</Selo> : <Selo tipo="neutro">Programada</Selo>}</td>
                  <td className="py-1 text-right">{podeEditar && r.status === 'ATIVA' ? <ConfirmarComMotivo rotulo="Cancelar" titulo={`Cancelar a reserva do lote ${r.lote}?`} explicacao="Os kg voltam a ficar livres." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoCancelarReservaContrato(r.id, m))} /> : null}</td>
                </tr>
              ))}
              {!c.reservas.length ? <tr><td colSpan={5} className="py-3 text-tinta-2">Nenhum lote reservado.</td></tr> : null}
            </tbody>
          </table>
          <Documentos csv={{ nome: `reservas-${c.codigo}`, linhas: [['Lote', 'Peneira', 'kg', 'Situação'], ...c.reservas.map((r) => [r.lote, r.peneira, r.quantidade, r.status])] }} />
        </section>
      ) : null}

      {aba === 'fixacoes' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Fixações de preço</h2>
          <p className="text-[13px] text-tinta-2">Fixadas: <b>{num(c.resumoFixacoes.fixadas)} sc</b> · preço médio: <b>{c.resumoFixacoes.precoMedio ? preco(c.resumoFixacoes.precoMedio, c.moeda) : '—'}</b> · a fixar: <b>{num(c.resumoFixacoes.aFixar)} sc</b></p>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Data</th><th className="text-right">Sacas</th><th className="text-right">Preço/sc</th><th>Obs.</th><th /></tr></thead>
            <tbody>
              {c.fixacoes.map((f) => (
                <tr key={f.id} className="border-t border-linha">
                  <td className="py-1.5">{data(f.data)}</td><td className="text-right font-mono">{num(f.sacas)}</td><td className="text-right font-mono">{preco(f.precoPorSaca, c.moeda)}</td><td>{f.observacao}</td>
                  <td className="text-right">{podeEditar && ativo ? <Botao tamanho="pequeno" variante="secundario" disabled={pendente} onClick={() => rodar(() => acaoCancelarFixacao(f.id))}>Cancelar</Botao> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {podeEditar && c.status !== 'CANCELADO' ? (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget); const form = e.currentTarget;
              rodar(() => acaoFixar(c.id, { data: String(f.get('data')), sacas: paraApi(String(f.get('sacas'))), precoPorSaca: paraApi(String(f.get('preco'))), observacao: String(f.get('obs') ?? '') }), () => { form.reset(); router.refresh(); });
            }}>
              <Campo rotulo="Data"><Entrada type="date" name="data" defaultValue={hoje()} required /></Campo>
              <Campo rotulo="Sacas"><Entrada name="sacas" inputMode="decimal" required className="w-28" /></Campo>
              <Campo rotulo={`Preço/sc (${moeda})`}><Entrada name="preco" inputMode="decimal" required className="w-32" /></Campo>
              <Campo rotulo="Observação"><Entrada name="obs" /></Campo>
              <Botao type="submit" disabled={pendente}>Registrar fixação</Botao>
            </form>
          ) : null}
        </section>
      ) : null}

      {aba === 'amostras' ? <Amostras c={c} lotes={lotes} podeEditar={podeEditar} pendente={pendente} rodar={rodar} /> : null}

      {aba === 'embarques' ? (
        <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
          <h2 className="font-display text-[17px] font-semibold">Embarques</h2>
          <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
            <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Embarque</th><th className="text-right">kg</th><th>Carregado</th><th>Situação</th></tr></thead>
            <tbody>
              {c.embarques.map((e) => (
                <tr key={e.id} className="border-t border-linha">
                  <td className="py-1.5"><Link href={`/embarques/${e.id}`} className="font-mono font-semibold text-destaque hover:underline">{e.rotulo}</Link></td>
                  <td className="text-right font-mono">{num(e.kg)}</td><td>{e.carregado ? 'sim' : 'não'}</td><td><SeloSituacao status={e.status} /></td>
                </tr>
              ))}
              {!c.embarques.length ? <tr><td colSpan={4} className="py-3 text-tinta-2">Nenhum embarque.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

function Item({ r, v }: { r: string; v: string }) {
  return <div><dt className="text-[11.5px] text-tinta-2">{r}</dt><dd className="font-medium">{v}</dd></div>;
}

function Amostras({ c, lotes, podeEditar, pendente, rodar }: { c: C; lotes: LoteLivre[]; podeEditar: boolean; pendente: boolean; rodar: (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, depois?: () => void) => void }) {
  const router = useRouter();
  const opcoes = [...new Map([...c.reservas.map((r) => [r.loteId, r.lote] as const), ...lotes.map((l) => [l.id, l.codigo] as const)]).entries()];
  return (
    <section className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <h2 className="font-display text-[17px] font-semibold">Amostras enviadas ao cliente</h2>
      <table className="w-full border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
        <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Lote</th><th>Envio</th><th className="text-right">Peso (g)</th><th>Retorno</th><th>Comentário</th><th /></tr></thead>
        <tbody>
          {c.amostras.map((a) => {
            const s = AMOSTRA[a.status] ?? { rotulo: a.status, tipo: 'neutro' as const };
            return (
              <tr key={a.id} className="border-t border-linha">
                <td className="py-1.5 font-mono font-semibold">{a.lote}</td><td>{data(a.dataEnvio)}</td><td className="text-right font-mono">{a.pesoG}</td>
                <td><Selo tipo={s.tipo}>{s.rotulo}</Selo> {data(a.dataRetorno) !== '—' ? data(a.dataRetorno) : ''}</td><td>{a.comentario}</td>
                <td className="text-right">
                  {podeEditar && a.status === 'ENVIADA' ? (
                    <span className="inline-flex gap-1">
                      <Botao tamanho="pequeno" disabled={pendente} onClick={() => rodar(() => acaoRetornoAmostra(a.id, { status: 'APROVADA', dataRetorno: hoje() }))}>Aprovada</Botao>
                      <Botao tamanho="pequeno" variante="perigo" disabled={pendente} onClick={() => rodar(() => acaoRetornoAmostra(a.id, { status: 'REPROVADA', dataRetorno: hoje() }))}>Reprovada</Botao>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {!c.amostras.length ? <tr><td colSpan={6} className="py-3 text-tinta-2">Nenhuma amostra.</td></tr> : null}
        </tbody>
      </table>
      {podeEditar && c.status !== 'CANCELADO' ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget); const form = e.currentTarget;
          rodar(() => acaoAmostra({ contratoId: c.id, clienteId: c.cliente.id, loteId: String(f.get('loteId')), pesoG: Number(f.get('peso')), dataEnvio: String(f.get('data')), transportadora: null, rastreio: String(f.get('rastreio') ?? '') || null }), () => { form.reset(); router.refresh(); });
        }}>
          <Campo rotulo="Lote"><Selecao name="loteId" required>{opcoes.map(([id, cod]) => <option key={id} value={id}>{cod}</option>)}</Selecao></Campo>
          <Campo rotulo="Peso (g)"><Entrada name="peso" inputMode="numeric" defaultValue="300" required className="w-24" /></Campo>
          <Campo rotulo="Envio"><Entrada type="date" name="data" defaultValue={hoje()} required /></Campo>
          <Campo rotulo="Rastreio"><Entrada name="rastreio" /></Campo>
          <Botao type="submit" disabled={pendente || !opcoes.length}>Registrar amostra</Botao>
        </form>
      ) : null}
    </section>
  );
}
