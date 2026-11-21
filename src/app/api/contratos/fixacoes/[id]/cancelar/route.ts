import { rota } from '@/lib/rota';
import { cancelarFixacao } from '@/servicos/contratos';

export const POST = rota<{ id: string }>((ctx, _req, p) => cancelarFixacao(ctx, p.id));
