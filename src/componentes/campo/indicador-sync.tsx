'use client';
import { CloudOff, RefreshCw } from 'lucide-react';
import { bancoCampo, useConsulta, useOnline } from '@/lib/campo-db';

/** Indicador do topo do app de campo: sinal e quantos apontamentos faltam sincronizar (§12 item 5). */
export function IndicadorSync({ empresaId }: { empresaId: string }) {
  const online = useOnline();
  const pendentes = useConsulta(async () => (await bancoCampo().registros.where({ empresaId, pendente: 1 }).count()) + (await bancoCampo().leituras.where({ empresaId, pendente: 1 }).count()), [empresaId], 0);
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px]" data-testid="indicador-sync">
      {online ? <RefreshCw className="size-3.5" /> : <CloudOff className="size-3.5" />}
      {!online ? 'Sem sinal' : pendentes ? `${pendentes} pendente(s)` : 'Em dia'}
    </span>
  );
}
