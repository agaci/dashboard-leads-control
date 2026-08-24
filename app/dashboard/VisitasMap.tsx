'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './MiniMap';

export type VisitPing = { id: string; lat: number; lng: number; city?: string | null };

/** Uma visita já registada, para as bolhas fixas com contagem. */
export type VisitSpot = { lat: number; lng: number; city?: string | null };

// Plugin de agregação: junta pontos próximos numa bolha com o total e vai-os separando
// à medida que se aproxima o zoom. Carregado por CDN, como o próprio Leaflet.
let _clusterPromise: Promise<void> | null = null;
function loadCluster(L: any): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((L as any).markerClusterGroup) return Promise.resolve();
  if (_clusterPromise) return _clusterPromise;
  _clusterPromise = new Promise<void>((resolve, reject) => {
    for (const [id, href] of [
      ['leaflet-cluster-css', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'],
      ['leaflet-cluster-css-default', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'],
    ]) {
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet'; link.href = href;
        document.head.appendChild(link);
      }
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
    s.onload = () => resolve();
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return _clusterPromise;
}

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
export function VisitasMap({ pings, spots = [], onPickCity }: {
  pings: VisitPing[];
  spots?: VisitSpot[];
  onPickCity?: (city: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef<number[]>([]);
  const clusterRef = useRef<any>(null);
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

          /* Bolhas com o total de visitas. Tres tamanhos conforme a dimensao, para se
             perceber o peso de cada zona sem ler o numero. */
          .yb-bolha{display:flex;align-items:center;justify-content:center;border-radius:50%;
            font:700 12px/1 Inter,system-ui,sans-serif;color:#fff;
            background:rgba(14,116,144,.88);border:2px solid rgba(255,255,255,.9);
            box-shadow:0 2px 10px rgba(0,0,0,.28)}
          .yb-bolha.m{font-size:13px;background:rgba(8,145,178,.9)}
          .yb-bolha.g{font-size:14px;background:rgba(2,132,199,.92)}
          .yb-cidade{position:relative}
          .yb-cidade s{position:absolute;left:50%;transform:translateX(-50%);top:100%;margin-top:3px;
            white-space:nowrap;text-decoration:none;font:600 10px/1 Inter,system-ui,sans-serif;
            color:#0e7490;background:rgba(255,255,255,.92);padding:2px 6px;border-radius:6px;
            box-shadow:0 1px 4px rgba(0,0,0,.15)}
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

  // Bolhas fixas com o total de visitas por zona.
  //
  // A geolocalização é por IP, portanto todas as visitas de uma cidade partilham as mesmas
  // coordenadas (o centróide). Agregamos primeiro por cidade — uma bolha por cidade com o
  // seu total — e o plugin junta depois as cidades próximas conforme o zoom. O total de
  // cada bolha é a SOMA das visitas das cidades que contém, não o número de cidades.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;

    let cancelado = false;
    loadCluster(L).then(() => {
      if (cancelado || !mapRef.current) return;

      if (clusterRef.current) { map.removeLayer(clusterRef.current); clusterRef.current = null; }
      if (!spots.length) return;

      // Agregar por cidade (ou pelas coordenadas, quando não há nome)
      const porCidade = new Map<string, { lat: number; lng: number; city: string | null; n: number }>();
      for (const s of spots) {
        if (typeof s.lat !== 'number' || typeof s.lng !== 'number' || isNaN(s.lat) || isNaN(s.lng)) continue;
        const chave = s.city ? `c:${s.city}` : `p:${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
        const actual = porCidade.get(chave);
        if (actual) actual.n++;
        else porCidade.set(chave, { lat: s.lat, lng: s.lng, city: s.city ?? null, n: 1 });
      }

      const tamanho = (n: number) => (n >= 50 ? 46 : n >= 10 ? 40 : 34);
      const classe = (n: number) => (n >= 50 ? 'g' : n >= 10 ? 'm' : '');

      const grupo = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: false,   // pontos de cidades diferentes, não faz sentido abrir em leque
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster: any) => {
          const total = cluster.getAllChildMarkers().reduce((a: number, m: any) => a + (m.options.ybCount ?? 1), 0);
          const d = tamanho(total);
          return L.divIcon({
            html: `<div class="yb-bolha ${classe(total)}" style="width:${d}px;height:${d}px">${total}</div>`,
            className: '',
            iconSize: [d, d],
          });
        },
      });

      for (const c of porCidade.values()) {
        const d = tamanho(c.n);
        const marcador = L.marker([c.lat, c.lng], {
          ybCount: c.n,
          icon: L.divIcon({
            html: `<div class="yb-cidade"><div class="yb-bolha ${classe(c.n)}" style="width:${d}px;height:${d}px">${c.n}</div>${c.city ? `<s>${escapeHtml(c.city)}</s>` : ''}</div>`,
            className: '',
            iconSize: [d, d],
            iconAnchor: [d / 2, d / 2],
          }),
        } as any);
        if (c.city && onPickCity) marcador.on('click', () => onPickCity(c.city as string));
        grupo.addLayer(marcador);
      }

      grupo.addTo(map);
      clusterRef.current = grupo;
    }).catch(() => { /* sem plugin, o mapa fica só com os pings */ });

    return () => { cancelado = true; };
  }, [spots, ready, onPickCity]);

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
