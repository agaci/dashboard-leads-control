// ============================================================================
// Atribuição de campanha — normalização dos identificadores de clique do Google.
//
// O payload chega do site (site_YB/assets/js/yb-attr.js) por sendBeacon, portanto
// não é de confiança: vem de um endpoint público, sem autenticação. Tudo o que
// entra na base de dados passa por aqui primeiro — limites de tamanho, whitelist
// de campos, nada de objectos arbitrários.
//
// Alimenta a importação de conversões offline no Google Ads (ver
// app/api/conversions/export). Sem isto o Google não sabe que a lead existiu.
// ============================================================================

export type AttributionUtm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
};

export type Attribution = {
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  /** Momento do clique no anúncio (do cookie). Obrigatório na importação offline. */
  clickedAt: Date | null;
  landingPage: string | null;
  utm: AttributionUtm | null;
  /** 'php' (servidor, imune a bloqueadores) ou 'js' (fallback no browser). */
  src: string | null;
  /** Momento em que o servidor recebeu a atribuição. */
  receivedAt: Date;
};

const MAX_ID = 512;
const MAX_TEXT = 300;
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

// Remove caracteres de controlo: o valor acaba num CSV e numa página HTML.
function stripControl(v: string): string {
  let out = '';
  for (const ch of v) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c !== 127) out += ch;
  }
  return out;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const clean = stripControl(v).trim();
  return clean ? clean.slice(0, max) : null;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  // Um clique não pode ser do futuro nem anterior à janela de 90 dias.
  const now = Date.now();
  if (d.getTime() > now + 24 * 3600 * 1000) return null;
  if (d.getTime() < now - 400 * 24 * 3600 * 1000) return null;
  return d;
}

function normalizeUtm(raw: unknown): AttributionUtm | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out = {} as AttributionUtm;
  let any = false;
  for (const k of UTM_KEYS) {
    const v = str(src[k], MAX_TEXT);
    out[k] = v;
    if (v) any = true;
  }
  return any ? out : null;
}

/**
 * Converte o `attr` cru do beacon num documento seguro para gravar.
 * Devolve null se não houver nada de campanha — tráfego directo e orgânico não
 * geram registo de atribuição, e isso é normal.
 */
export function normalizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;

  const gclid = str(a.gclid, MAX_ID);
  const wbraid = str(a.wbraid, MAX_ID);
  const gbraid = str(a.gbraid, MAX_ID);
  const utm = normalizeUtm(a.utm);

  if (!gclid && !wbraid && !gbraid && !utm) return null;

  return {
    gclid,
    wbraid,
    gbraid,
    clickedAt: parseDate(a.capturedAt),
    landingPage: str(a.landingPage, MAX_TEXT),
    utm,
    src: str(a.src, 16),
    receivedAt: new Date(),
  };
}

/** Há um identificador que o Google Ads aceita numa importação offline? */
export function hasClickId(a: Attribution | null | undefined): boolean {
  return !!(a && (a.gclid || a.wbraid || a.gbraid));
}

/** Telemóvel PT reduzido a 9 dígitos — a chave de reconciliação com a lead. */
export function normalizePhone(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // Tolera 351XXXXXXXXX e 00351XXXXXXXXX.
  const local = digits.length > 9 ? digits.slice(-9) : digits;
  return /^[0-9]{9}$/.test(local) ? local : null;
}

/**
 * Estado de sincronização com o Google Ads, anexado a cada lead com atribuição.
 * 'pending' -> por exportar · 'exported' -> saiu num CSV · 'uploaded' -> confirmado
 * no Google Ads · 'skipped' -> deliberadamente fora.
 */
export type ConversionSyncStatus = 'pending' | 'exported' | 'uploaded' | 'skipped';

export function newConversionSync(): { status: ConversionSyncStatus; exportedAt: null; value: number } {
  return { status: 'pending', exportedAt: null, value: 0 };
}
