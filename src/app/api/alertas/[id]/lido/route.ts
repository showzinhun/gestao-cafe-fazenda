import { rota } from '@/lib/rota';
import { marcarAlertaLido } from '@/servicos/alertas';

export const POST = rota<{ id: string }>((ctx, _req, p) => marcarAlertaLido(ctx, p.id));
