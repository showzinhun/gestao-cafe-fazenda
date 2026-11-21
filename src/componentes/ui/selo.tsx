import { cn } from '@/lib/cn';

/** Situação com ponto colorido (§12). Verde/amarelo/vermelho só para situação. */
export function Selo({ tipo = 'ok', children }: { tipo?: 'ok' | 'aviso' | 'erro' | 'neutro'; children: React.ReactNode }) {
  const cor = { ok: 'bg-ok-fundo text-ok', aviso: 'bg-aviso-fundo text-aviso', erro: 'bg-erro-fundo text-erro', neutro: 'bg-linha text-tinta-2' }[tipo];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold whitespace-nowrap', cor)}>
      <span className="size-1.5 rounded-full bg-current opacity-85" aria-hidden />
      {children}
    </span>
  );
}
