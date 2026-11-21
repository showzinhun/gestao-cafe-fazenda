import { rota } from '@/lib/rota';
import { finalizarSaida } from '@/servicos/movimentos';

export const POST = rota<{ id: string }>((ctx, _req, p) => finalizarSaida(ctx, p.id));
