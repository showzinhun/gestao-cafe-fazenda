import { rota } from '@/lib/rota';
import { cancelarNota } from '@/servicos/embarques';

export const POST = rota<{ id: string; notaId: string }>((ctx, _req, p) => cancelarNota(ctx, p.id, p.notaId));
