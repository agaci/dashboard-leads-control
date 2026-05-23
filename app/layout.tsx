import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'YourBox · Leads',
  description: 'YourBox — Dashboard de gestão de leads',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-16x16.png',  sizes: '16x16',   type: 'image/png' },
      { url: '/icons/icon-32x32.png',  sizes: '32x32',   type: 'image/png' },
      { url: '/icons/icon-48x48.png',  sizes: '48x48',   type: 'image/png' },
      { url: '/favicon.ico',           sizes: '256x256', type: 'image/x-icon' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
      { url: '/icons/icon-167x167.png',     sizes: '167x167' },
      { url: '/icons/icon-152x152.png',     sizes: '152x152' },
      { url: '/icons/icon-120x120.png',     sizes: '120x120' },
    ],
  },
  openGraph: {
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630 }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'YB Leads',
    'theme-color': '#bfd630',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
