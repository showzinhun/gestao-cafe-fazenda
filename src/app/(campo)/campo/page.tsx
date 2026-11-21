import type { Metadata } from 'next';
import Link from 'next/link';
import { Droplets, Sprout } from 'lucide-react';

export const metadata: Metadata = { title: 'Campo' };

export default function Campo() {
  return (
    <div className="grid gap-3">
      <p className="text-tinta-2">Atalhos do app de campo. O apontamento funciona sem sinal.</p>
      <Link href="/campo/apontar" className="sombra flex items-center gap-4 rounded-2xl border border-linha bg-superficie p-5">
        <span className="grid size-14 place-items-center rounded-xl bg-destaque-suave text-destaque"><Sprout className="size-7" /></span>
        <span><b className="block text-[16px]">Apontamento de colheita</b><small className="text-tinta-2">Medidas por colhedor e talhão, mesmo sem sinal</small></span>
      </Link>
      <Link href="/campo/secagem" className="sombra flex items-center gap-4 rounded-2xl border border-linha bg-superficie p-5">
        <span className="grid size-14 place-items-center rounded-xl bg-destaque-suave text-destaque"><Droplets className="size-7" /></span>
        <span><b className="block text-[16px]">Leituras de secagem</b><small className="text-tinta-2">Umidade e temperatura, mesmo sem sinal</small></span>
      </Link>
      <Link href="/inicio" className="mt-2 text-center text-[13px] text-destaque underline-offset-2 hover:underline">
        Abrir a versão completa
      </Link>
    </div>
  );
}

