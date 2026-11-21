import { rota } from '@/lib/rota';
import { painelComercial } from '@/servicos/contratos';

export const GET = rota((ctx) => painelComercial(ctx));
