import type { Db } from 'mongodb';

/**
 * Gestão de leads — estado, prioridade, notas, follow-up, tags e comentários.
 *
 * Vive na colecção `leadsMetadata`, a mesma que o leadsBoard da YourBox usa, com o mesmo
 * formato de documento. A diferença está no `leadId`: o leadsBoard grava o id (Meteor) da
 * lead oficial dele; nós gravamos o ObjectId (em string) das nossas leads em `messages`.
 * Cada lado só encontra os seus, por isso convivem sem interferir — e se um dia as leads
 * de widget passarem também pela plataforma antiga, os dados já estão no formato certo.
 *
 * Ver PORTAL_PARCEIRO_COMISSOES.md e a análise em conversa de 22/08/2026.
 */

export const ESTADOS = ['novo', 'contactado', 'fechado', 'perdido'] as const;
export const PRIORIDADES = ['alta', 'normal', 'baixa'] as const;

export type Estado = typeof ESTADOS[number];
export type Prioridade = typeof PRIORIDADES[number];

export type Comentario = {
  id: string;
  timestamp: Date | string;
  user: string;
  userId: string | null;
  text: string;
};

export type Gestao = {
  leadId: string;
  status: Estado;
  priority: Prioridade;
  notes: string;
  followUpDate: string | null;
  tags: string[];
  comments: Comentario[];
  history: { timestamp: Date | string; user: string; userId: string | null; changes: Record<string, { from?: unknown; to: unknown }> }[];
  updatedAt: Date | string | null;
  updatedBy: string | null;
};

/** Documento em branco, para leads que ainda não foram tocadas. */
export function gestaoVazia(leadId: string): Gestao {
  return {
    leadId,
    status: 'novo',
    priority: 'normal',
    notes: '',
    followUpDate: null,
    tags: [],
    comments: [],
    history: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export async function lerGestao(db: Db, leadId: string): Promise<Gestao> {
  const doc: any = await db.collection('leadsMetadata').findOne({ leadId });
  if (!doc) return gestaoVazia(leadId);
  return {
    leadId,
    status:       ESTADOS.includes(doc.status) ? doc.status : 'novo',
    priority:     PRIORIDADES.includes(doc.priority) ? doc.priority : 'normal',
    notes:        typeof doc.notes === 'string' ? doc.notes : '',
    followUpDate: doc.followUpDate ?? null,
    tags:         Array.isArray(doc.tags) ? doc.tags : [],
    comments:     Array.isArray(doc.comments) ? doc.comments : [],
    history:      Array.isArray(doc.history) ? doc.history : [],
    updatedAt:    doc.updatedAt ?? null,
    updatedBy:    doc.updatedBy ?? null,
  };
}

/** Lê a gestão de várias leads de uma vez (para listagens). */
export async function lerGestaoEmLote(db: Db, leadIds: string[]): Promise<Map<string, Gestao>> {
  const out = new Map<string, Gestao>();
  if (!leadIds.length) return out;
  const docs = await db.collection('leadsMetadata').find({ leadId: { $in: leadIds } }).toArray();
  for (const d of docs as any[]) out.set(d.leadId, { ...gestaoVazia(d.leadId), ...d, leadId: d.leadId });
  for (const id of leadIds) if (!out.has(id)) out.set(id, gestaoVazia(id));
  return out;
}

export type Autor = { nome: string; id: string | null };

/**
 * Grava alterações aos campos, registando no `history` o que mudou — mesmo formato do
 * leadsBoard, com `from` além do `to` (informação a mais que a plataforma antiga ignora).
 */
export async function gravarGestao(
  db: Db,
  leadId: string,
  campos: Partial<Pick<Gestao, 'status' | 'priority' | 'notes' | 'followUpDate' | 'tags'>>,
  autor: Autor,
): Promise<Gestao> {
  const actual = await lerGestao(db, leadId);
  const now = new Date();

  const changes: Record<string, { from?: unknown; to: unknown }> = {};
  const $set: Record<string, unknown> = { updatedAt: now, updatedBy: autor.nome };

  const aplicar = (campo: keyof Gestao, valor: unknown, valido: boolean) => {
    if (!valido) return;
    if (JSON.stringify(valor) === JSON.stringify((actual as any)[campo])) return;
    changes[campo] = { from: (actual as any)[campo], to: valor };
    $set[campo] = valor;
  };

  aplicar('status', campos.status, campos.status !== undefined && ESTADOS.includes(campos.status));
  aplicar('priority', campos.priority, campos.priority !== undefined && PRIORIDADES.includes(campos.priority));
  aplicar('notes', campos.notes, typeof campos.notes === 'string');
  aplicar('followUpDate', campos.followUpDate ?? null, campos.followUpDate !== undefined);
  aplicar('tags', campos.tags, Array.isArray(campos.tags));

  // Nada mudou: não sujar o histórico com entradas vazias
  if (!Object.keys(changes).length) return actual;

  await db.collection('leadsMetadata').updateOne(
    { leadId },
    {
      $set,
      $setOnInsert: { leadId, comments: [] },
      $push: { history: { timestamp: now, user: autor.nome, userId: autor.id, changes } } as any,
    },
    { upsert: true },
  );

  return lerGestao(db, leadId);
}

export async function adicionarComentario(db: Db, leadId: string, texto: string, autor: Autor): Promise<Gestao> {
  const t = texto.trim();
  if (!t) return lerGestao(db, leadId);
  const now = new Date();

  await db.collection('leadsMetadata').updateOne(
    { leadId },
    {
      $set: { updatedAt: now, updatedBy: autor.nome },
      $setOnInsert: { leadId, status: 'novo', priority: 'normal', notes: '', history: [] },
      $push: {
        comments: {
          id: Math.random().toString(36).slice(2, 12),
          timestamp: now,
          user: autor.nome,
          userId: autor.id,
          text: t.slice(0, 4000),
        },
      } as any,
    },
    { upsert: true },
  );

  return lerGestao(db, leadId);
}

export async function apagarComentario(db: Db, leadId: string, comentarioId: string): Promise<Gestao> {
  await db.collection('leadsMetadata').updateOne(
    { leadId },
    { $pull: { comments: { id: comentarioId } } as any, $set: { updatedAt: new Date() } },
  );
  return lerGestao(db, leadId);
}
