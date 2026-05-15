import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

const DEFAULT_VARIANTS = [
  { key: 'a', label: 'Variante A', desc: 'Formulário clássico', file: 'index-a.html', weight: 0 },
  { key: 'b', label: 'Variante B', desc: 'Formulário com chat integrado', file: 'index-b.html', weight: 100 },
  { key: 'c', label: 'Variante C', desc: '', file: 'index-c.html', weight: 0 },
  { key: 'd', label: 'Variante D', desc: '', file: 'index-d.html', weight: 0 },
  { key: 'chat', label: 'Chat puro', desc: 'Widget de chat', file: 'index-chat-b.html', weight: 0 },
];

export type VariantItem = { key: string; label: string; desc: string; file: string; weight: number };

export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    const variants: VariantItem[] = (doc as any)?.variants ?? DEFAULT_VARIANTS;
    return Response.json({ variants });
  } catch {
    return Response.json({ variants: DEFAULT_VARIANTS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { variants }: { variants: VariantItem[] } = await request.json();

    if (!Array.isArray(variants) || variants.length === 0) {
      return Response.json({ error: 'Lista de variantes inválida' }, { status: 400 });
    }

    // Validar chaves únicas e campos obrigatórios
    const keys = new Set<string>();
    for (const v of variants) {
      if (!v.key || !/^[a-z0-9_-]+$/i.test(v.key)) {
        return Response.json({ error: `Chave inválida: "${v.key}" — use apenas letras, números, - ou _` }, { status: 400 });
      }
      if (keys.has(v.key)) {
        return Response.json({ error: `Chave duplicada: "${v.key}"` }, { status: 400 });
      }
      keys.add(v.key);
    }

    const total = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
    if (total !== 100) {
      return Response.json({ error: `As percentagens devem somar 100 (actual: ${total})` }, { status: 400 });
    }

    const db = await getDb();
    await db.collection(COLLECTION).updateOne(
      { _id: DOC_ID as any },
      { $set: { variants, updatedAt: new Date() } },
      { upsert: true }
    );
    return Response.json({ success: true, variants });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
