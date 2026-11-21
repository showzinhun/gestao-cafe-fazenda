import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Decimal from 'decimal.js';
import { exigirContexto } from '@/lib/contexto';
import { obterEmbarque } from '@/servicos/embarques';
import { consultarEstoque } from '@/servicos/consultas';
import { listar } from '@/servicos/cadastros';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { DetalheEmbarque } from '@/componentes/comercial/detalhe-embarque';

export const metadata: Metadata = { title: 'Embarque' };
export const dynamic = 'force-dynamic';

export default async function PaginaEmbarque({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const emb = await obterEmbarque(ctx, id).catch((e) => { if (e instanceof ErroNaoEncontrado) notFound(); throw e; });
  const [estoque, motoristas] = await Promise.all([
    consultarEstoque(ctx, { situacao: 'livre' }),
    listar(ctx, 'motoristas') as Promise<{ id: string; nome: string; placaPadrao: string | null; ativo?: boolean }[]>,
  ]);
  const lotes = estoque.lotes.filter((l) => l.unidade === 'KG' && new Decimal(l.livre).gt(0)).map((l) => ({ id: l.id, codigo: l.codigo, livre: l.livre, peneira: l.peneira, certificados: l.certificados, etapa: l.etapa }));
  const perm = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  return (
    <>
      <TituloPagina grupo="Embarques" titulo={`Embarque ${emb.rotulo}`} />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <DetalheEmbarque
          e={emb}
          lotes={lotes}
          motoristas={motoristas.filter((m) => m.ativo !== false).map((m) => ({ id: m.id, nome: m.nome, placa: m.placaPadrao }))}
          pode={{ programar: perm.includes('embarque.programar'), carregar: perm.includes('embarque.carregar'), finalizar: perm.includes('movimento.fechar'), reabrir: ctx.perfil === 'ADMIN_EMPRESA' }}
        />
      </div>
    </>
  );
}
