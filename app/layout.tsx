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
    <html lang="pt" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: aplica tema antes do primeiro render */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('yb-theme')||'light',r=document.documentElement;if(t==='light'){r.setAttribute('data-theme','light');var v=[['--yb-bg','#F1F5F9'],['--yb-card','#FFFFFF'],['--yb-card-2','#EBF0F7'],['--yb-fg','#1a2b4a'],['--yb-muted','#5a7394'],['--yb-subtle','#94a3b8'],['--yb-border','rgba(0,0,0,0.09)'],['--yb-input','rgba(0,0,0,0.04)'],['--yb-cyan','#0097a7'],['--background','210 20% 97%'],['--foreground','222 50% 19%'],['--card','0 0% 100%'],['--secondary','210 35% 92%'],['--secondary-foreground','222 50% 19%'],['--muted','210 35% 92%'],['--muted-foreground','215 28% 44%'],['--accent','210 30% 87%'],['--accent-foreground','222 50% 19%'],['--border','215 22% 82%'],['--input','215 22% 82%'],['--ring','187 80% 38%'],['--primary','187 80% 38%'],['--cyan','187 80% 38%'],['--sidebar-background','210 25% 93%'],['--sidebar-foreground','222 50% 19%'],['--sidebar-border','215 22% 80%']];v.forEach(function(p){r.style.setProperty(p[0],p[1])});}else{r.removeAttribute('data-theme');}})();` }} />
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
