/** Paginação das listas (Fase 8): páginas de 50, numeradas a partir de 1. */
export const TAMANHO_PAGINA = 50;

export interface Paginacao {
  pagina: number;
  temMais: boolean;
}

export const numeroPagina = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
};

/** skip/take do Prisma: busca um item a mais para saber se há próxima página. */
export const janela = (pagina: number) => ({ skip: (pagina - 1) * TAMANHO_PAGINA, take: TAMANHO_PAGINA + 1 });

/** Corta o item extra e informa se há próxima página. */
export function cortar<T>(itens: T[], pagina: number): { itens: T[]; paginacao: Paginacao } {
  return { itens: itens.slice(0, TAMANHO_PAGINA), paginacao: { pagina, temMais: itens.length > TAMANHO_PAGINA } };
}

/** Paginação em memória (listas filtradas depois da consulta, como o estoque com o filtro EUDR). */
export function fatiar<T>(itens: T[], pagina: number): { itens: T[]; paginacao: Paginacao } {
  return cortar(itens.slice((pagina - 1) * TAMANHO_PAGINA), pagina);
}
