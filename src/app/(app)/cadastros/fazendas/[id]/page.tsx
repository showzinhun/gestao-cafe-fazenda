import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirContexto } from '@/lib/contexto';
import { listar, listarOpcoes, obter } from '@/servicos/cadastros';
import { listarCertificadosFazenda } from '@/servicos/conformidade';
import { CertificadosFazenda } from '@/componentes/conformidade/certificados-fazenda';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { permissoesDoPerfil } from '@/dominio/permissoes';
import { TituloPagina } from '@/componentes/titulo-pagina';
import { Cartao, Indicador } from '@/componentes/ui/cartao';
import { estiloBotao } from '@/componentes/ui/botao';
import { GestaoTalhoes, type Talhao } from '@/componentes/cadastros/talhoes';

export const metadata: Metadata = { title: 'Fazenda' };

export default async function Fazenda({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  let f: Record<string, unknown>;
  try {
    f = await obter(ctx, 'fazendas', id);
  } catch (e) {
    if (e instanceof ErroNaoEncontrado) notFound(); // outra empresa → 404 (RN-22)
    throw e;
  }
  const talhoes = JSON.parse(JSON.stringify(await listar(ctx, 'talhoes', { incluirInativos: true, filtro: { fazendaId: id } }))) as Talhao[];
  const [certs, opcoes] = await Promise.all([listarCertificadosFazenda(ctx, id), listarOpcoes(ctx, ['certificados'])]);
  const ativos = talhoes.filter((t) => t.ativo);
  const total = (k: 'areaHaInformada' | 'areaHaCalculada') => ativos.reduce((a, t) => a + Number(t[k] ?? 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const semGeo = ativos.filter((t) => !t.geometriaTipo).length;
  const produtor = f.produtor as { nome: string; cpfCnpj: string | null } | null;
  const podeEditar = (ctx.permissoes ?? permissoesDoPerfil(ctx.perfil)).includes('cadastros.editar');
  return (
    <>
      <TituloPagina grupo="Cadastros" titulo={`Fazenda ${String(f.codigo)} · ${String(f.nome)}`}>
        <Link href="/cadastros/fazendas" className={estiloBotao({ variante: 'secundario' })}>← Voltar à lista</Link>
      </TituloPagina>
      <div className="grid gap-5 px-4 py-6 lg:px-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Indicador valor={ativos.length} rotulo="talhões ativos" />
          <Indicador valor={`${total('areaHaInformada')} ha`} rotulo="área informada" cor="ouro" />
          <Indicador valor={`${total('areaHaCalculada')} ha`} rotulo="área calculada no mapa" cor="ok" />
          <Indicador valor={semGeo} rotulo="talhões sem geometria" cor="erro" />
        </div>
        <Cartao className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
          <Dado r="Produtor" v={produtor ? `${produtor.nome}${produtor.cpfCnpj ? ' · ' + produtor.cpfCnpj : ''}` : '—'} />
          <Dado r="Município / UF" v={[f.municipio, f.uf].filter(Boolean).join(' / ') || '—'} />
          <Dado r="CAR" v={(f.car as string) || '—'} />
          <Dado r="Inscrição estadual" v={(f.ie as string) || '—'} />
        </Cartao>
        <GestaoTalhoes fazendaId={id} talhoes={talhoes} podeEditar={podeEditar} />
        <CertificadosFazenda fazendaId={id} linhas={JSON.parse(JSON.stringify(certs))} certificados={opcoes.certificados ?? []} podeEditar={podeEditar} />
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
