import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { readFileSync } from 'fs';
import { join } from 'path';

async function seedIfEmpty(db: Awaited<ReturnType<typeof getDb>>) {
  const count = await db.collection('knowledge').countDocuments();
  if (count > 0) return;
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'yourbox_situacoes_100.json'), 'utf-8');
    const situacoes = JSON.parse(raw).situacoes ?? [];
    if (situacoes.length > 0) {
      await db.collection('knowledge').insertMany(
        situacoes.map((s: any) => ({ ...s, active: true, createdAt: new Date(), updatedAt: new Date() }))
      );
    }
  } catch (e) {
    console.error('[knowledge] seed failed:', e);
  }
}

// GET — listar todas
export async function GET() {
  const db = await getDb();
  await seedIfEmpty(db);
  const docs = await db.collection('knowledge')
    .find({})
    .sort({ categoria: 1, id: 1 })
    .toArray();
  return Response.json({ success: true, items: docs });
}

// POST — criar nova situação
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.titulo || !body.categoria) {
    return Response.json({ error: 'titulo e categoria são obrigatórios' }, { status: 400 });
  }
  const db = await getDb();
  // Gerar próximo ID
  const last = await db.collection('knowledge').findOne({}, { sort: { id: -1 } });
  const nextNum = last?.id ? parseInt(last.id.replace('SIT-', '')) + 1 : 101;
  const id = `SIT-${String(nextNum).padStart(3, '0')}`;

  const doc = {
    id,
    titulo: body.titulo,
    categoria: body.categoria,
    frequencia: body.frequencia ?? 'media',
    sinais_deteccao: body.sinais_deteccao ?? [],
    script_resposta: body.script_resposta ?? {},
    escalamento_humano: body.escalamento_humano ?? [],
    active: body.active ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection('knowledge').insertOne(doc);
  return Response.json({ success: true, item: doc });
}
