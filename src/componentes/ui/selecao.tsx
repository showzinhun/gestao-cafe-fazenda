import { cn } from '@/lib/cn';

export function Selecao({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-10 w-full rounded-lg border border-linha bg-superficie px-3 text-sm text-tinta outline-none focus:border-destaque focus:ring-3 focus:ring-destaque/20', className)}
      {...props}
    >
      {children}
    </select>
  );
}
