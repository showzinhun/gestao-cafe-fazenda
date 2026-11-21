import { rota } from '@/lib/rota';
import { listarApontamentos } from '@/servicos/apontamentos';

export const GET = rota((ctx, req) => {
  const p = new URL(req.url).searchParams;
  return listarApontamentos(ctx, { fazendaId: p.get('fazenda') ?? undefined, talhaoId: p.get('talhao') ?? undefined, data: p.get('data') ?? undefined, inicio: p.get('inicio') ?? undefined, fim: p.get('fim') ?? undefined, semCarga: p.get('semCarga') === '1' });
});
