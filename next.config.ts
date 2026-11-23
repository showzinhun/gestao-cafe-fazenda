import type { NextConfig } from 'next';

const codespaces = !!process.env.CODESPACE_NAME;

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  // O PDF dos recibos é montado no servidor (§6.3).
  serverExternalPackages: ['@react-pdf/renderer'],
  // Evidências e certificados em PDF chegam por server action (até 5 MB, §10).
  // No GitHub Codespaces o sistema abre em https://<nome>-3000.app.github.dev (proxy): libera essa origem.
  experimental: { serverActions: { bodySizeLimit: '6mb', ...(codespaces ? { allowedOrigins: ['*.app.github.dev', 'localhost:3000'] } : {}) } },
  ...(codespaces ? { allowedDevOrigins: ['*.app.github.dev'] } : {}),
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default config;
