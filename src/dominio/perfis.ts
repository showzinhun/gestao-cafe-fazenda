/** Perfis por empresa (§3.2). SUPERADMIN é da plataforma e fica fora desta lista. */
export const PERFIS = ['ADMIN_EMPRESA', 'GESTOR', 'OPERADOR', 'APONTADOR', 'FINANCEIRO', 'COMERCIAL', 'CONSULTA'] as const;
export type Perfil = (typeof PERFIS)[number];

export const NOME_PERFIL: Record<Perfil, string> = {
  ADMIN_EMPRESA: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  APONTADOR: 'Apontador',
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  CONSULTA: 'Consulta',
};

/**
 * Permissões por etapa (§3.2). Estes são os valores iniciais da matriz perfil × permissão;
 * a empresa poderá ajustar a matriz na Fase 1. ADMIN_EMPRESA sempre pode tudo.
 */
export const PERMISSOES = [
  'cadastros.editar',
  'usuarios.gerenciar',
  'fluxo.configurar',
  'movimento.lancar',
  'movimento.fechar',
  'movimento.estornar',
  'apontamento.lancar',
  'pagamento.fechar',
  'comercial.editar',
  'embarque.programar',
  'embarque.carregar',
  'inventario.aprovar',
] as const;
export type Permissao = (typeof PERMISSOES)[number];

const PADRAO: Record<Exclude<Perfil, 'ADMIN_EMPRESA'>, readonly Permissao[]> = {
  GESTOR: ['cadastros.editar', 'movimento.lancar', 'movimento.fechar', 'movimento.estornar', 'apontamento.lancar', 'embarque.programar', 'embarque.carregar', 'inventario.aprovar'],
  OPERADOR: ['movimento.lancar', 'movimento.fechar', 'embarque.carregar'],
  APONTADOR: ['apontamento.lancar'],
  FINANCEIRO: ['pagamento.fechar'],
  COMERCIAL: ['comercial.editar', 'embarque.programar'],
  CONSULTA: [],
};

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  if (perfil === 'ADMIN_EMPRESA') return true;
  return PADRAO[perfil].includes(permissao);
}
