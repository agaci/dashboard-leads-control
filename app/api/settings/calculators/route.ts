import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

/** Lista todas as calculadoras disponíveis na BD. */
export async function GET() {
  try {
    const db = await getDb();
    const docs = await db
      .collection('calculators')
      .find({ companyProvider: 'Yourbox' }, { projection: { name: 1, updatedAt: 1 } })
      .toArray();
    const names = docs.map((d) => ({ name: d.name, updatedAt: d.updatedAt ?? null }));
    return Response.json({ success: true, calculators: names });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/** Clona uma calculadora existente com um novo nome. */
export async function POST(req: NextRequest) {
  try {
    const { sourceName, targetName } = await req.json();
    if (!sourceName || !targetName) {
      return Response.json({ error: 'sourceName e targetName obrigatórios' }, { status: 400 });
    }

    const db = await getDb();
    const source = await db.collection('calculators').findOne({ name: sourceName, companyProvider: 'Yourbox' });
    if (!source) {
      return Response.json({ error: `Calculadora "${sourceName}" não encontrada` }, { status: 404 });
    }

    const existing = await db.collection('calculators').findOne({ name: targetName, companyProvider: 'Yourbox' });
    if (existing) {
      return Response.json({ error: `Calculadora "${targetName}" já existe` }, { status: 409 });
    }

    const { _id, name: _name, ...rest } = source;
    await db.collection('calculators').insertOne({
      ...rest,
      name: targetName,
      companyProvider: 'Yourbox',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return Response.json({ success: true, created: targetName });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
