import { rota } from '@/lib/rota';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { criar, ehRecurso, listar } from '@/servicos/cadastros';

/** CRUD /api/cadastros/{recurso} (§14). Filtros simples por query string (ex.: ?fazendaId=...). */
export const GET = rota<{ recurso: string }>(async (ctx, req, { recurso }) => {
  if (!ehRecurso(recurso)) throw new ErroNaoEncontrado();
  const url = new URL(req.url);
  const filtro = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'inativos'));
  return listar(ctx, recurso, { incluirInativos: url.searchParams.get('inativos') === '1', filtro });
});

export const POST = rota<{ recurso: string }>(async (ctx, req, { recurso }) => {
  if (!ehRecurso(recurso)) throw new ErroNaoEncontrado();
  return criar(ctx, recurso, await req.json());
});
