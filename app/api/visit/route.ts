import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

// Regista visitas ao site (aberturas de qualquer variante da landing / quiz), enviadas
// por navigator.sendBeacon a partir do site (site_YB/assets/js/yourbox-visit.js).
//
// Captura de 1a parte (nao Google Analytics): geo por IP obtido no BROWSER via geojs.io
// (contorna o IP mascarado pelo Docker no servidor) e enviado no payload. IP guardado
// ANONIMIZADO (ultimo octeto a zero). TTL de 90 dias na coleccao `visits`.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj: unknown, status = 200) {
  return Response.json(obj, { status, headers: CORS });
}

// RGPD: IPv4 -> ultimo octeto a zero (85.240.13.7 -> 85.240.13.0); IPv6 -> 3 primeiros grupos.
function anonymizeIp(ip?: string | null): string | null {
  if (!ip || typeof ip !== 'string') return null;
  const v = ip.trim();
  if (v.indexOf('.') !== -1) {
    const p = v.split('.');
    if (p.length === 4) { p[3] = '0'; return p.join('.'); }
    return v;
  }
  if (v.indexOf(':') !== -1) {
    return v.split(':').slice(0, 3).join(':') + '::';
  }
  return v;
}

// Tipo de aparelho a partir do userAgent: 'mobile' | 'tablet' | 'desktop'.
function deviceFromUA(ua?: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobi))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/.test(s)) return 'mobile';
  return 'desktop';
}

// Sistema operativo (rótulo curto) a partir do userAgent.
function osFromUA(ua?: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'iOS';
  if (/android/.test(s)) return 'Android';
  if (/windows/.test(s)) return 'Windows';
  if (/mac os|macintosh/.test(s)) return 'macOS';
  if (/cros/.test(s)) return 'ChromeOS';
  if (/linux/.test(s)) return 'Linux';
  return null;
}

// Prepara a visita para o dashboard: garante device/os (deriva do ua p/ registos
// antigos) e nunca envia o userAgent em bruto.
function shapeVisit(v: any) {
  const device = v.device ?? deviceFromUA(v.ua);
  const os = v.os ?? osFromUA(v.ua);
  const { ua, ...rest } = v;
  void ua;
  return { ...rest, device, os };
}

// Enriquece cada visita com o estado do funil (Visita -> Inbox -> Lead), ligando por
// `visitSid` (só existe em dados novos). Uma query para todas as visitas do lote.
async function withStages(db: Awaited<ReturnType<typeof getDb>>, rows: any[]): Promise<any[]> {
  const sids = rows.map((r) => r.sessionId).filter(Boolean);
  if (!sids.length) return rows;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const convs = await db.collection('conversations')
    .find({ visitSid: { $in: sids } }, { projection: { visitSid: 1, step: 1, leadId: 1, 'data.telefone': 1, 'data.email': 1 } })
    .toArray();
  type St = { inbox: boolean; lead: boolean; hasPhone: boolean; hasEmail: boolean };
  const map: Record<string, St> = {};
  for (const c of convs as any[]) {
    const s = String(c.visitSid);
    const isLead = c.step === 'LEAD_REGISTERED' || !!c.leadId;
    const hasPhone = String(c.data?.telefone ?? '').replace(/\D/g, '').length >= 9;
    const hasEmail = emailRe.test(String(c.data?.email ?? ''));
    const cur = map[s] ?? { inbox: false, lead: false, hasPhone: false, hasEmail: false };
    map[s] = { inbox: true, lead: cur.lead || isLead, hasPhone: cur.hasPhone || hasPhone, hasEmail: cur.hasEmail || hasEmail };
  }
  return rows.map((r) => ({ ...r, stage: map[r.sessionId] ?? { inbox: false, lead: false, hasPhone: false, hasEmail: false } }));
}

// Inicio do dia de HOJE em Lisboa, como instante UTC (independente do fuso do servidor).
function lisbonStartOfTodayUtc(): Date {
  const now = new Date();
  const lisbonNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const diff = now.getTime() - lisbonNow.getTime();
  const midnight = new Date(lisbonNow.getFullYear(), lisbonNow.getMonth(), lisbonNow.getDate(), 0, 0, 0, 0);
  return new Date(midnight.getTime() + diff);
}

