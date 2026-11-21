import { cn } from '@/lib/cn';

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[13px] font-medium', className)}>
      <span>{rotulo}</span>
      {dica ? <small className="font-normal text-tinta-2">{dica}</small> : null}
      <span className="mt-auto">{children}</span>
    </label>
  );
}

export function Entrada({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-linha bg-superficie px-3 text-sm text-tinta outline-none focus:border-destaque focus:ring-3 focus:ring-destaque/20',
        className,
      )}
      {...props}
    />
  );
}
