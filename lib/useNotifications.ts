'use client';

import { useEffect, useRef, useCallback } from 'react';
import { playLeadSound, playEscalationSound, playAggSound, playLiveChatSound } from './soundManager';
import { speakEscalation, speakLead, speakAgg, speakLiveChat } from './ttsManager';

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
  | { type: 'escalation' | 'lead' | 'live_chat' }
  | AggHintAlert;

type LeadDetail = { urgencia: string | null; serviceType: string | null };

type NotifResponse = {
  escalations: number;
  leads: number;
  leadDetails: LeadDetail[];
  aggHints: Omit<AggHintAlert, 'type'>[];
  liveChats: number;
};

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
      const data: NotifResponse = await res.json();
      const now = new Date();

      if (data.escalations > 0) {
        playEscalationSound();
        speakEscalation();
        onAlertRef.current({ type: 'escalation' });
      }
      if (data.leads > 0) {
        playLeadSound();
        const first = data.leadDetails?.[0];
        speakLead(first?.urgencia ?? undefined, first?.serviceType ?? undefined);
        onAlertRef.current({ type: 'lead' });
      }
      if ((data.liveChats ?? 0) > 0) {
        playLiveChatSound();
        speakLiveChat();
        onAlertRef.current({ type: 'live_chat' });
      }
      for (const hint of data.aggHints ?? []) {
        playAggSound();
        speakAgg();
        onAlertRef.current({ type: 'aggHint', ...hint });
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
