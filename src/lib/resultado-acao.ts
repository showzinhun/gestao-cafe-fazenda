import 'server-only';
import { ZodError } from 'zod';
import { ErroNaoEncontrado, ErroPermissao, ErroRegra, ErroValidacao } from '@/dominio/erros';

/** Resultado das server actions: a interface mostra a mensagem na própria página. */
export type ResultadoAcao<T = unknown> = { ok: true; dados?: T; avisos?: string[]; mensagem?: string } | { ok: false; erro: string; campo?: string };

export function falha(e: unknown): ResultadoAcao<never> {
  if (e instanceof ErroValidacao) return { ok: false, erro: e.message, campo: e.campo };
  if (e instanceof ErroRegra) return { ok: false, erro: `${e.message} (${e.codigo})` };
  if (e instanceof ErroPermissao || e instanceof ErroNaoEncontrado) return { ok: false, erro: e.message };
  if (e instanceof ZodError) {
    const i = e.issues[0];
    return { ok: false, erro: i ? `${i.path.join('.') || 'Campo'}: ${i.message}` : 'Dados inválidos.', campo: i ? String(i.path[0]) : undefined };
  }
  console.error(e);
  return { ok: false, erro: 'Não foi possível salvar. Tente de novo.' };
}
