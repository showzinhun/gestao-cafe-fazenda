import { cn } from '@/lib/cn';

export function Cartao({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sombra rounded-xl border border-linha bg-superficie p-5', className)} {...props} />;
}

/** Indicador com faixa de cor à esquerda (§12). */
export function Indicador({ valor, rotulo, cor = 'destaque' }: { valor: React.ReactNode; rotulo: string; cor?: 'destaque' | 'ouro' | 'ok' | 'erro' }) {
  const faixa = { destaque: 'bg-destaque', ouro: 'bg-ouro', ok: 'bg-ok', erro: 'bg-erro' }[cor];
  return (
    <div className="sombra relative overflow-hidden rounded-xl border border-linha bg-superficie py-3.5 pr-4 pl-5">
      <span className={cn('absolute inset-y-0 left-0 w-1', faixa)} aria-hidden />
      <b className="block font-mono text-[22px] leading-tight font-semibold">{valor}</b>
      <span className="text-[12.5px] text-tinta-2">{rotulo}</span>
    </div>
  );
}
