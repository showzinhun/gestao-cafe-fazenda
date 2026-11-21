import { notFound } from 'next/navigation';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { obterFazenda } from '@/servicos/fazendas';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Cartao } from '@/componentes/ui/cartao';
import { estiloBotao } from '@/componentes/ui/botao';

export default async function Fazenda({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  let f;
  try {
    f = await obterFazenda(ctx, id);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound(); // outra empresa → 404 (RN-22)
    throw e;
  }
  return (
    <>
      <TituloPagina grupo="Configuração" titulo={`Fazenda ${f.codigo}`}>
        <Link href="/cadastros/fazendas" className={estiloBotao({ variante: 'secundario' })}>
          ← Voltar à lista
        </Link>
      </TituloPagina>
      <div className="px-4 pt-6 lg:px-6">
        <Cartao className="grid max-w-2xl grid-cols-2 gap-4">
          <Dado r="Código" v={f.codigo} />
          <Dado r="Nome" v={f.nome} />
          <Dado r="Município" v={f.municipio ?? '—'} />
          <Dado r="UF" v={f.uf ?? '—'} />
        </Cartao>
      </div>
    </>
  );
}

function Dado({ r, v }: { r: string; v: string }) {
  return (
    <div>
      <small className="block text-[12px] text-tinta-2">{r}</small>
      <b className="font-medium">{v}</b>
    </div>
  );
}
