import { rota } from '@/lib/rota';
import { listarAlertas } from '@/servicos/alertas';

export const GET = rota((ctx, req) => listarAlertas(ctx, { naoLidos: new URL(req.url).searchParams.get('naoLidos') === '1' }));
