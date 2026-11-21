import { rota } from '@/lib/rota';
import { removerEntreLocais } from '@/servicos/estoque';

export const POST = rota(async (ctx, req) => removerEntreLocais(ctx, await req.json()));
