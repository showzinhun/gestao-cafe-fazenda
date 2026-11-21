import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirContexto } from '@/lib/contexto';
import { consultarEstoque, resumoEtapas, type FiltroEstoque } from '@/servicos/consultas';
import { listarOpcoes } from '@/servicos/cadastros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { estiloBotao } from '@/componentes/ui/botao';
import { TelaEstoque } from '@/componentes/operacao/estoque';

export const metadata: Metadata = { title: 'Estoque' };

type Busca = { etapa?: string; safra?: string; fazenda?: string; peneira?: string; certificado?: string; local?: string; situacao?: string; q?: string };

export default async function PaginaEstoque({ searchParams }: { searchParams: Promise<Busca> }) {
  const ctx = await exigirContexto();
  const p = await searchParams;
  const filtro: FiltroEstoque = {
    etapaId: p.etapa || undefined, safraId: p.safra || undefined, fazendaId: p.fazenda || undefined, peneiraId: p.peneira || undefined,
    certificadoId: p.certificado || undefined, localId: p.local || undefined, busca: p.q || undefined,
    situacao: p.situacao === 'livre' || p.situacao === 'reservado' ? p.situacao : undefined,
  };
  const [dados, opcoes, etapas] = await Promise.all([
    consultarEstoque(ctx, filtro),
    listarOpcoes(ctx, ['safras', 'fazendas', 'peneiras', 'certificados', 'locais']),
    resumoEtapas(ctx),
  ]);
  const estoques = etapas.filter((e) => e.classe === 'ESTOQUE');
  const servicos = etapas.filter((e) => e.classe === 'SERVICO');
  const pode = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('movimento.lancar');
  return (
    <>
      <TituloPagina grupo="Operação" titulo="Estoque">
        <Link href="/estoque/inventarios" className={estiloBotao({ variante: 'secundario' })}>Inventários</Link>
      </TituloPagina>
      <div className="grid gap-4 px-4 py-6 lg:px-6">
        <TelaEstoque
          dados={dados}
          filtro={p}
          opcoes={{ ...opcoes, locais: (opcoes.locais ?? []).filter((l) => estoques.some((e) => e.id === l.grupo)), etapas: estoques.map((e) => ({ valor: e.id, rotulo: e.nome })) }}
          servicos={servicos.map((s) => ({ id: s.id, nome: s.nome }))}
          podeLancar={pode}
        />
      </div>
    </>
  );
}
