import type { Metadata } from 'next';
import Link from 'next/link';
import { Droplets, Sprout } from 'lucide-react';

export const metadata: Metadata = { title: 'Campo' };

export default function Campo() {
  return (
    <div className="grid gap-3">
      <p className="text-tinta-2">Atalhos do app de campo. Funcionam sem sinal a partir da Fase 4.</p>
      <Atalho icone={<Sprout className="size-7" />} titulo="Apontamento de colheita" detalhe="Medidas por colhedor e talhão · Fase 4" />
      <Atalho icone={<Droplets className="size-7" />} titulo="Leituras de secagem" detalhe="Umidade e temperatura · Fase 5" />
      <Link href="/inicio" className="mt-2 text-center text-[13px] text-destaque underline-offset-2 hover:underline">
        Abrir a versão completa
      </Link>
    </div>
  );
}

function Atalho({ icone, titulo, detalhe }: { icone: React.ReactNode; titulo: string; detalhe: string }) {
  return (
    <div aria-disabled className="sombra flex items-center gap-4 rounded-2xl border border-linha bg-superficie p-5 opacity-80">
      <span className="grid size-14 place-items-center rounded-xl bg-destaque-suave text-destaque">{icone}</span>
      <span>
        <b className="block text-[16px]">{titulo}</b>
        <small className="text-tinta-2">{detalhe}</small>
      </span>
    </div>
  );
}
