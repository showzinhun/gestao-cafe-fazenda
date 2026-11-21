import { rota } from '@/lib/rota';
import { rastrearLote } from '@/servicos/consultas';

export const GET = rota<{ id: string }>((ctx, req, p) => rastrearLote(ctx, p.id, new URL(req.url).searchParams.get('direcao') === 'baixo' ? 'baixo' : 'cima'));
