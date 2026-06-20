import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';

// Recebe o progresso do quiz (site_YB/index-quiz*.html) e materializa-o como uma
// "conversa" na colecção conversations, para aparecer na vista de Conversas do
// dashboard — uma timeline de passos em vez de bolhas de chat.
//
// Chamado cross-origin (yourbox.com.pt -> leads.comgo.pt) via navigator.sendBeacon
// com Content-Type text/plain (pedido simples, sem preflight). Fire-and-forget.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj: unknown, status = 200) {
  return Response.json(obj, { status, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { sessionId, event, step, stepIndex, total, label, data, variante } = body as {
      sessionId?: string;
      event?: 'progress' | 'submit';
      step?: string;
      stepIndex?: number;
      total?: number;
      label?: string;
      data?: Record<string, any>;
      variante?: string;
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return json({ error: 'sessionId em falta' }, 400);
    }

    const db = await getDb();
    const col = db.collection('conversations');
    const now = new Date();
    const isSubmit = event === 'submit';

    // Telemóvel real assim que conhecido; caso contrário identificador anónimo
    const telDigits = String(data?.telefone ?? '').replace(/\D/g, '');
    const realPhone = /^[0-9]{9}$/.test(telDigits) ? telDigits : null;
    const tel = realPhone ?? ('web_quiz_' + sessionId.slice(0, 8));

    const stepMsg = {
      role: 'step' as const,
      text: label || step || 'Passo',
      step: step ?? null,
      stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
      total: typeof total === 'number' ? total : null,
      timestamp: now,
    };

    // Espalhar os dados recolhidos em data.* (sem apagar o que já existe)
    const dataSet: Record<string, unknown> = {};
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
          dataSet['data.' + k] = data[k];
        }
      }
    }

    await col.updateOne(
      { quizSessionId: sessionId },
      {
        $setOnInsert: { canal: 'web-quiz', quizSessionId: sessionId, createdAt: now },
        $set: {
          telemovel: tel,
          step: isSubmit ? 'LEAD_REGISTERED' : 'QUIZ_IN_PROGRESS',
          quizStep: step ?? null,
          ...(variante ? { quizVariante: variante } : {}),
          ...dataSet,
          updatedAt: now,
          ...(isSubmit ? { closedAt: now } : {}),
        },
        $push: { history: stepMsg },
      },
      { upsert: true },
    );

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
