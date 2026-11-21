import { cn } from '@/lib/cn';

/** Faixa de mensagem (§12): ok, aviso ou erro, sempre na própria página. */
export function Aviso({ tipo = 'ok', children, className }: { tipo?: 'ok' | 'aviso' | 'erro'; children: React.ReactNode; className?: string }) {
  const cor = { ok: 'bg-ok-fundo text-ok', aviso: 'bg-aviso-fundo text-aviso', erro: 'bg-erro-fundo text-erro' }[tipo];
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={cn('rounded-[10px] px-3 py-2.5 text-[13px]', cor, className)}>
      {children}
    </div>
  );
}
