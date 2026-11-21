import { rota } from '@/lib/rota';
import { relatorioProducao } from '@/servicos/pagamentos';

export const GET = rota((ctx, req) => {
  const p = new URL(req.url).searchParams;
  return relatorioProducao(ctx, { inicio: p.get('inicio') ?? '', fim: p.get('fim') ?? '', fazendaId: p.get('fazenda') ?? undefined, agrupar: (p.get('agrupar') ?? 'colhedor') as 'colhedor' });
});
