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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Início do dia de HOJE em Lisboa, como instante UTC (independente do fuso do servidor).
function lisbonStartOfTodayUtc(): Date {
  const now = new Date();
  const lisbonNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const diff = now.getTime() - lisbonNow.getTime(); // ajuste fuso Lisboa -> UTC
  const midnightWall = new Date(lisbonNow.getFullYear(), lisbonNow.getMonth(), lisbonNow.getDate(), 0, 0, 0, 0);
  return new Date(midnightWall.getTime() + diff);
}

function json(obj: unknown, status = 200) {
  return Response.json(obj, { status, headers: CORS });
}

// Valor introduzido pelo visitante no passo `step` (para mostrar na timeline do dashboard)
function stepValue(step: string | undefined, data: Record<string, any> | undefined): string | null {
  if (!step || !data) return null;
  const v = (x: any) => (x === undefined || x === null || x === '' ? null : String(x));
  switch (step) {
    case 'nome':      return v(data.nome);
    case 'telefone':  return v(data.telefone);
    case 'email':     return v(data.email);
    case 'origem':    return v(data.origem);
    case 'destino':   return v(data.destino);
    case 'volumes':   return data.volumes ? `${data.volumes} volumes` : null;
    case 'peso':      return data.peso ? `${data.peso} kg/volume` : null;
    case 'dimensoes': return (data.comprimento && data.largura && data.altura) ? `${data.comprimento} x ${data.largura} x ${data.altura} cm` : null;
    case 'urgencia':  return v(data.urgencia);
    case 'material':  return v(data.material);
    case 'embalado':  return v(data.embalado);
    default:          return null;
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Prova social REAL para o quiz (site_YB): quantas pessoas INICIARAM um orçamento hoje.
// Conta as conversas do quiz (canal web-quiz) criadas hoje — mais representativo da
// actividade do que só as que chegaram a lead. Cache de 60s em memória para não varrer
// a colecção a cada carregamento de página.
let _startsTodayCache: { at: number; value: number } | null = null;

export async function GET() {
  try {
    if (_startsTodayCache && Date.now() - _startsTodayCache.at < 60_000) {
      return json({ startsToday: _startsTodayCache.value });
    }
    const db = await getDb();
    const startsToday = await db.collection('conversations').countDocuments({
      canal: 'web-quiz',
      createdAt: { $gte: lisbonStartOfTodayUtc() },
    });
    _startsTodayCache = { at: Date.now(), value: startsToday };
    return json({ startsToday });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { sessionId, event, step, stepIndex, total, label, data, variante, geo } = body as {
      sessionId?: string;
      event?: 'progress' | 'submit' | 'geo';
      step?: string;
      stepIndex?: number;
      total?: number;
      label?: string;
      data?: Record<string, any>;
      variante?: string;
      geo?: { lat?: number; lng?: number; address?: string; field?: string; source?: string; city?: string; region?: string; country?: string };
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return json({ error: 'sessionId em falta' }, 400);
    }

    const db = await getDb();
    const col = db.collection('conversations');
    const now = new Date();
    const isSubmit = event === 'submit';

    // Evento de localizacao PRECISA (GPS) — o user clicou no botao das moradas (consentido).
    // Actualiza so a geo (substitui a aproximada por IP), sem mexer no passo/timeline.
    if (event === 'geo') {
      if (geo && geo.lat != null && geo.lng != null) {
        await col.updateOne(
          { quizSessionId: sessionId },
          { $set: { 'data.geo': { source: 'gps', lat: Number(geo.lat), lng: Number(geo.lng), address: geo.address ?? null, field: geo.field ?? null, at: now }, updatedAt: now } },
        );
      }
      return json({ success: true, geo: 'gps' });
    }

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
      value: stepValue(step, data), // valor introduzido neste passo (para mostrar na timeline)
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

    // Geo APROXIMADA por IP — vem do BROWSER no payload (o browser pergunta a um serviço
    // que vê o IP REAL do visitante; contorna o IP mascarado pelo Docker no servidor).
    // Só preenche se ainda não houver geo GPS (a GPS é mais precisa e tem prioridade).
    if (geo && (geo.city || geo.lat != null) && geo.source !== 'gps') {
      await col.updateOne(
        { quizSessionId: sessionId, 'data.geo.source': { $ne: 'gps' } },
        { $set: { 'data.geo': {
          source: 'ip',
          city: geo.city ?? null, region: geo.region ?? null, country: geo.country ?? null,
          lat: geo.lat != null ? Number(geo.lat) : null, lng: geo.lng != null ? Number(geo.lng) : null,
          at: now,
        } } },
      ).catch(() => {});
    }

    // No envio final, registar a lead na coleccao `messages` (newLead) para aparecer na
    // lista de Leads deste dashboard e tocar o som de nova lead. A coleccao e partilhada
    // com a plataforma YourBox antiga, por isso marcamos a entrada com `appSource:
    // 'leads-control'` — a YourBox filtra por esse campo para nao mostrar esta linha
    // (a lead "oficial" e enviada pela API antiga; ver YOURBOX_FILTER_PROMPT.md).
    // SEM dispatchNotification: o email ao cliente e enviado pela plataforma antiga.
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

        const ins = await db.collection('messages').insertOne({
          company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
          appSource: 'leads-control', // marcador para a YourBox antiga filtrar esta entrada
          presentationMessage: 'stick', deletedAfter: 0,
          message: `<div style="line-height:1.4;"><p><b>LEAD QUIZ</b> <small>(${now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })})</small></p><p>${realPhone ?? ''}</p><p>${d.nome ?? ''}</p>${d.email ? `<p>${d.email}</p>` : ''}<p>${d.origem ?? ''} → ${d.destino ?? ''}</p><p><b>Urgência:</b> ${urg ?? '—'}</p>${cargaHtml}<p style="color:green;"><b>CONTACTAR AGORA [canal: QUIZ]</b></p></div>`,
          companyProvider: 'Yourbox', senderName: 'Quiz Web', variante: variante ?? 'QUIZ',
          timeStamp: now, closed: false, closedAt: null, reply: [],
          leadData: {
            origem: d.origem, destino: d.destino,
            urgencia: urg, serviceType, viatura, weightKg: totalKg,
            nome: d.nome, email: d.email, telefone: realPhone ?? d.telefone,
            volumes: d.volumes, material: d.material, embalado: d.embalado,
            geo: d.geo ?? null,
            timeStamp: now, converted: true, convertedAt: now, source: 'quiz',
          },
        });
        // Vincular a conversa à lead criada (link simétrico p/ o fluxo de apagar).
        await col.updateOne({ quizSessionId: sessionId }, { $set: { leadId: ins.insertedId.toString() } });
      }
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}
