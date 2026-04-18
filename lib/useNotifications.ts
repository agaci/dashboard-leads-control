'use client';

import { useEffect, useRef, useCallback } from 'react';

type NotifCounts = { escalations: number; leads: number };
type NotifAlert = { type: 'escalation' | 'lead' };

// ── Sons via Web Audio API ───────────────────────────────────────────────────

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  return new (window.AudioContext ?? (window as any).webkitAudioContext)();
}

function playEscalationSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  // Dois bips urgentes
  [0, 0.25].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.2);
  });
}

function playLeadSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  // Acorde ascendente agradável
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.4);
  });
}

// ── Hook principal ───────────────────────────────────────────────────────────

export function useNotifications(
  onAlert: (alert: NotifAlert) => void,
  intervalMs = 8000,
) {
  const sinceRef = useRef<Date>(new Date());
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?since=${sinceRef.current.toISOString()}`);
      const data: NotifCounts = await res.json();
      const now = new Date();

      if (data.escalations > 0) {
        playEscalationSound();
        onAlertRef.current({ type: 'escalation' });
      }
      if (data.leads > 0) {
        playLeadSound();
        onAlertRef.current({ type: 'lead' });
      }

      sinceRef.current = now;
    } catch {
      // falha silenciosa
    }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);
}
