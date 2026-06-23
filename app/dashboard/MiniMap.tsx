'use client';

import { useEffect, useRef } from 'react';

// Carrega o Leaflet por CDN (sem dependência no build). Cacheia a promessa.
let _leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return _leafletPromise;
}

// Mini-mapa Leaflet + OpenStreetMap (sem chave). Marker; círculo de incerteza se aproximado.
export function MiniMap({ lat, lng, zoom, exact, height = 170 }: { lat: number; lng: number; zoom: number; exact: boolean; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    loadLeaflet().then((L: any) => {
      if (cancelled || !ref.current || !L) return;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      L.marker([lat, lng]).addTo(map);
      if (!exact) {
        L.circle([lat, lng], { radius: 4000, color: '#00bcd4', weight: 1, fillColor: '#00bcd4', fillOpacity: 0.12 }).addTo(map);
      }
      setTimeout(() => { if (!cancelled && map) map.invalidateSize(); }, 100);
    }).catch(() => {});
    return () => { cancelled = true; if (map) map.remove(); };
  }, [lat, lng, zoom, exact]);
  return <div ref={ref} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden', zIndex: 0 }} />;
}
