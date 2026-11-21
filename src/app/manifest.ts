import type { MetadataRoute } from 'next';

/** Manifesto do PWA (instalável; o modo offline completo chega na Fase 4). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gestão do Café — Fazenda',
    short_name: 'Café',
    description: 'Do talhão ao embarque: colheita, pós-colheita, armazém e venda.',
    lang: 'pt-BR',
    start_url: '/campo',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#132a1f',
    theme_color: '#132a1f',
    icons: [
      { src: '/icons/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
