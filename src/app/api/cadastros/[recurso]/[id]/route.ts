import { z } from 'zod';
import { rota } from '@/lib/rota';
import { ErroNaoEncontrado } from '@/dominio/erros';
import { alterar, definirAtivo, ehRecurso, obter } from '@/servicos/cadastros';

type P = { recurso: string; id: string };
const recurso = (r: string) => {
  if (!ehRecurso(r)) throw new ErroNaoEncontrado();
  return r;
};

export const GET = rota<P>((ctx, _req, p) => obter(ctx, recurso(p.recurso), p.id));
export const PUT = rota<P>(async (ctx, req, p) => alterar(ctx, recurso(p.recurso), p.id, await req.json()));
/** PATCH {ativo}: inativar ou reativar. Cadastros não são apagados (regra 4). */
export const PATCH = rota<P>(async (ctx, req, p) => {
  const { ativo } = z.object({ ativo: z.boolean() }).parse(await req.json());
  return definirAtivo(ctx, recurso(p.recurso), p.id, ativo);
});
