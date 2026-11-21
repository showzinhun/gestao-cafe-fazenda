import area from '@turf/area';
import kinks from '@turf/kinks';
import type { Feature, Geometry, MultiPolygon, Point, Polygon, Position } from 'geojson';

/**
 * Geometria do talhão (§10): GeoJSON em WGS84 com 6 casas, área calculada pela Turf.
 * Aceita Geometry, Feature ou FeatureCollection com um único polígono, multipolígono ou ponto.
 */
export type GeometriaTalhao = Polygon | MultiPolygon | Point;

export interface ResultadoGeometria {
  geometria: GeometriaTalhao;
  tipo: 'PONTO' | 'POLIGONO';
  areaHa: string | null; // 4 casas, como texto (Decimal no banco)
  avisos: string[];
}

export class GeometriaInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GeometriaInvalida';
  }
}

const arred = (n: number) => Math.round(n * 1e6) / 1e6;

function arredondar(g: GeometriaTalhao): GeometriaTalhao {
  const anel = (a: Position[]) => a.map((p) => [arred(Number(p[0])), arred(Number(p[1]))]);
  if (g.type === 'Point') return { type: 'Point', coordinates: [arred(Number(g.coordinates[0])), arred(Number(g.coordinates[1]))] };
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(anel) };
  return { type: 'MultiPolygon', coordinates: g.coordinates.map((pol) => pol.map(anel)) };
}

function extrair(entrada: unknown): GeometriaTalhao {
  if (!entrada || typeof entrada !== 'object') throw new GeometriaInvalida('Arquivo GeoJSON inválido.');
  const o = entrada as { type?: string; features?: unknown[]; geometry?: unknown };
  if (o.type === 'FeatureCollection') {
    const fs = (o.features ?? []) as Feature<Geometry | null>[];
    const geoms = fs.map((f) => f?.geometry).filter((g): g is Geometry => !!g);
    if (geoms.length === 0) throw new GeometriaInvalida('O arquivo não tem nenhuma geometria.');
    if (geoms.length === 1) return extrair(geoms[0]);
    const polis = geoms.filter((g): g is Polygon | MultiPolygon => g.type === 'Polygon' || g.type === 'MultiPolygon');
    if (polis.length !== geoms.length) throw new GeometriaInvalida('O arquivo mistura tipos de geometria. Envie um talhão por arquivo.');
    return { type: 'MultiPolygon', coordinates: polis.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) };
  }
  if (o.type === 'Feature') return extrair(o.geometry);
  if (o.type === 'Polygon' || o.type === 'MultiPolygon' || o.type === 'Point') return entrada as GeometriaTalhao;
  throw new GeometriaInvalida(`Tipo de geometria não aceito: ${o.type ?? 'desconhecido'}. Use polígono ou ponto.`);
}

function validarAnel(a: Position[]) {
  if (!Array.isArray(a) || a.length < 4) throw new GeometriaInvalida('Cada polígono precisa de pelo menos 3 vértices.');
  for (const p of a) {
    const [lon, lat] = [Number(p[0]), Number(p[1])];
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new GeometriaInvalida('Coordenadas fora de WGS84 (longitude, latitude em graus). Confira a projeção do arquivo.');
    }
  }
  const [x0, y0] = a[0]!;
  const [xn, yn] = a[a.length - 1]!;
  if (x0 !== xn || y0 !== yn) throw new GeometriaInvalida('O polígono não está fechado (o último vértice deve repetir o primeiro).');
}

/** Normaliza, valida e calcula a área. areaInformadaHa serve para o aviso de diferença (> 10%). */
export function processarGeometria(entrada: unknown, areaInformadaHa?: string | null): ResultadoGeometria {
  const g = arredondar(extrair(entrada));
  const avisos: string[] = [];
  if (g.type === 'Point') {
    const [lon, lat] = g.coordinates as [number, number];
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) throw new GeometriaInvalida('Coordenadas fora de WGS84.');
    if (areaInformadaHa && Number(areaInformadaHa) > 4) avisos.push('Talhão com mais de 4 ha precisa de polígono para a EUDR; ponto só vale até 4 ha.');
    return { geometria: g, tipo: 'PONTO', areaHa: null, avisos };
  }
  const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const pol of poligonos) for (const anel of pol) validarAnel(anel);
  if (kinks(g).features.length) throw new GeometriaInvalida('O polígono cruza a si mesmo (autointerseção). Corrija o desenho.');
  const ha = area(g) / 10000;
  if (!(ha > 0)) throw new GeometriaInvalida('O polígono não tem área.');
  const areaHa = ha.toFixed(4);
  if (areaInformadaHa && Number(areaInformadaHa) > 0) {
    const dif = Math.abs(ha - Number(areaInformadaHa)) / Number(areaInformadaHa);
    if (dif > 0.1) avisos.push(`A área do desenho (${ha.toFixed(2)} ha) difere ${Math.round(dif * 100)}% da área informada (${Number(areaInformadaHa).toFixed(2)} ha).`);
  }
  return { geometria: g, tipo: 'POLIGONO', areaHa, avisos };
}
