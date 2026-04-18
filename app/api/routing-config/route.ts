import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { LeadRoutingConfig } from '@/types/pricing';

const COLLECTION = 'routingConfig';
const DOC_ID = 'yourbox_main';

export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID as any });
    const config: LeadRoutingConfig = doc ? { ...defaultRoutingConfig, ...doc } : defaultRoutingConfig;
    return Response.json({ success: true, config });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await getDb();
    const update: Partial<LeadRoutingConfig> = {};
    const allowed: (keyof LeadRoutingConfig)[] = [
      'systemActive', 'alwaysBot', 'delayMinutesBeforeBot',
      'autoStartHour', 'autoEndHour', 'autoWeekends', 'defaultMarkup',
    ];
    for (const key of allowed) {
      if (key in body) (update as any)[key] = body[key];
    }
    await db.collection(COLLECTION).updateOne(
      { _id: DOC_ID as any },
      { $set: { ...update, updatedAt: new Date() } },
      { upsert: true }
    );
    return Response.json({ success: true, updated: update });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
