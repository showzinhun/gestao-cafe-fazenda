import { rota } from '@/lib/rota';
import { removerEntradaPorId } from '@/servicos/movimentos';

export const DELETE = rota<{ id: string; entradaId: string }>((ctx, _req, p) => removerEntradaPorId(ctx, p.id, p.entradaId));
