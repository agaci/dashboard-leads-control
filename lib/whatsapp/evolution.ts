import { getDb } from '@/lib/mongodb';

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  try {
    const db = await getDb();
    const doc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
    const url = (doc as any)?.evolutionApiUrl;
    const key = (doc as any)?.evolutionApiKey;
    const instance = (doc as any)?.evolutionInstance ?? 'yourbox';
    if (!url || !key) return null;
    return { apiUrl: url.replace(/\/$/, ''), apiKey: key, instance };
  } catch {
    return null;
  }
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  const cfg = await getEvolutionConfig();
  if (!cfg) return false;

  // Normalizar número: só dígitos, sem +
  const number = to.replace(/\D/g, '');

  try {
    const res = await fetch(`${cfg.apiUrl}/message/sendText/${cfg.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apiKey,
      },
      body: JSON.stringify({
        number,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isWhatsAppBotAtivo(): Promise<boolean> {
  try {
    const db = await getDb();
    const doc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
    return !!((doc as any)?.whatsappBotAtivo);
  } catch {
    return false;
  }
}
