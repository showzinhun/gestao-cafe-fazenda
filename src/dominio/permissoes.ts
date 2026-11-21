import { pode as padrao, PERMISSOES, type Perfil, type Permissao } from './perfis';

export type AjustesPermissao = Partial<Record<Perfil, Partial<Record<Permissao, boolean>>>>;

/** Matriz efetiva: padrão do domínio com os ajustes da empresa (§3.2). ADMIN_EMPRESA pode tudo. */
export function permissoesDoPerfil(perfil: Perfil, ajustes: AjustesPermissao = {}): Permissao[] {
  if (perfil === 'ADMIN_EMPRESA') return [...PERMISSOES];
  return PERMISSOES.filter((p) => ajustes[perfil]?.[p] ?? padrao(perfil, p));
}
