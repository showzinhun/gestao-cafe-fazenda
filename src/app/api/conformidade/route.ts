import { rota } from '@/lib/rota';
import { painelConformidade } from '@/servicos/conformidade';

/** GET /api/conformidade: certificados, situação EUDR dos talhões e dossiês pendentes (§12, item 13). */
export const GET = rota(async (ctx) => painelConformidade(ctx));
