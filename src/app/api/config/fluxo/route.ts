import { rota } from '@/lib/rota';
import { obterFluxo, salvarTransicoes } from '@/servicos/fluxo';

/** GET/PUT /api/config/fluxo (§14). PUT substitui as transições de um escopo: {fazendaId|null, pares:[[origem,destino]]}. */
export const GET = rota((ctx) => obterFluxo(ctx));
export const PUT = rota(async (ctx, req) => salvarTransicoes(ctx, await req.json()));
