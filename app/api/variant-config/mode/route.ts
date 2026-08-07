import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

export type DistributionMode = 'manual' | 'schedule' | 'auto';
export type AutoApply = 'advisor' | 'auto';
/** Ver VariantRotation em ../route.ts. Ortogonal ao modo: define COMO se sorteia, não QUEM decide os pesos. */
export type VariantRotation = 'random' | 'circular';

// Deriva o modo de distribuição a partir do doc (compatível com clientes antigos:
// sem distributionMode => 'schedule' se agendamento activo, senão 'manual').
function deriveMode(doc: any): DistributionMode {
  const m = doc?.distributionMode;
  if (m === 'manual' || m === 'schedule' || m === 'auto') return m;
  return doc?.variantSchedulesActive ? 'schedule' : 'manual';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  try {
    const db = await getDb();
    const doc: any = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    return Response.json({
      mode: deriveMode(doc),
      apply: (doc?.autobalance?.apply === 'auto' ? 'auto' : 'advisor') as AutoApply,
      rotation: (doc?.variantRotation === 'circular' ? 'circular' : 'random') as VariantRotation,
      lastApplied: doc?.autobalance?.lastApplied ?? null,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST — define o modo de distribuição (só administrador). Fonte única de verdade:
// activar um modo desliga os outros (variantSchedulesActive derivado de mode==='schedule').
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'administrator') {
    return Response.json({ error: 'Sem permissão' }, { status: 403 });
  }
  try {
    const { mode, apply, rotation }: { mode?: DistributionMode; apply?: AutoApply; rotation?: VariantRotation } =
      await request.json();
    if (mode !== undefined && !['manual', 'schedule', 'auto'].includes(mode)) {
      return Response.json({ error: `Modo inválido: "${mode}"` }, { status: 400 });
    }
    if (rotation !== undefined && !['random', 'circular'].includes(rotation)) {
      return Response.json({ error: `Rotação inválida: "${rotation}"` }, { status: 400 });
    }

    const db = await getDb();
    const set: any = { updatedAt: new Date() };
    if (mode !== undefined) {
      set.distributionMode = mode;
      set.variantSchedulesActive = mode === 'schedule'; // exclusão mútua
    }
    if (apply !== undefined) {
      set['autobalance.apply'] = apply === 'auto' ? 'auto' : 'advisor';
    }
    // Ortogonal ao modo: o modo decide quem define os pesos, a rotação decide
    // como se sorteia com esses pesos. Podem coexistir em qualquer combinação.
    if (rotation !== undefined) {
      set.variantRotation = rotation;
    }
    await db.collection(COLLECTION).updateOne({ _id: DOC_ID as any }, { $set: set }, { upsert: true });

    const doc: any = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    return Response.json({
      success: true,
      mode: deriveMode(doc),
      apply: (doc?.autobalance?.apply === 'auto' ? 'auto' : 'advisor') as AutoApply,
      rotation: (doc?.variantRotation === 'circular' ? 'circular' : 'random') as VariantRotation,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
