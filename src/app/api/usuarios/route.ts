import { rota } from '@/lib/rota';
import { adicionarUsuario, listarUsuarios } from '@/servicos/usuarios';

export const GET = rota((ctx) => listarUsuarios(ctx));
export const POST = rota(async (ctx, req) => adicionarUsuario(ctx, await req.json()));
