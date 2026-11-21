import { rota } from '@/lib/rota';
import { detalheMovimento } from '@/servicos/consultas';

export const GET = rota<{ id: string }>((ctx, _req, p) => detalheMovimento(ctx, p.id));
