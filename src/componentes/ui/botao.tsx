import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

export const estiloBotao = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variante: {
        primario: 'bg-destaque text-destaque-tinta shadow-sm hover:brightness-110',
        secundario: 'border border-linha bg-superficie text-tinta hover:border-destaque hover:bg-destaque-suave',
        texto: 'text-destaque underline-offset-2 hover:underline',
      },
      tamanho: { normal: 'h-10 px-4', pequeno: 'h-8 px-3 text-[13px]' },
    },
    defaultVariants: { variante: 'primario', tamanho: 'normal' },
  },
);

export function Botao({ className, variante, tamanho, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof estiloBotao>) {
  return <button className={cn(estiloBotao({ variante, tamanho }), className)} {...props} />;
}
