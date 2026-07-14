'use client';

const STORAGE_KEY = 'ybSoundVolume';

export function getVolume(): number {
  if (typeof window === 'undefined') return 0.5;
  const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '0.5');
  return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v));
}

export function setVolume(v: number) {
  if (typeof window === 'undefined') return;
  const clamped = Math.max(0, Math.min(1, v));
  localStorage.setItem(STORAGE_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent('ybvolumechange', { detail: clamped }));
}

let _sharedAc: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_sharedAc || _sharedAc.state === 'closed') {
      _sharedAc = new ((window as any).AudioContext ?? (window as any).webkitAudioContext)();
    }
    if (_sharedAc && _sharedAc.state === 'suspended') _sharedAc.resume();
    return _sharedAc;
  } catch { return null; }
}

// Desbloquear AudioContext no primeiro gesto do utilizador
if (typeof window !== 'undefined') {
  const unlock = () => { ctx(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });
}

function note(
  ac: AudioContext,
  freq: number,
  startOffset: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ac.currentTime + startOffset);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + startOffset + dur);
  osc.start(ac.currentTime + startOffset);
  osc.stop(ac.currentTime + startOffset + dur + 0.02);
}

// ── Nova lead — arpejo ascendente C5-E5-G5-C6 (alegre, "fanfarra de sucesso") ─
export function playLeadSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.18;
  const seq: [number, number][] = [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.31]];
  seq.forEach(([freq, t]) => note(ac, freq, t, 0.38, vol, 'sine'));
}

// ── Nova inbox (conversa iniciada) — 2 notas DESCENDENTES G5→C5, triângulo ────
//    (mais quente/mole que a lead, só 2 notas e a descer: "alguém chegou")
export function playInboxSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.19;
  [[784, 0], [523, 0.13]].forEach(([freq, t]) => note(ac, freq, t, 0.30, vol, 'triangle'));
}

// ── Nova visita ao site — 1 "tick" curto e suave (visitas são frequentes) ─────
//    volume mais baixo e 1 só nota alta: distingue-se sem incomodar.
export function playVisitSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.11;
  note(ac, 1245, 0, 0.09, vol, 'sine');
}

// ── Escalamento — duplo beep urgente (atenção imediata) ───────────────────────
export function playEscalationSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.22;
  [[880, 0], [880, 0.28]].forEach(([freq, t]) => note(ac, freq, t, 0.19, vol, 'square'));
}

// ── Nova mensagem em Chat ao Vivo — E6→B5 (ping suave, estilo messenger) ──────
export function playLiveChatSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.20;
  [[1319, 0], [988, 0.13]].forEach(([freq, t]) => note(ac, freq, t, 0.22, vol, 'sine'));
}

// ── Hipótese de agregação — G4→D5→G5 (oportunidade, triângulo) ───────────────
export function playAggSound() {
  const ac = ctx();
  if (!ac) return;
  const v = getVolume();
  if (v === 0) return;
  const vol = v * 0.16;
  [[392, 0], [587, 0.19], [784, 0.38]].forEach(([freq, t]) => note(ac, freq, t, 0.34, vol, 'triangle'));
}
