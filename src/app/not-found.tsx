import Link from 'next/link';
import { estiloBotao } from '@/componentes/ui/botao';

export default function NaoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="grid max-w-sm gap-3 text-center">
        <p className="rotulo-secao text-ouro">Erro 404</p>
        <h1 className="font-display text-[24px] font-semibold">Não encontrado</h1>
        <p className="text-tinta-2">O registro não existe ou não pertence à empresa ativa.</p>
        <Link href="/inicio" className={estiloBotao({ variante: 'secundario' }) + ' justify-self-center'}>
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
