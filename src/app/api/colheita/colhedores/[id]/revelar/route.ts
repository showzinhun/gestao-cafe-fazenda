import { rota } from '@/lib/rota';
import { revelarDadosColhedor } from '@/servicos/colhedores';

/** Mostra CPF e PIX sem máscara: só FINANCEIRO/ADMIN, sempre auditado (§3.3). POST para não ficar em cache nem em log de URL. */
export const POST = rota<{ id: string }>((ctx, _req, p) => revelarDadosColhedor(ctx, p.id));
