/** Violação de regra de negócio (§11). A rota responde 422 {codigo, mensagem}. */
export class ErroRegra extends Error {
  constructor(
    readonly codigo: `RN-${string}`,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroRegra';
  }
}

/** Recurso inexistente ou de outra empresa: sempre 404, nunca 403 (RN-22). */
export class ErroNaoEncontrado extends Error {
  constructor(mensagem = 'Não encontrado.') {
    super(mensagem);
    this.name = 'ErroNaoEncontrado';
  }
}

/** Usuário autenticado sem permissão para a ação dentro da própria empresa. */
export class ErroPermissao extends Error {
  constructor(mensagem = 'Seu perfil não tem permissão para esta ação.') {
    super(mensagem);
    this.name = 'ErroPermissao';
  }
}

/** Dado de entrada inválido (formato, duplicidade de cadastro). A rota responde 400. */
export class ErroValidacao extends Error {
  constructor(
    mensagem: string,
    readonly campo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroValidacao';
  }
}
