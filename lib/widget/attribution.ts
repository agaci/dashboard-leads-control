import type { Db } from 'mongodb';

/**
 * Atribuição de leads a clientes de widget white-label (para apuramento de comissões).
 *
 * O `clientId` viaja do embed.js (atributo data-ybw-client) para o iframe, e daí para
 * o backend em cada evento. Como o iframe é servido pelo próprio dashboard, o header
 * `Origin` do pedido é sempre o nosso domínio — não serve para validar. A prova de
 * origem possível é o `ref` (hostname da página que embebe), que o embed.js lê no site
 * do cliente e passa no URL do iframe.
 *
 * Regras de validação:
 *  - o clientId tem de existir em `widgetClients` e estar activo;
 *  - se o cliente tiver domínios específicos em `allowedOrigins` (sem '*'), o `ref` tem
 *    de corresponder a um deles; caso contrário a lead NÃO é atribuída.
 *
 * Com `allowedOrigins: ['*']` a atribuição aceita qualquer ref — é o default de quem é
 * criado sem domínios. Para comissões, configurar sempre os domínios do cliente.
 */

export type WidgetAttribution = {
  widgetClientId: string;
  widgetClientName: string;
  widgetRef: string | null;
};

type CachedClient = {
  clientId: string;
  name: string;
  allowedOrigins: string[];
  active: boolean;
} | null;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; doc: CachedClient }>();

async function loadClient(db: Db, clientId: string): Promise<CachedClient> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.doc;

  const raw = await db.collection('widgetClients').findOne(
    { clientId },
    { projection: { clientId: 1, name: 1, allowedOrigins: 1, active: 1 } },
  );
  const doc: CachedClient = raw
    ? {
        clientId: raw.clientId,
        name: raw.name ?? raw.clientId,
        allowedOrigins: Array.isArray(raw.allowedOrigins) && raw.allowedOrigins.length ? raw.allowedOrigins : ['*'],
        active: raw.active !== false,
      }
    : null;

  cache.set(clientId, { at: Date.now(), doc });
  return doc;
}

// Normaliza para hostname comparável: tira protocolo, porta, path e 'www.'
function hostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/^www\./, '');
}

function refMatchesOrigins(ref: string | null, allowed: string[]): boolean {
  if (allowed.includes('*')) return true;
  if (!ref) return false;
  const host = hostOf(ref);
  return allowed.some((o) => {
    const allowedHost = hostOf(o);
    return host === allowedHost || host.endsWith('.' + allowedHost);
  });
}

/**
 * Devolve os campos de atribuição a carimbar na conversa / lead, ou `null` se o
 * clientId não for válido para esta origem. Nunca lança — atribuição em falta não
 * pode impedir o registo da lead.
 */
export async function resolveWidgetAttribution(
  db: Db,
  clientId: unknown,
  ref?: unknown,
): Promise<WidgetAttribution | null> {
  try {
    if (!clientId || typeof clientId !== 'string') return null;
    const id = clientId.trim();
    if (!id || id.length > 64) return null;

    const client = await loadClient(db, id);
    if (!client || !client.active) return null;

    const refStr = typeof ref === 'string' && ref.trim() ? ref.trim() : null;
    if (!refMatchesOrigins(refStr, client.allowedOrigins)) return null;

    return {
      widgetClientId: client.clientId,
      widgetClientName: client.name,
      widgetRef: refStr ? hostOf(refStr) : null,
    };
  } catch {
    return null;
  }
}

/** Limpa a cache — usar quando um widgetClient é editado no dashboard. */
export function invalidateWidgetClientCache(clientId?: string) {
  if (clientId) cache.delete(clientId);
  else cache.clear();
}
