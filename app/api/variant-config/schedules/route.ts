import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import type { VariantSchedule } from '../route';

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    return Response.json({
      schedules: (doc as any)?.variantSchedules ?? [],
      active: (doc as any)?.variantSchedulesActive ?? false,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { schedules, active }: { schedules: VariantSchedule[]; active: boolean } = await request.json();

    if (!Array.isArray(schedules)) {
      return Response.json({ error: 'Lista de schedules inválida' }, { status: 400 });
    }

    // Validar cada slot
    for (const s of schedules) {
      if (!s.id || !s.label) return Response.json({ error: 'Cada slot precisa de id e etiqueta' }, { status: 400 });
      if (s.startHour < 0 || s.startHour > 23) return Response.json({ error: `Hora início inválida no slot "${s.label}"` }, { status: 400 });
      if (s.endHour < 1 || s.endHour > 24) return Response.json({ error: `Hora fim inválida no slot "${s.label}"` }, { status: 400 });
      if (s.startHour >= s.endHour) return Response.json({ error: `Hora início deve ser anterior à hora fim no slot "${s.label}"` }, { status: 400 });
      const total = Object.values(s.weights).reduce((a, b) => a + b, 0);
      if (total !== 100) return Response.json({ error: `Slot "${s.label}": percentagens somam ${total}% (deve ser 100%)` }, { status: 400 });
    }

    // Verificar sobreposições
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i], b = schedules[j];
        if (a.startHour < b.endHour && b.startHour < a.endHour) {
          return Response.json({ error: `Slots "${a.label}" e "${b.label}" sobrepõem-se` }, { status: 400 });
        }
      }
    }

    const db = await getDb();
    await db.collection(COLLECTION).updateOne(
      { _id: DOC_ID as any },
      { $set: { variantSchedules: schedules, variantSchedulesActive: active, updatedAt: new Date() } },
      { upsert: true },
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
