import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { computeRecommendation } from '@/lib/autobalance/advisor';

// GET — lê a recomendação guardada (Conselheiro). Só autenticado.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  try {
    const db = await getDb();
    const doc: any = await db.collection('routingConfig').findOne(
      { _id: 'yourbox_main' as any }, { projection: { 'autobalance.recommendation': 1 } },
    );
    return Response.json({ recommendation: doc?.autobalance?.recommendation ?? null });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST — recalcula agora (só administrador). Guarda e devolve a nova recomendação.
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  try {
    const db = await getDb();
    return Response.json({ success: true, ...(await computeRecommendation(db)) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
