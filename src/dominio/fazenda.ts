/** Código da fazenda: 2 a 4 letras, único na empresa (§4.2). Usado no código de lote (§8). */
export function normalizarCodigoFazenda(codigo: string): string {
  return codigo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

export function codigoFazendaValido(codigo: string): boolean {
  return /^[A-Z]{2,4}$/.test(codigo);
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
