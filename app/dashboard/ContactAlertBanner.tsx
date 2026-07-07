'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';

type Req = {
  convId: string;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  destino: string | null;
  at: string | null;
  channel: string | null;
};

function ago(iso?: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)}h`;
}

// Alarme de "Pede contacto": banner fixo, bem visível, a piscar, com som (via
// useNotifications) até a operadora clicar "Atendido". Global — aparece em qualquer tab.
export default function ContactAlertBanner() {
  const isMobile = useIsMobile();
  const [reqs, setReqs] = useState<Req[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/contact-request?open=1', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setReqs(Array.isArray(d.requests) ? d.requests : []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 6000);
    return () => window.clearInterval(id);
  }, [load]);

  const ack = useCallback(async (convId: string) => {
    setReqs((p) => p.filter((x) => x.convId !== convId)); // optimista
    try {
      await fetch('/api/contact-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convId }),
      });
    } catch { /* silencioso */ }
    load();
  }, [load]);

  if (!reqs.length) return null;

  return (
    <>
      <style>{`
        @keyframes ybCrPulse{0%,100%{box-shadow:0 8px 24px rgba(0,0,0,.18),0 0 0 0 rgba(220,38,38,.5)}50%{box-shadow:0 8px 24px rgba(0,0,0,.18),0 0 0 12px rgba(220,38,38,0)}}
        @keyframes ybCrBlink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ybCrIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 5000, width: 'min(700px, 94vw)', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {reqs.map((r) => {
          const tel = r.telefone ? String(r.telefone).replace(/\D/g, '') : '';
          return (
            <div key={r.convId} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              background: '#fff', border: '2px solid #dc2626', borderRadius: 14,
              animation: 'ybCrPulse 1.5s ease-out infinite, ybCrIn .25s ease',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#dc2626', animation: 'ybCrBlink 1s infinite', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', color: '#dc2626', textTransform: 'uppercase' }}>
                    Pede contacto{r.channel ? ` · ${r.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}` : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#1a2332', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.nome || 'Contacto'}{r.telefone ? ` · ${r.telefone}` : ''}
                  </span>
                  {(r.origem || r.destino) && (
                    <span style={{ display: 'block', fontSize: 11.5, color: '#5b6472', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(r.origem || '').split(',')[0]} → {(r.destino || '').split(',')[0]} · {ago(r.at)}
                    </span>
                  )}
                </span>
              </span>

              {tel && isMobile && (
                <a href={`tel:+351${tel}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13,
                  padding: '9px 16px', borderRadius: 10, textDecoration: 'none',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Ligar
                </a>
              )}

              <button onClick={() => ack(r.convId)} style={{
                flexShrink: 0, background: '#1a2332', color: '#fff', fontWeight: 700, fontSize: 13,
                padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2b3b57'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1a2332'; }}
              >
                Atendido
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
