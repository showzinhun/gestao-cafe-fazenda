'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { acaoReservarContrato } from '@/app/(app)/comercial/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Entrada } from '@/componentes/ui/campo';
import { Selecao } from '@/componentes/ui/selecao';
import { Aviso } from '@/componentes/ui/aviso';
import { num, paraApi } from '@/lib/formatos';

export type LoteLivre = { id: string; codigo: string; livre: string; peneira: string | null; certificados: string[]; etapa: string };
export type ContratoAberto = { id: string; codigo: string; cliente: string; aReservar: string };

/**
 * Reserva kg de lotes livres para um contrato (§9.3, RN-07/RN-17). Usado no detalhe do contrato e no Estoque.
 * As regras ficam no serviço; aqui só montamos a lista e mostramos erros e avisos de amostra.
 */
export function ReservarLotes({ lotes, contratos, contratoFixo, aoConcluir }: { lotes: LoteLivre[]; contratos?: ContratoAberto[]; contratoFixo?: string; aoConcluir?: () => void }) {
  const router = useRouter();
  const [contrato, setContrato] = useState(contratoFixo ?? contratos?.[0]?.id ?? '');
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(contratoFixo ? [] : lotes.map((l) => [l.id, new Decimal(l.livre).toString().replace('.', ',')])));
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'aviso'; texto: string }[]>([]);
  const [pendente, iniciar] = useTransition();
  const itens = lotes.filter((l) => (qtd[l.id] ?? '').trim()).map((l) => ({ loteId: l.id, quantidade: paraApi(qtd[l.id] ?? '') }));
  let total = new Decimal(0);
  try { total = itens.reduce((s, i) => s.plus(i.quantidade), new Decimal(0)); } catch { /* valor digitado incompleto */ }
  const atual = contratos?.find((c) => c.id === contrato);
  return (
    <div className="grid gap-3">
      {!contratoFixo ? (
        <label className="grid max-w-md gap-1 text-[13px] font-medium">Contrato
          <Selecao value={contrato} onChange={(e) => setContrato(e.target.value)} aria-label="Contrato">
            {contratos?.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.cliente} · falta reservar {num(c.aReservar)} kg</option>)}
          </Selecao>
        </label>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13px] [&_td]:px-2 [&_th]:px-2">
          <thead><tr className="text-left font-mono text-[10.5px] tracking-wider text-tinta-2 uppercase"><th className="py-1.5">Lote</th><th>Etapa</th><th>Peneira</th><th>Certificação</th><th className="text-right">Livre (kg)</th><th className="w-40 text-right">Reservar (kg)</th></tr></thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id} className="border-t border-linha">
                <td className="py-1.5 font-mono font-semibold">{l.codigo}</td><td>{l.etapa}</td><td>{l.peneira ? `P${l.peneira}` : '—'}</td><td>{l.certificados.join(', ') || '—'}</td>
                <td className="text-right font-mono">{num(l.livre)}</td>
                <td className="text-right"><Entrada className="h-8 text-right" inputMode="decimal" aria-label={`Reservar do lote ${l.codigo}`} value={qtd[l.id] ?? ''} onChange={(e) => setQtd({ ...qtd, [l.id]: e.target.value })} /></td>
              </tr>
            ))}
            {!lotes.length ? <tr><td colSpan={6} className="py-3 text-tinta-2">Nenhum lote com saldo livre em kg.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-tinta-2">Total: <b className="font-mono text-tinta">{num(total.toFixed(3))} kg</b>{atual ? <> · falta reservar no contrato: <b className="font-mono">{num(atual.aReservar)} kg</b></> : null}</p>
      {msg.map((m, i) => <Aviso key={i} tipo={m.tipo}>{m.texto}</Aviso>)}
      <Botao className="justify-self-start" disabled={!contrato || !itens.length || pendente} onClick={() => iniciar(async () => {
        const r = await acaoReservarContrato(contrato, itens);
        if (!r.ok) return setMsg([{ tipo: 'erro', texto: r.erro }]);
        setMsg([{ tipo: 'ok', texto: r.mensagem ?? '' }, ...(r.avisos ?? []).map((a) => ({ tipo: 'aviso' as const, texto: a }))]);
        setQtd({});
        router.refresh();
        aoConcluir?.();
      })}>{pendente ? 'Reservando…' : 'Reservar'}</Botao>
    </div>
  );
}
