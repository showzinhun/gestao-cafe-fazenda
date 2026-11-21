import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegistrarSW } from '@/componentes/registrar-sw';

export const metadata: Metadata = {
  title: { default: 'Gestão do Café', template: '%s · Gestão do Café' },
  description: 'Do talhão ao embarque: colheita, pós-colheita, armazém e venda.',
  applicationName: 'Gestão do Café',
  appleWebApp: { capable: true, title: 'Café', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icone-192.png', apple: '/icons/icone-192.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#132a1f' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1611' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
