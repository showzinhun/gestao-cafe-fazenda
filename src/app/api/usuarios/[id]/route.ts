import { rota } from '@/lib/rota';
import { alterarUsuario } from '@/servicos/usuarios';

export const PUT = rota<{ id: string }>(async (ctx, req, { id }) => alterarUsuario(ctx, id, await req.json()));
