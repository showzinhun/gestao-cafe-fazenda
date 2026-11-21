import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, CalendarRange, Coffee, Filter, Map, MapPin, ShieldCheck, Timer, Truck, Users, Wallet } from 'lucide-react';
import { exigirContexto } from '@/lib/contexto';
import { TituloPagina } from '@/componentes/titulo-pagina';

export const metadata: Metadata = { title: 'Cadastros' };

const ITENS = [
  { href: '/cadastros/fazendas', titulo: 'Fazendas e talhões', texto: 'Produtor, CAR, talhões com mapa e área', icone: Map },
  { href: '/cadastros/parceiros', titulo: 'Parceiros', texto: 'Produtores, clientes, transportadores', icone: Users },
  { href: '/cadastros/safras', titulo: 'Safras', texto: 'Ano agrícola e período', icone: CalendarRange },
  { href: '/cadastros/tipos-cafe', titulo: 'Tipos de café', texto: 'Natural, lavado, verde, boia…', icone: Coffee },
  { href: '/cadastros/peneiras', titulo: 'Peneiras', texto: 'Classificação do grão', icone: Filter },
  { href: '/cadastros/locais', titulo: 'Locais', texto: 'Terreiros, secadores, tulhas, quadras', icone: MapPin },
  { href: '/cadastros/turnos', titulo: 'Turnos', texto: 'Turnos de trabalho', icone: Timer },
  { href: '/cadastros/motoristas', titulo: 'Motoristas', texto: 'CPF, placa e transportadora', icone: Truck },
  { href: '/cadastros/certificados', titulo: 'Certificados', texto: 'RFA, AAA, 4C…', icone: ShieldCheck },
  { href: '/cadastros/precos-colheita', titulo: 'Preços de colheita', texto: 'Valor por medida e vigência', icone: Wallet },
  { href: '/config/fluxo', titulo: 'Fluxo de etapas', texto: 'Etapas, classes e transições', icone: Boxes },
];

export default async function Cadastros() {
  await exigirContexto();
  return (
    <>
      <TituloPagina grupo="Configuração" titulo="Cadastros" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 px-4 pt-6 lg:px-6">
        {ITENS.map((i) => (
          <Link key={i.href} href={i.href} className="sombra flex items-center gap-3.5 rounded-xl border border-linha bg-superficie p-4 transition hover:border-destaque">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-destaque-suave text-destaque">
              <i.icone className="size-5" />
            </span>
            <span>
              <b className="block">{i.titulo}</b>
              <small className="text-tinta-2">{i.texto}</small>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
