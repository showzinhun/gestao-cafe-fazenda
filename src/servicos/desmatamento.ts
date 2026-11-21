import type { Geometry } from 'geojson';
import type { Resultado } from '@/dominio/eudr';

/**
 * Provedor de checagem de desmatamento (§10, D-03): adaptadores plugáveis.
 * MVP: provedor de demonstração (mock) e importação manual do resultado com evidência em PDF.
 */
export interface ProvedorDesmatamento {
  codigo: string;
  nome: string;
  checar(talhao: { id: string; codigo: string; geometria: Geometry; areaHa: string | null }, dataCorte: string): Promise<{ resultado: Resultado; areaAlertaHa?: string | null; evidencia: Record<string, unknown> }>;
}

/** Demonstração: responde SEM_ALERTA para qualquer geometria. Não substitui uma análise real. */
export const provedorMock: ProvedorDesmatamento = {
  codigo: 'MOCK',
  nome: 'Demonstração (sem análise real)',
  async checar(talhao, dataCorte) {
    return {
      resultado: 'SEM_ALERTA',
      areaAlertaHa: null,
      evidencia: { provedor: 'MOCK', aviso: 'Resultado de demonstração: substitua por um provedor real ou importe o laudo.', talhao: talhao.codigo, data_corte: dataCorte },
    };
  },
};

const PROVEDORES: Record<string, ProvedorDesmatamento> = { MOCK: provedorMock };

export function provedor(codigo: string): ProvedorDesmatamento | null {
  return PROVEDORES[codigo] ?? null;
}
export const listaProvedores = () => Object.values(PROVEDORES).map((p) => ({ codigo: p.codigo, nome: p.nome }));
