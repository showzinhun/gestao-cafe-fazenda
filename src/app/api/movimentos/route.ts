import { rota } from '@/lib/rota';
import { ErroValidacao } from '@/dominio/erros';
import { listarMovimentos } from '@/servicos/consultas';
import { abrirMovimento } from '@/servicos/movimentos';

export const GET = rota((ctx, req) => {
  const p = new URL(req.url).searchParams;
  const etapa = p.get('etapa');
  if (!etapa) throw new ErroValidacao('Informe a etapa.', 'etapa');
  return listarMovimentos(ctx, etapa, { status: p.get('status') ?? undefined, busca: p.get('q') ?? undefined });
});
export const POST = rota(async (ctx, req) => abrirMovimento(ctx, await req.json()));
