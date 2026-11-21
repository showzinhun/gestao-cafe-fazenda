import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Decimal from 'decimal.js';
import { exigirContexto } from '@/lib/contexto';
import { obterContrato } from '@/servicos/contratos';
import { consultarEstoque } from '@/servicos/consultas';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { DetalheContrato } from '@/componentes/comercial/detalhe-contrato';

export const metadata: Metadata = { title: 'Contrato' };
export const dynamic = 'force-dynamic';

export default async function PaginaContrato({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const contrato = await obterContrato(ctx, id).catch((e) => { if (e instanceof ErroNaoEncontrado) notFound(); throw e; });
  const estoque = await consultarEstoque(ctx, { situacao: 'livre' });
  const lotes = estoque.lotes.filter((l) => l.unidade === 'KG' && new Decimal(l.livre).gt(0)).map((l) => ({ id: l.id, codigo: l.codigo, livre: l.livre, peneira: l.peneira, certificados: l.certificados, etapa: l.etapa }));
  const perm = ctx.permissoes ?? permissoesDoPerfil(ctx.perfil);
  return (
    <>
      <TituloPagina grupo="Contratos" titulo={`Contrato ${contrato.codigo}`} />
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <DetalheContrato c={contrato} lotes={lotes} podeEditar={perm.includes('comercial.editar')} podeEmbarque={perm.includes('embarque.programar')} />
      </div>
    </>
  );
}
