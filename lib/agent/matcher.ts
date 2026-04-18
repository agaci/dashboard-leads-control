import type { Situacao, ConversationData } from '@/types/agent';
import { getAllSituacoes, getSituacoesAlta } from './situacoes';

// Códigos de activação directa (trigger words do WhatsApp)
const TRIGGER_CODES: Record<string, string> = {
  PSERV:  'SIT-021',  // novo serviço — fluxo principal
  ESTADO: 'SIT-025',  // consulta estado de serviço existente
  AJUDA:  'SIT-100',  // lista de opções
};

// Sinais contextuais → SIT específica (alta prioridade)
const CONTEXT_SIGNALS: { pattern: RegExp; id: string }[] = [
  { pattern: /ilhas|madeira|a[çc]ores/i,                id: 'SIT-006' },
  { pattern: /espanha|espa[nñ]a|fatura espanhola/i,     id: 'SIT-010' },
  { pattern: /m[eé]dico|farm[aá]cia|urgente m[eé]d/i,  id: 'SIT-012' },
  { pattern: /notar|tribunal|processo|legal/i,          id: 'SIT-007' },
  { pattern: /danificad|partido|estragad|partir/i,      id: 'SIT-033' },
  { pattern: /cancelar|cancel/i,                        id: 'SIT-031' },
  { pattern: /rastrear|tracking|onde est[aá]/i,         id: 'SIT-025' },
  { pattern: /seguro|segurança da carga/i,              id: 'SIT-061' },
  { pattern: /fatura|factura/i,                         id: 'SIT-076' },
  { pattern: /perdi|perder|esqueci/i,                   id: 'SIT-047' },
  { pattern: /driver|estafeta|motorista/i,              id: 'SIT-082' },
  { pattern: /falar com (algu[eé]m|humano|pessoa)/i,   id: 'SIT-041' },
  { pattern: /mais barato|concorr|outro fornec/i,       id: 'SIT-005' },
  { pattern: /animal|c[ãa]o|gato|pet/i,                id: 'SIT-044' },
  { pattern: /m[uú]dan[cç]a|mudar de casa/i,           id: 'SIT-027' },
  { pattern: /fr[aá]gil|vidro|arte|sens[íi]vel/i,      id: 'SIT-028' },
  { pattern: /temperatura|frio|congelad|farmac/i,       id: 'SIT-029' },
  { pattern: /aeroporto|voo|chegada/i,                  id: 'SIT-057' },
  { pattern: /palete|pallet/i,                          id: 'SIT-024' },
  { pattern: /24 horas|amanhã|próximo dia/i,            id: 'SIT-053' },
];

// Detecção de sinais de preço chocante
const PRICE_SHOCK_SIGNALS = [
  /caro|muito caro|é muito|preço alto/i,
  /quanto custou|não esperava/i,
  /desconto|mais barat|reduzir/i,
];

// Detecção de lead a desaparecer / sem resposta (tratado externamente por timeout)
export function isPriceShock(text: string): boolean {
  return PRICE_SHOCK_SIGNALS.some((r) => r.test(text));
}

export function isEscalationRequest(text: string): boolean {
  return /falar com (algu[eé]m|humano|pessoa)|quero humano|preciso de ajuda|n[ãa]o quero bot/i.test(text);
}

// Detecta o trigger code (PSERV / ESTADO / AJUDA)
export function matchTriggerCode(text: string): string | null {
  const upper = text.trim().toUpperCase();
  return TRIGGER_CODES[upper] ?? null;
}

// Matcher principal — devolve a SIT mais relevante para a mensagem
export function matchSituacao(
  mensagem: string,
  contexto?: Partial<ConversationData>
): string | null {
  // 1. Trigger directo
  const trigger = matchTriggerCode(mensagem);
  if (trigger) return trigger;

  // 2. Sinais contextuais de alta prioridade
  for (const sig of CONTEXT_SIGNALS) {
    if (sig.pattern.test(mensagem)) return sig.id;
  }

  // 3. Choque de preço após preço apresentado
  if (contexto?.priceCalculated && isPriceShock(mensagem)) return 'SIT-001';

  // 4. Lead sem detalhes (pergunta preço antes de dar info)
  if (/quanto custa|qual o pre[cç]o|pre[cç]o/i.test(mensagem) && !contexto?.origem) {
    return 'SIT-023';
  }

  // 5. Lead desconhece o que quer enviar
  if (/n[ãa]o sei|depende|talvez|tipo de carga/i.test(mensagem) && !contexto?.viatura) {
    return 'SIT-004';
  }

  // 6. Percorrer situações de alta frequência — sinais_deteccao textuais
  for (const sit of getSituacoesAlta()) {
    if (!sit?.sinais_deteccao?.length) continue;
    const matchCount = sit.sinais_deteccao.filter((sinal) =>
      mensagem.toLowerCase().includes(sinal.toLowerCase().split(' ').slice(0, 3).join(' '))
    ).length;
    if (matchCount >= 1) return sit.id;
  }

  return null;
}

// Para múltiplas situações em paralelo (contexto rico)
export function matchMultiple(
  mensagem: string,
  contexto?: Partial<ConversationData>,
  limit = 3
): Situacao[] {
  const all = getAllSituacoes();
  const scores: { sit: Situacao; score: number }[] = [];

  for (const sit of all) {
    if (!sit?.sinais_deteccao?.length) continue;
    let score = 0;
    for (const sinal of sit.sinais_deteccao) {
      const words = sinal.toLowerCase().split(' ').filter((w) => w.length > 3);
      const matches = words.filter((w) => mensagem.toLowerCase().includes(w)).length;
      score += matches;
    }
    if (score > 0) scores.push({ sit, score });
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.sit);
}
