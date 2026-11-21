'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FileDown, Printer } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Entrada } from '@/componentes/ui/campo';
import { Selo } from '@/componentes/ui/selo';
import { cn } from '@/lib/cn';

export { dataHora, num, pct, un } from '@/lib/formatos';
import { dataHora } from '@/lib/formatos';

const SITUACAO: Record<string, { rotulo: string; tipo: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  ABERTO: { rotulo: 'Aberto', tipo: 'aviso' },
  PROCESSADO: { rotulo: 'Processado', tipo: 'ok' },
  FINALIZADO: { rotulo: 'Finalizado', tipo: 'ok' },
  ESTORNADO: { rotulo: 'Estornado', tipo: 'erro' },
  PARCIAL: { rotulo: 'Parcial', tipo: 'aviso' },
  UTILIZADO: { rotulo: 'Utilizado', tipo: 'neutro' },
  CONTADO: { rotulo: 'Contado', tipo: 'ok' },
  APROVADO: { rotulo: 'Aprovado', tipo: 'ok' },
  CANCELADO: { rotulo: 'Cancelado', tipo: 'neutro' },
};
export function SeloSituacao({ status, lote }: { status: string; lote?: boolean }) {
  const s = SITUACAO[status] ?? { rotulo: status, tipo: 'neutro' as const };
  return <Selo tipo={lote && status === 'ABERTO' ? 'ok' : s.tipo}>{lote && status === 'ABERTO' ? 'Disponível' : s.rotulo}</Selo>;
}

/** Abas internas como seletor em pílula (§12). */
export function Abas<T extends string>({ abas, atual, aoTrocar, rotulo }: { abas: { id: T; rotulo: string; conta?: number }[]; atual: T; aoTrocar: (a: T) => void; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="sombra inline-flex max-w-full flex-wrap gap-1 justify-self-start rounded-[11px] border border-linha bg-superficie p-1">
      {abas.map((a) => (
        <button key={a.id} type="button" aria-pressed={atual === a.id} onClick={() => aoTrocar(a.id)} className={cn('rounded-lg px-3.5 py-2 text-sm font-medium', atual === a.id ? 'bg-destaque-suave text-destaque' : 'text-tinta-2 hover:text-tinta')}>
          {a.rotulo}
          {a.conta != null ? <span className="ml-1.5 font-mono text-[11px] opacity-70">{a.conta}</span> : null}
        </button>
      ))}
    </nav>
  );
}

/** Etapas do movimento em linha do tempo: ✓ feita, anel na atual (§12). */
export function LinhaDoTempo({ passos }: { passos: { etapa: string; feita: boolean; quando: string | Date | null; quem: string | null }[] }) {
  const atual = passos.findIndex((p) => !p.feita);
  return (
    <ol className="sombra flex flex-wrap items-start gap-x-2 gap-y-3 rounded-xl border border-linha bg-superficie px-5 py-4" aria-label="Etapas do movimento">
      {passos.map((p, i) => (
        <li key={p.etapa + i} className="flex min-w-[150px] flex-1 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px]',
              p.feita ? (p.etapa === 'Estornado' ? 'border-erro bg-erro text-white' : 'border-destaque bg-destaque text-destaque-tinta') : i === atual ? 'border-ouro bg-superficie' : 'border-linha bg-superficie',
            )}
            aria-hidden
          >
            {p.feita ? <Check className="size-3.5" /> : null}
          </span>
          <span className="grid text-[13px]">
            <b className={cn(!p.feita && 'text-tinta-2')}>{p.etapa}</b>
            <span className="text-[12px] text-tinta-2">{p.feita ? `${dataHora(p.quando)}${p.quem ? ` · ${p.quem}` : ''}` : i === atual ? 'Pendente' : '—'}</span>
          </span>
          {i < passos.length - 1 ? <span className="mt-3 hidden h-px flex-1 bg-linha sm:block" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Menu "Documentos ▾" com impressões e exportações (§12). */
export function Documentos({ csv }: { csv?: { nome: string; linhas: (string | null)[][] } }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener('click', fora);
    return () => document.removeEventListener('click', fora);
  }, []);
  const baixar = () => {
    if (!csv) return;
    const texto = csv.linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: csv.nome });
    a.click();
    URL.revokeObjectURL(url);
    setAberto(false);
  };
  return (
    <div className="relative" ref={ref}>
      <Botao variante="secundario" aria-expanded={aberto} aria-haspopup="menu" onClick={() => setAberto((a) => !a)}>
        Documentos <ChevronDown className="size-4" />
      </Botao>
      {aberto ? (
        <div role="menu" className="sombra absolute right-0 z-40 mt-1.5 grid min-w-[210px] gap-0.5 rounded-xl border border-linha bg-superficie p-1.5">
          <button role="menuitem" type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-superficie-2" onClick={() => { setAberto(false); window.print(); }}>
            <Printer className="size-4" /> Imprimir
          </button>
          {csv ? (
            <button role="menuitem" type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-superficie-2" onClick={baixar}>
              <FileDown className="size-4" /> Exportar planilha (CSV)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Ação destrutiva com motivo, confirmada na própria página (nunca confirm()/prompt()). */
export function ConfirmarComMotivo({
  rotulo, titulo, explicacao, aoConfirmar, pendente, perigo = true,
}: { rotulo: string; titulo: string; explicacao?: string; aoConfirmar: (motivo: string) => void; pendente?: boolean; perigo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!aberto) return <Botao variante={perigo ? 'perigo' : 'secundario'} onClick={() => setAberto(true)}>{rotulo}</Botao>;
  return (
    <form
      className="grid w-full gap-2.5 rounded-xl border border-erro/40 bg-erro-fundo/40 p-4 sm:w-auto sm:min-w-[340px]"
      onSubmit={(e) => { e.preventDefault(); aoConfirmar(motivo); }}
    >
      <b className="text-[14px]">{titulo}</b>
      {explicacao ? <p className="text-[13px] text-tinta-2">{explicacao}</p> : null}
      <label className="grid gap-1 text-[13px] font-medium">
        Motivo
        <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={5} autoFocus />
      </label>
      <div className="flex gap-2">
        <Botao type="submit" variante={perigo ? 'perigo' : 'primario'} disabled={pendente || motivo.trim().length < 5}>Confirmar</Botao>
        <Botao type="button" variante="secundario" onClick={() => { setAberto(false); setMotivo(''); }}>Voltar</Botao>
      </div>
    </form>
  );
}
