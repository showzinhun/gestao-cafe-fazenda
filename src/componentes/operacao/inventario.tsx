'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { acaoAbrirInventario, acaoAprovarInventario, acaoCancelarInventario, acaoContagem } from '@/app/(app)/operacao/acoes';
import { Botao, estiloBotao } from '@/componentes/ui/botao';
import { Entrada } from '@/componentes/ui/campo';
import { Aviso } from '@/componentes/ui/aviso';
import { paraApi } from '@/lib/formatos';
import { ConfirmarComMotivo, Documentos, SeloSituacao, dataHora, num } from './comum';

export function NovoInventario({ locais }: { locais: { valor: string; rotulo: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="sombra grid gap-3 rounded-xl border border-linha bg-superficie p-4">
      <b>Novo inventário: escolha os locais a contar</b>
      <div className="flex flex-wrap gap-2">
        {locais.map((l) => (
          <label key={l.valor} className="flex items-center gap-1.5 rounded-lg border border-linha px-2.5 py-1.5 text-[13px]">
            <input type="checkbox" checked={sel.includes(l.valor)} onChange={(e) => setSel(e.target.checked ? [...sel, l.valor] : sel.filter((x) => x !== l.valor))} /> {l.rotulo}
          </label>
        ))}
      </div>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      <Botao className="justify-self-start" disabled={!sel.length || pendente} onClick={() => iniciar(async () => {
        const r = await acaoAbrirInventario(sel);
        if (!r.ok) return setErro(r.erro);
        router.push(`/estoque/inventarios/${r.dados}`);
      })}>Abrir inventário</Botao>
    </div>
  );
}

type Inv = {
  id: string; numero: number; status: string; dataContagem: string; aprovadoEm: string | null; motivoCancelamento: string | null;
  locais: { id: string; codigo: string; nome: string }[];
  itens: { id: string; loteId: string; localId: string; qtdSistema: string; qtdContada: string | null; diferenca: string | null; ajusteMovimentoId: string | null; lote: { codigo: string; unidade: string } }[];
};

export function DetalheInventario({ inv, podeContar, podeAprovar }: { inv: Inv; podeContar: boolean; podeAprovar: boolean }) {
  const router = useRouter();
  const [contagem, setContagem] = useState<Record<string, string>>(() => Object.fromEntries(inv.itens.map((i) => [i.id, i.qtdContada ? new Decimal(i.qtdContada).toString().replace('.', ',') : ''])));
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const local = new Map(inv.locais.map((l) => [l.id, l.codigo]));
  const editavel = podeContar && (inv.status === 'ABERTO' || inv.status === 'CONTADO');
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => {
      const r = await f();
      setMsg(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro ?? '' });
      if (r.ok) router.refresh();
    });
  const diferenca = (i: Inv['itens'][number]) => {
    const t = (contagem[i.id] ?? '').trim();
    if (!t) return null;
    try {
      return new Decimal(paraApi(t)).minus(i.qtdSistema);
    } catch {
      return null;
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <SeloSituacao status={inv.status} />
        <span className="text-[13px] text-tinta-2">Locais {inv.locais.map((l) => l.codigo).join(', ')} · aberto em {dataHora(inv.dataContagem)}{inv.aprovadoEm ? ` · aprovado em ${dataHora(inv.aprovadoEm)}` : ''}</span>
        <div className="ml-auto flex flex-wrap items-start gap-2">
          <Link href="/estoque/inventarios" className={estiloBotao({ variante: 'secundario' })}>Voltar</Link>
          <Documentos csv={{ nome: `inventario-${inv.numero}.csv`, linhas: [['Lote', 'Local', 'Sistema', 'Contado', 'Diferença'], ...inv.itens.map((i) => [i.lote.codigo, local.get(i.localId) ?? '', i.qtdSistema, i.qtdContada, i.diferenca])] }} />
          {podeAprovar && inv.status === 'CONTADO' ? <Botao disabled={pendente} onClick={() => rodar(() => acaoAprovarInventario(inv.id))}>Aprovar e ajustar estoque</Botao> : null}
          {podeContar && (inv.status === 'ABERTO' || inv.status === 'CONTADO') ? <ConfirmarComMotivo rotulo="Cancelar inventário" titulo="Cancelar o inventário?" explicacao="Nada muda no estoque." pendente={pendente} aoConfirmar={(m) => rodar(() => acaoCancelarInventario(inv.id, m))} /> : null}
        </div>
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      {inv.motivoCancelamento ? <Aviso tipo="erro">Cancelado: {inv.motivoCancelamento}</Aviso> : null}
      {inv.status === 'CONTADO' && !podeAprovar ? <Aviso tipo="aviso">Contagem completa. Falta a aprovação de quem tem a permissão.</Aviso> : null}
      <div className="sombra overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-superficie-2 text-left font-mono text-[11px] tracking-wider text-tinta-2 uppercase">
              <th className="px-3 py-3">Lote</th><th className="px-3 py-3">Local</th><th className="px-3 py-3 text-right">Sistema</th><th className="px-3 py-3">Contado</th><th className="px-3 py-3 text-right">Diferença</th><th className="px-3 py-3">Ajuste</th>
            </tr>
          </thead>
          <tbody>
            {inv.itens.map((i) => {
              const d = diferenca(i);
              return (
                <tr key={i.id} className="border-t border-linha">
                  <td className="px-3 py-2.5 font-mono">{i.lote.codigo}</td>
                  <td className="px-3 py-2.5">{local.get(i.localId)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{num(i.qtdSistema)}</td>
                  <td className="px-3 py-2.5">
                    {editavel ? <Entrada aria-label={`Contado ${i.lote.codigo}`} inputMode="decimal" className="h-8 w-32" value={contagem[i.id] ?? ''} onChange={(e) => setContagem({ ...contagem, [i.id]: e.target.value })} /> : <span className="font-mono">{num(i.qtdContada)}</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${d && !d.isZero() ? (d.isNegative() ? 'text-erro' : 'text-ok') : ''}`}>{d ? num(d.toString()) : '—'}</td>
                  <td className="px-3 py-2.5">{i.ajusteMovimentoId ? <Link className="text-destaque hover:underline" href={`/movimentos/${i.ajusteMovimentoId}`}>ver ajuste</Link> : '—'}</td>
                </tr>
              );
            })}
            {!inv.itens.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-tinta-2">Nenhum lote com saldo nesses locais.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {editavel && inv.itens.length ? (
        <Botao className="justify-self-start" disabled={pendente} onClick={() => rodar(() => acaoContagem(inv.id, inv.itens.filter((i) => (contagem[i.id] ?? '').trim()).map((i) => ({ itemId: i.id, qtdContada: paraApi(contagem[i.id]!) }))))}>Salvar contagem</Botao>
      ) : null}
    </>
  );
}
