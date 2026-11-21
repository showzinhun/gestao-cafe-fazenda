import { rota } from '@/lib/rota';
import { listarColhedores, salvarColhedor } from '@/servicos/colhedores';

/** Lista sempre mascarada (§3.3). */
export const GET = rota((ctx, req) => {
  const p = new URL(req.url).searchParams;
  return listarColhedores(ctx, { turmaId: p.get('turma') ?? undefined, incluirInativos: p.get('inativos') === '1' });
});
export const POST = rota(async (ctx, req) => salvarColhedor(ctx, null, await req.json()));
