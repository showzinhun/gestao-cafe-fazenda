import { rota } from '@/lib/rota';
import { dadosDoCampo } from '@/servicos/colhedores';

export const GET = rota((ctx) => dadosDoCampo(ctx));
