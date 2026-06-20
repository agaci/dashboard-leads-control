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

    // No envio final, registar também o lead na colecção messages (newLead) — para
    // aparecer na lista de Leads e tocar o som de nova lead. SEM dispatchNotification:
    // os emails ao cliente são enviados pela plataforma antiga (evita duplicação).
    if (isSubmit) {
      const guard: any = await col.findOneAndUpdate(
        { quizSessionId: sessionId, leadRegisteredAt: { $exists: false } },
        { $set: { leadRegisteredAt: now } },
      );
      const convDoc = guard?.value ?? null; // driver v3: devolve { value, ok }
      if (convDoc) {
        const d = { ...(convDoc.data ?? {}), ...(data ?? {}) };
        const urMap: Record<string, string> = { 'Imediata': '1 Hora', 'Proprio dia': '4 Horas', 'Próprio dia': '4 Horas', '24H': '24 Horas' };
        const urg = urMap[d.urgencia] ?? d.urgencia ?? null;
        const serviceType = d.urgencia === '24H' ? 'arrasto' : 'direto';
        const totalKg = (Number(d.volumes) || 0) * (Number(d.peso) || 0) || null;
        const maxDim = Math.max(Number(d.comprimento) || 0, Number(d.largura) || 0, Number(d.altura) || 0);
        const viatura = totalKg && totalKg <= 2 && maxDim <= 60 ? 'Moto'
          : totalKg && totalKg <= 150 ? 'Furgão Classe 1'
          : totalKg ? 'Furgão Classe 2' : null;
        const cargaHtml = totalKg ? `<p><b>Carga:</b> ${d.volumes ?? '?'} volumes · ${totalKg} kg · ${d.material ?? ''} · ${d.embalado ?? ''}</p>` : '';

        await db.collection('messages').insertOne({
          company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
          presentationMessage: 'stick', deletedAfter: 0,
          message: `<div style="line-height:1.4;"><p><b>LEAD QUIZ</b> <small>(${now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })})</small></p><p>${realPhone ?? ''}</p><p>${d.nome ?? ''}</p>${d.email ? `<p>${d.email}</p>` : ''}<p>${d.origem ?? ''} → ${d.destino ?? ''}</p><p><b>Urgência:</b> ${urg ?? '—'}</p>${cargaHtml}<p style="color:green;"><b>CONTACTAR AGORA [canal: QUIZ]</b></p></div>`,
          companyProvider: 'Yourbox', senderName: 'Quiz Web', variante: variante ?? 'QUIZ',
          timeStamp: now, closed: false, closedAt: null, reply: [],
          leadData: {
            origem: d.origem, destino: d.destino,
            urgencia: urg, serviceType, viatura, weightKg: totalKg,
            nome: d.nome, email: d.email, telefone: realPhone ?? d.telefone,
            volumes: d.volumes, material: d.material, embalado: d.embalado,
            timeStamp: now, converted: true, convertedAt: now, source: 'quiz',
          },
        });
      }
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
