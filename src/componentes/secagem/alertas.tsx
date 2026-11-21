'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCheck, Droplets, Info, Scale, Timer } from 'lucide-react';
import { acaoAlertaLido, acaoTodosLidos } from '@/app/(app)/operacao/acoes';
import { Botao } from '@/componentes/ui/botao';
import { Abas, dataHora } from '@/componentes/operacao/comum';
import { cn } from '@/lib/cn';

type Alerta = { id: string; tipo: string; entidade: string; entidadeId: string; mensagem: string; severidade: string; criadoEm: string; lido: boolean };
const TIPO: Record<string, { rotulo: string; icone: typeof Info }> = {
  PONTO_SECAGEM: { rotulo: 'Ponto de secagem', icone: Droplets },
  SECAGEM_LONGA: { rotulo: 'Secagem longa', icone: Timer },
  CAPACIDADE: { rotulo: 'Capacidade', icone: AlertTriangle },
  DIVERGENCIA_CARGA: { rotulo: 'Divergência da carga', icone: Scale },
};

/** Central de alertas (§7): lidos ficam guardados, nada é apagado. */
export function CentralAlertas({ alertas }: { alertas: Alerta[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<'novos' | 'todos'>('novos');
  const [pendente, iniciar] = useTransition();
  const lista = aba === 'novos' ? alertas.filter((a) => !a.lido) : alertas;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Abas<'novos' | 'todos'> rotulo="Filtro de alertas" atual={aba} aoTrocar={setAba} abas={[{ id: 'novos', rotulo: 'Não lidos', conta: alertas.filter((a) => !a.lido).length }, { id: 'todos', rotulo: 'Todos', conta: alertas.length }]} />
        {alertas.some((a) => !a.lido) ? <Botao variante="secundario" className="ml-auto" disabled={pendente} onClick={() => iniciar(async () => { await acaoTodosLidos(); router.refresh(); })}><CheckCheck className="size-4" /> Marcar todos como lidos</Botao> : null}
      </div>
      <ul className="grid gap-2">
        {lista.map((a) => {
          const t = TIPO[a.tipo] ?? { rotulo: a.tipo, icone: Info };
          return (
            <li key={a.id} className={cn('sombra flex flex-wrap items-start gap-3 rounded-xl border bg-superficie p-4', a.lido ? 'border-linha opacity-70' : a.tipo === 'PONTO_SECAGEM' ? 'border-ok' : 'border-aviso')}>
              <t.icone className={cn('mt-0.5 size-5', a.tipo === 'PONTO_SECAGEM' ? 'text-ok' : 'text-aviso')} aria-hidden />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-2 text-[12px] text-tinta-2"><b className="text-tinta">{t.rotulo}</b>{dataHora(a.criadoEm)}{a.lido ? ' · lido' : ''}</span>
                <span className="text-[14px]">{a.mensagem}</span>
              </div>
              <div className="flex gap-2">
                {a.entidade === 'movimento' ? <Link className="text-[13px] text-destaque hover:underline" href={`/movimentos/${a.entidadeId}${a.tipo.includes('SECAGEM') ? '?aba=leituras' : ''}`}>Abrir</Link> : null}
                {!a.lido ? <Botao variante="secundario" tamanho="pequeno" disabled={pendente} onClick={() => iniciar(async () => { await acaoAlertaLido(a.id); router.refresh(); })}>Marcar como lido</Botao> : null}
              </div>
            </li>
          );
        })}
        {!lista.length ? <li className="rounded-xl border border-linha bg-superficie p-8 text-center text-tinta-2">Nenhum alerta {aba === 'novos' ? 'novo' : ''}.</li> : null}
      </ul>
    </>
  );
}
