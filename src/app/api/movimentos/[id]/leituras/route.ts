import { rota } from '@/lib/rota';
import { curvaSecagem, lancarLeitura } from '@/servicos/secagem';

type P = { id: string };
/** Curva de umidade do movimento, com a meta e a previsão de ponto (§7). */
export const GET = rota<P>((ctx, _req, p) => curvaSecagem(ctx, p.id));
/** POST /api/movimentos/{id}/leituras (§14). */
export const POST = rota<P>(async (ctx, req, p) => lancarLeitura(ctx, p.id, await req.json()));
