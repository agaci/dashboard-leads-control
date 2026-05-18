import { getDb } from '@/lib/mongodb';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';

export async function GET() {
  try {
    const db  = await getDb();
    const doc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
    const cfg = doc ? { ...defaultRoutingConfig, ...doc } : defaultRoutingConfig;
    return Response.json({
      voiceAssistantName:   cfg.voiceAssistantName   ?? 'Yox',
      voiceAssistantGender: cfg.voiceAssistantGender ?? 'female',
    });
  } catch {
    return Response.json({ voiceAssistantName: 'Yox', voiceAssistantGender: 'female' });
  }
}
