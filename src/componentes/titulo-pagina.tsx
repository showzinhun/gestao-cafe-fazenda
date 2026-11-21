import { BuscaRapida } from './busca-rapida';

/** Barra de título fixa com grupo e nome da tela (§12). */
export function TituloPagina({ grupo, titulo, children }: { grupo: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-linha bg-fundo/90 px-4 pt-5 pb-3.5 backdrop-blur lg:sticky lg:top-0 lg:z-30 lg:px-6">
      <div className="grid gap-1.5">
        <span className="rotulo-secao text-ouro">{grupo}</span>
        <h1 className="font-display text-[26px] leading-tight font-semibold">{titulo}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 print:hidden">
        {children}
        <BuscaRapida />
      </div>
    </div>
  );
}
