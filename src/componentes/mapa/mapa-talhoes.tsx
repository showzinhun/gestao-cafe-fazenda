'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapaGL, GeoJSONSource, Marker as MarcadorGL } from 'maplibre-gl';
import centroide from '@turf/centroid';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface TalhaoMapa {
  id: string;
  codigo: string;
  geometria: Geometry | null;
}

/** Fundo OpenStreetMap (raster), conforme a stack do projeto. */
const ESTILO = {
  version: 8 as const,
  sources: {
    osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function colecao(talhoes: TalhaoMapa[], destaque?: string | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: talhoes.filter((t) => t.geometria).map((t) => ({ type: 'Feature', geometry: t.geometria!, properties: { codigo: t.codigo, destaque: t.id === destaque } }) as Feature),
  };
}

function limites(fc: FeatureCollection): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const visitar = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      xs.push(c[0] as number);
      ys.push(c[1] as number);
    } else if (Array.isArray(c)) c.forEach(visitar);
  };
  fc.features.forEach((f) => visitar((f.geometry as { coordinates?: unknown }).coordinates));
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
}

/**
 * Mapa dos talhões (MapLibre GL + OSM). No modo desenho, cada clique adiciona um vértice;
 * "Concluir" devolve o polígono fechado para o formulário.
 */
export function MapaTalhoes({ talhoes, destaque, desenhando, aoConcluirDesenho, aoCancelarDesenho }: { talhoes: TalhaoMapa[]; destaque?: string | null; desenhando?: boolean; aoConcluirDesenho?: (p: Polygon) => void; aoCancelarDesenho?: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const [pronto, setPronto] = useState(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const desenho = useRef(false);
  const criarMarcador = useRef<((el: HTMLElement) => MarcadorGL) | null>(null);
  const rotulos = useRef<MarcadorGL[]>([]);
  desenho.current = !!desenhando;

  useEffect(() => {
    let vivo = true;
    import('maplibre-gl').then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (!vivo || !caixa.current) return;
      setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
      criarMarcador.current = (el) => new Marker({ element: el });
      const m = new Map({ container: caixa.current, style: ESTILO, center: [-46.99, -18.94], zoom: 4, attributionControl: { compact: true } });
      m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('talhoes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'talhoes-area', type: 'fill', source: 'talhoes', paint: { 'fill-color': ['case', ['get', 'destaque'], '#e2ac45', '#2e6b4c'], 'fill-opacity': 0.35 } });
        m.addLayer({ id: 'talhoes-borda', type: 'line', source: 'talhoes', paint: { 'line-color': ['case', ['get', 'destaque'], '#b5822a', '#132a1f'], 'line-width': 2 } });
        m.addLayer({ id: 'talhoes-ponto', type: 'circle', source: 'talhoes', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#2e6b4c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.addSource('desenho', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'desenho-linha', type: 'line', source: 'desenho', paint: { 'line-color': '#b5822a', 'line-width': 2, 'line-dasharray': [2, 1] } });
        m.addLayer({ id: 'desenho-vertices', type: 'circle', source: 'desenho', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#e2ac45', 'circle-stroke-color': '#132a1f', 'circle-stroke-width': 1.5 } });
        setPronto(true);
      });
      m.on('click', (e) => {
        if (!desenho.current) return;
        setVertices((v) => [...v, [Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]]);
      });
      mapa.current = m;
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const fc = colecao(talhoes, destaque);
    (m.getSource('talhoes') as GeoJSONSource).setData(fc);
    // Rótulos em HTML: um layer de texto exigiria fontes (glyphs) de um servidor externo.
    rotulos.current.forEach((r) => r.remove());
    rotulos.current = fc.features.flatMap((f) => {
      if (!criarMarcador.current) return [];
      const el = document.createElement('span');
      el.className = 'rotulo-talhao';
      el.textContent = String(f.properties?.codigo ?? '');
      const [lng, lat] = centroide(f).geometry.coordinates as [number, number];
      return [criarMarcador.current(el).setLngLat([lng, lat]).addTo(m)];
    });
    const alvo = destaque ? colecao(talhoes.filter((t) => t.id === destaque)) : fc;
    const b = limites(alvo.features.length ? alvo : fc);
    if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: 16, duration: 0 });
  }, [pronto, talhoes, destaque]);

  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const feats: Feature[] = vertices.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
    if (vertices.length > 1) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: vertices.length > 2 ? [...vertices, vertices[0]!] : vertices }, properties: {} });
    (m.getSource('desenho') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
    m.getCanvas().style.cursor = desenhando ? 'crosshair' : '';
  }, [pronto, vertices, desenhando]);

  useEffect(() => {
    if (!desenhando) setVertices([]);
  }, [desenhando]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-linha">
      <div ref={caixa} className="h-[380px] w-full bg-superficie-2" aria-label="Mapa dos talhões" role="region" />
      {desenhando ? (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-lg bg-superficie/95 p-2.5 text-[13px] shadow">
          <span className="mr-auto">Clique no mapa para marcar os vértices ({vertices.length}).</span>
          <button type="button" className="rounded-md border border-linha px-2.5 py-1" onClick={() => setVertices((v) => v.slice(0, -1))} disabled={!vertices.length}>Desfazer ponto</button>
          <button type="button" className="rounded-md border border-linha px-2.5 py-1" onClick={() => aoCancelarDesenho?.()}>Cancelar</button>
          <button
            type="button"
            className="rounded-md bg-destaque px-2.5 py-1 font-semibold text-destaque-tinta disabled:opacity-50"
            disabled={vertices.length < 3}
            onClick={() => aoConcluirDesenho?.({ type: 'Polygon', coordinates: [[...vertices, vertices[0]!]] })}
          >
            Concluir polígono
          </button>
        </div>
      ) : null}
    </div>
  );
}
