import Decimal from 'decimal.js';
import area from '@turf/area';
import intersect from '@turf/intersect';
import { feature, featureCollection } from '@turf/helpers';
import type { MultiPolygon, Polygon } from 'geojson';
import { ErroRegra } from './erros';

/** EUDR (§10): data de corte do regulamento. */
export const DATA_CORTE = '2020-12-31';
/** Acima de 4 ha a EUDR exige polígono; até 4 ha aceita ponto. */
export const AREA_MAXIMA_PONTO_HA = '4';

export type Resultado = 'SEM_ALERTA' | 'ALERTA' | 'INCONCLUSIVO' | 'ERRO';

export interface TalhaoEudr {
  id: string;
  codigo: string;
  fazenda: string;
  geometriaTipo: 'PONTO' | 'POLIGONO' | null;
  geometriaHash: string | null;
  areaHa: string | null; // informada, senão calculada
  ultimaChecagem: { resultado: Resultado; dataChecagem: string; versaoGeometriaHash: string } | null;
}

export type TipoPendencia =
  | 'SEM_GEOMETRIA' | 'PONTO_ACIMA_4HA' | 'SEM_CHECAGEM' | 'CHECAGEM_DESATUALIZADA' | 'CHECAGEM_ALERTA' | 'CHECAGEM_INCONCLUSIVA' | 'CERTIFICADO_INVALIDO';

export interface Pendencia {
  tipo: TipoPendencia;
  referencia: string;
  mensagem: string;
}

const nome = (t: TalhaoEudr) => `${t.fazenda}/${t.codigo}`;

/** Geometria aceita pela EUDR: existe e, acima de 4 ha, é polígono. */
export function pendenciaGeometria(t: TalhaoEudr): Pendencia | null {
  if (!t.geometriaTipo || !t.geometriaHash) return { tipo: 'SEM_GEOMETRIA', referencia: nome(t), mensagem: `Talhão ${nome(t)} sem geometria.` };
  if (t.geometriaTipo === 'PONTO' && t.areaHa && new Decimal(t.areaHa).gt(AREA_MAXIMA_PONTO_HA))
    return { tipo: 'PONTO_ACIMA_4HA', referencia: nome(t), mensagem: `Talhão ${nome(t)} tem ${new Decimal(t.areaHa).toDecimalPlaces(2)} ha e só um ponto: acima de 4 ha a EUDR exige polígono.` };
  return null;
}

/** Checagem que vale para a geometria atual (a checagem é refeita quando a geometria muda). */
export function checagemVigente(t: TalhaoEudr) {
  return t.ultimaChecagem && t.geometriaHash && t.ultimaChecagem.versaoGeometriaHash === t.geometriaHash ? t.ultimaChecagem : null;
}

/** Pendências EUDR de um talhão (§10): geometria e checagem de desmatamento. */
export function pendenciasDoTalhao(t: TalhaoEudr): Pendencia[] {
  const g = pendenciaGeometria(t);
  if (g) return [g];
  const c = checagemVigente(t);
  if (!c) {
    return [t.ultimaChecagem
      ? { tipo: 'CHECAGEM_DESATUALIZADA', referencia: nome(t), mensagem: `Talhão ${nome(t)}: a geometria mudou depois da última checagem. Refaça a checagem.` }
      : { tipo: 'SEM_CHECAGEM', referencia: nome(t), mensagem: `Talhão ${nome(t)} sem checagem de desmatamento.` }];
  }
  if (c.resultado === 'ALERTA') return [{ tipo: 'CHECAGEM_ALERTA', referencia: nome(t), mensagem: `Talhão ${nome(t)} com alerta de desmatamento (checagem de ${c.dataChecagem.split('-').reverse().join('/')}).` }];
  if (c.resultado !== 'SEM_ALERTA') return [{ tipo: 'CHECAGEM_INCONCLUSIVA', referencia: nome(t), mensagem: `Talhão ${nome(t)}: checagem ${c.resultado === 'ERRO' ? 'com erro' : 'inconclusiva'}. Refaça ou importe o resultado.` }];
  return [];
}

export type SituacaoEudr = 'APTO' | 'PENDENTE' | 'BLOQUEADO';

/** APTO: geometria válida e checagem vigente SEM_ALERTA. BLOQUEADO: geometria inválida ou alerta. PENDENTE: falta checar. */
export function situacaoEudr(t: TalhaoEudr): SituacaoEudr {
  const p = pendenciasDoTalhao(t);
  if (!p.length) return 'APTO';
  return p.some((x) => x.tipo === 'SEM_GEOMETRIA' || x.tipo === 'PONTO_ACIMA_4HA' || x.tipo === 'CHECAGEM_ALERTA') ? 'BLOQUEADO' : 'PENDENTE';
}

/**
 * RN-18 na reserva e na entrada de embarque de contrato que exige EUDR: o lote não pode ter talhão
 * sem geometria válida nem com alerta de desmatamento. Falta de checagem não bloqueia aqui: vira pendência
 * do dossiê, que impede a finalização.
 */
export function exigirLoteEudr(lote: string, talhoes: TalhaoEudr[]): void {
  const bloqueios = talhoes.flatMap(pendenciasDoTalhao).filter((p) => p.tipo === 'SEM_GEOMETRIA' || p.tipo === 'PONTO_ACIMA_4HA' || p.tipo === 'CHECAGEM_ALERTA');
  if (bloqueios.length) throw new ErroRegra('RN-18', `O lote ${lote} não atende à EUDR: ${bloqueios.map((b) => b.mensagem).join(' ')}`);
}

/** O embarque de contrato com EUDR não finaliza com pendência no dossiê (RN-18). */
export function exigirDossieSemPendencias(pendencias: Pendencia[]): void {
  if (pendencias.length) throw new ErroRegra('RN-18', `O dossiê tem ${pendencias.length} pendência(s): ${pendencias.map((p) => p.mensagem).join(' ')}`);
}

// ---------------------------------------------------------------- sobreposição entre produtores (§10)

export interface PoligonoTalhao {
  id: string;
  codigo: string;
  fazenda: string;
  geometria: Polygon | MultiPolygon;
}

/** Talhões de outros produtores que se sobrepõem ao alvo (risco de terra contada em dobro). Área em ha (4 casas). */
export function sobreposicoes(alvo: Polygon | MultiPolygon, outros: PoligonoTalhao[], minimoM2 = 1): { id: string; codigo: string; fazenda: string; areaHa: string }[] {
  const r = [];
  for (const o of outros) {
    const i = intersect(featureCollection([feature(alvo), feature(o.geometria)]));
    if (!i) continue;
    const m2 = area(i);
    if (m2 >= minimoM2) r.push({ id: o.id, codigo: o.codigo, fazenda: o.fazenda, areaHa: (m2 / 10000).toFixed(4) });
  }
  return r;
}
