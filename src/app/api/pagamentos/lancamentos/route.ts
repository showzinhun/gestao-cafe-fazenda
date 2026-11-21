import { rota } from '@/lib/rota';
import { lancarParaColhedor } from '@/servicos/pagamentos';

export const POST = rota(async (ctx, req) => lancarParaColhedor(ctx, await req.json()));