// Garante os indices (TTL 90 dias + firstSeen) uma vez por processo.
let _idxEnsured = false;
async function ensureIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  if (_idxEnsured) return;
  _idxEnsured = true;
  try {
    await db.collection('visits').createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
    await db.collection('visits').createIndex({ firstSeen: -1 });
    await db.collection('visits').createIndex({ sessionId: 1 }, { unique: true });
  } catch { /* indices ja existem */ }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// POST — beacon do site (cross-origin, text/plain, sem preflight). Upsert por sessao.
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const b = raw ? JSON.parse(raw) : {};
    const { sessionId, page, referrer, variante, ua, geo } = b as {
      sessionId?: string;
      page?: string;
      referrer?: string | null;
      variante?: string | null;
      ua?: string | null;
      geo?: { ip?: string; city?: string; region?: string; country?: string; lat?: number; lng?: number } | null;
    };
    if (!sessionId || typeof sessionId !== 'string') return json({ error: 'sessionId em falta' }, 400);

    const db = await getDb();
    await ensureIndexes(db);
    const now = new Date();

    const geoSet: Record<string, unknown> = {};
    if (geo && (geo.city || geo.lat != null)) {
      geoSet.geo = {
        source: 'ip',
        ip: anonymizeIp(geo.ip),
        city: geo.city ?? null,
        region: geo.region ?? null,
        country: geo.country ?? null,
        lat: geo.lat != null ? Number(geo.lat) : null,
        lng: geo.lng != null ? Number(geo.lng) : null,
      };
    }

    await db.collection('visits').updateOne(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          createdAt: now,
          firstSeen: now,
          entryPage: page ?? null,
          referrer: referrer ?? null,
          variante: variante ?? null,
        },
        $set: {
          lastSeen: now,
          ...(page ? { lastPage: page } : {}),
          ...(ua ? { ua, device: deviceFromUA(ua), os: osFromUA(ua) } : {}),
          ...geoSet,
        },
        $inc: { pageViews: 1 },
      },
      { upsert: true },
    );

    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

// GET — leitura pelo dashboard.
//   ?since=<iso>  -> visitas NOVAS (firstSeen > since), para os pins ao vivo.
//   ?range=hoje|ontem|semana|tudo -> lista da coluna (default hoje).
export async function GET(req: NextRequest) {
  try {
    // Leitura só para o dashboard (autenticado). O POST (beacon) fica público.
    const session = await getServerSession(authOptions);
    if (!session?.user) return json({ error: 'Não autenticado' }, 401);

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');
    const range = searchParams.get('range') || 'hoje';

    const db = await getDb();
    const col = db.collection('visits');
    const projection = { projection: { _id: 0 } } as any;

    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) {
        const rows = await col
          .find({ firstSeen: { $gt: d } }, projection)
          .sort({ firstSeen: 1 })
          .limit(100)
          .toArray();
        return json({ visits: await withStages(db, rows.map(shapeVisit)) });
      }
    }

    let query: Record<string, unknown>;
    if (range === 'tudo') {
      query = {};
    } else if (range === 'semana') {
      const start = new Date(lisbonStartOfTodayUtc().getTime() - 6 * 24 * 3600 * 1000);
      query = { firstSeen: { $gte: start } };
    } else if (range === 'ontem') {
      const end = lisbonStartOfTodayUtc();
      const start = new Date(end.getTime() - 24 * 3600 * 1000);
      query = { firstSeen: { $gte: start, $lt: end } };
    } else {
      query = { firstSeen: { $gte: lisbonStartOfTodayUtc() } };
    }

    const [rows, todayCount] = await Promise.all([
      col.find(query, projection).sort({ firstSeen: -1 }).limit(400).toArray(),
      col.countDocuments({ firstSeen: { $gte: lisbonStartOfTodayUtc() } }),
    ]);

    return json({ visits: await withStages(db, rows.map(shapeVisit)), todayCount });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
