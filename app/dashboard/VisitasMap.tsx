'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './MiniMap';

export type VisitPing = { id: string; lat: number; lng: number; city?: string | null };

// Bounds de Portugal continental (SW -> NE). Ilhas ficam de fora de propósito
// (o mapa foca o continente; visitas dos Açores/Madeira ainda entram na coluna).
const PT_BOUNDS: [[number, number], [number, number]] = [
  [36.8, -9.9],
  [42.3, -6.0],
];

const PING_MS = 6000; // tempo que o pin fica visível a pulsar
const FADE_MS = 900;  // desvanecimento antes de remover

// Mapa "ao vivo": cada visita nova faz cair um pin a pulsar durante uns segundos e
// depois desvanece, para não poluir. A coluna de visitas guarda o registo completo.
export function VisitasMap({ pings, onPickCity }: { pings: VisitPing[]; onPickCity?: (city: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef<number[]>([]);
  const [ready, setReady] = useState(false);

  // Inicializar o mapa uma vez.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L: any) => {
      if (cancelled || !ref.current || !L || mapRef.current) return;
      LRef.current = L;

      // CSS dos pins (uma vez).
      if (!document.getElementById('yb-visit-ping-css')) {
        const st = document.createElement('style');
        st.id = 'yb-visit-ping-css';
        st.textContent = `
          .yb-ping{position:relative}
          .yb-ping i{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;
            background:#00bcd4;box-shadow:0 0 10px 2px rgba(0,188,212,.85)}
          .yb-ping b{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;
            border:2px solid #00bcd4;animation:ybPingRing 1.5s ease-out infinite}
          .yb-ping b.d2{animation-delay:.5s}
          .yb-ping s{position:absolute;left:14px;top:-9px;white-space:nowrap;text-decoration:none;
            font:700 11px/1 Inter,system-ui,sans-serif;color:#0e7490;
            background:rgba(255,255,255,.92);padding:3px 7px;border-radius:8px;
            box-shadow:0 2px 8px rgba(0,0,0,.15)}
          .yb-ping.fade{transition:opacity ${FADE_MS}ms ease;opacity:0}
          @keyframes ybPingRing{0%{transform:scale(1);opacity:.85}100%{transform:scale(4.6);opacity:0}}
        `;
        document.head.appendChild(st);
      }

      const map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
        minZoom: 6,
        maxBounds: [[35.5, -12.5], [43.8, -4.5]],
        maxBoundsViscosity: 0.8,
      });
      map.fitBounds(PT_BOUNDS);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => { if (mapRef.current) mapRef.current.invalidateSize(); }, 120);
    }).catch(() => {});

    return () => {
      cancelled = true;
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Animar pins novos.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    for (const p of pings) {
      if (seen.current.has(p.id)) continue;
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || isNaN(p.lat) || isNaN(p.lng)) continue;
      seen.current.add(p.id);

      const label = p.city ? `<s>${escapeHtml(p.city)}</s>` : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="yb-ping"><b></b><b class="d2"></b><i></i>${label}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([p.lat, p.lng], { icon, keyboard: false }).addTo(map);
      if (p.city && onPickCity) {
        marker.on('click', () => onPickCity(p.city as string));
      }

      const el = () => marker.getElement()?.querySelector('.yb-ping') as HTMLElement | null;
      const t1 = window.setTimeout(() => { const e = el(); if (e) e.classList.add('fade'); }, PING_MS);
      const t2 = window.setTimeout(() => { try { map.removeLayer(marker); } catch { /* noop */ } }, PING_MS + FADE_MS);
      timers.current.push(t1, t2);
    }
  }, [pings, onPickCity, ready]);

  return <div ref={ref} style={{ height: '100%', width: '100%', borderRadius: 14, overflow: 'hidden', zIndex: 0 }} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
