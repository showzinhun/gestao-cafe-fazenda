import Decimal from 'decimal.js';

/** Tabela de preço de colheita (§4.5, §6.3): vale a regra mais específica, talhão > fazenda > empresa. */
export interface PrecoColheita {
  id: string;
  fazendaId: string | null;
  talhaoId: string | null;
  safraId: string;
  tipoColheita: 'MANUAL' | 'SEMIMECANIZADA';
  valorPorMedida: Decimal.Value;
  vigenciaInicio: string; // aaaa-mm-dd
  vigenciaFim: string | null;
  ativo: boolean;
}

export function vigenteEm(p: Pick<PrecoColheita, 'vigenciaInicio' | 'vigenciaFim'>, data: string): boolean {
  return p.vigenciaInicio <= data && (p.vigenciaFim === null || data <= p.vigenciaFim);
}

export function precoVigente(
  precos: PrecoColheita[],
  q: { data: string; safraId: string; tipoColheita: PrecoColheita['tipoColheita']; fazendaId: string; talhaoId: string },
): PrecoColheita | null {
  const candidatos = precos.filter((p) => p.ativo && p.safraId === q.safraId && p.tipoColheita === q.tipoColheita && vigenteEm(p, q.data));
  return (
    candidatos.find((p) => p.talhaoId === q.talhaoId) ??
    candidatos.find((p) => p.talhaoId === null && p.fazendaId === q.fazendaId) ??
    candidatos.find((p) => p.talhaoId === null && p.fazendaId === null) ??
    null
  );
}

/** Dois preços no mesmo escopo (safra, tipo, fazenda, talhão) não podem ter vigências sobrepostas. */
export function vigenciasSobrepostas(a: Pick<PrecoColheita, 'vigenciaInicio' | 'vigenciaFim'>, b: Pick<PrecoColheita, 'vigenciaInicio' | 'vigenciaFim'>): boolean {
  const fimA = a.vigenciaFim ?? '9999-12-31';
  const fimB = b.vigenciaFim ?? '9999-12-31';
  return a.vigenciaInicio <= fimB && b.vigenciaInicio <= fimA;
}
