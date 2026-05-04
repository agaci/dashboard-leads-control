'use client';

// ── Chaves localStorage ───────────────────────────────────────────────────────
const KEYS = {
  enabled:    'ybVoiceEnabled',
  escalation: 'ybVoiceEscalation',
  lead:       'ybVoiceLead',
  agg:        'ybVoiceAgg',
} as const;

type VoiceKey = keyof typeof KEYS;

export function getVoiceSetting(key: VoiceKey): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(KEYS[key]);
  if (stored === null) return key !== 'enabled'; // enabled=false por defeito; outros=true
  return stored === 'true';
}

export function setVoiceSetting(key: VoiceKey, value: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS[key], String(value));
  window.dispatchEvent(new CustomEvent('ybvoicechange', { detail: { key, value } }));
}

// ── Motor de síntese ──────────────────────────────────────────────────────────

function speak(text: string) {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-PT';
  u.rate = 0.9;
  u.pitch = 1.05;
  // Prefer a Portuguese voice if available
  const voices = window.speechSynthesis.getVoices();
  const ptVoice = voices.find((v) => v.lang.startsWith('pt'));
  if (ptVoice) u.voice = ptVoice;
  window.speechSynthesis.speak(u);
}

// ── Funções públicas ──────────────────────────────────────────────────────────

export function speakEscalation() {
  if (!getVoiceSetting('enabled') || !getVoiceSetting('escalation')) return;
  speak('Escalamento urgente');
}

export function speakLead(urgencia?: string, serviceType?: string) {
  if (!getVoiceSetting('enabled') || !getVoiceSetting('lead')) return;
  let msg = 'Nova lead';
  if (serviceType === 'internacional') msg += ', Internacional';
  else if (urgencia === '1 Hora')   msg += ', um hora';
  else if (urgencia === '4 Horas')  msg += ', quatro horas';
  else if (urgencia === '24 Horas') msg += ', entrega amanhã';
  speak(msg);
}

export function speakAgg() {
  if (!getVoiceSetting('enabled') || !getVoiceSetting('agg')) return;
  speak('Hipótese de agregação');
}

export function previewVoice() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Nova lead, quatro horas');
  u.lang = 'pt-PT';
  u.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const ptVoice = voices.find((v) => v.lang.startsWith('pt'));
  if (ptVoice) u.voice = ptVoice;
  window.speechSynthesis.speak(u);
}
