'use client';

import { useEffect, useRef, useCallback } from 'react';
import { playLeadSound, playEscalationSound, playAggSound, playLiveChatSound } from './soundManager';
import { speakEscalation, speakLead, speakAgg, speakLiveChat, speakNewBotConv, speakAggEscalation } from './ttsManager';

export type AggHintAlert = {
  type: 'aggHint';
  convId: string;
  refCode: string;
  telemovel: string;
  origem: string;
  destino: string;
  hintCount: number;
  topScore: number;
  topDriver: { name: string; phone: string } | null;
};

export type NotifAlert =
  | { type: 'escalation' | 'agg_escalation' | 'lead' | 'live_chat' }
  | AggHintAlert;

type LeadDetail = { urgencia: string | null; serviceType: string | null };

type NotifResponse = {
  escalations: number;
  aggEscalations: number;
  leads: number;
  leadDetails: LeadDetail[];
  aggHints: Omit<AggHintAlert, 'type'>[];
  liveChats: number;
  newBotConvs: number;
};

// ── Hook principal ───────────────────────────────────────────────────────────

export function useNotifications(
  onAlert: (alert: NotifAlert) => void,
  intervalMs = 8000,
) {
  // Inicializar um intervalo atrás para capturar eventos que chegaram logo antes do primeiro poll
  const sinceRef = useRef<Date>(new Date(Date.now() - intervalMs));
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?since=${sinceRef.current.toISOString()}`);
      const data: NotifResponse = await res.json();
      const now = new Date();

      // Construir fila de notificações para disparar em sequência (2 s de intervalo)
      // — evita que speak() da 2ª notificação cancele a voz da 1ª
      const queue: Array<() => void> = [];

      if ((data.newBotConvs ?? 0) > 0) {
        queue.push(() => {
          playLeadSound();
          speakNewBotConv();
          onAlertRef.current({ type: 'lead' });
        });
      }
      if (data.escalations > 0) {
        queue.push(() => {
          playEscalationSound();
          speakEscalation();
          onAlertRef.current({ type: 'escalation' });
        });
      }
      if ((data.aggEscalations ?? 0) > 0) {
        queue.push(() => {
          playEscalationSound();
          speakAggEscalation();
          onAlertRef.current({ type: 'agg_escalation' });
        });
      }
      if (data.leads > 0) {
        const first = data.leadDetails?.[0];
        queue.push(() => {
          playLeadSound();
          speakLead(first?.urgencia ?? undefined, first?.serviceType ?? undefined);
          onAlertRef.current({ type: 'lead' });
        });
      }
      if ((data.liveChats ?? 0) > 0) {
        queue.push(() => {
          playLiveChatSound();
          speakLiveChat();
          onAlertRef.current({ type: 'live_chat' });
        });
      }
      for (const hint of data.aggHints ?? []) {
        const h = hint;
        queue.push(() => {
          playAggSound();
          speakAgg();
          onAlertRef.current({ type: 'aggHint', ...h });
        });
      }

      // Atrasar todos os sons: 1 s base (AudioContext precisa de estar activo) + 2.2 s entre cada
      queue.forEach((fn, i) => setTimeout(fn, 1000 + i * 2200));

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
