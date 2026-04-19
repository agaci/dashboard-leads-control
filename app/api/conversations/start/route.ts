import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { buildPriceMessage, build24hIntroMessage } from '@/lib/agent/botResponder';
import { calcAllActiveTariffs } from '@/lib/agent/partnerPricing';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { ConversationData, ConversationMessage } from '@/types/agent';
import type { PartnerTariff } from '@/types/partner';

// POST — inicializar conversa web a partir de dados do formulário
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origem, destino, viatura, urgencia, sessionId } = body as {
      origem: string;
      destino: string;
      viatura: string;
      urgencia: string;
      sessionId: string;
    };

    if (!origem || !destino || !urgencia || !sessionId) {
      return Response.json({ error: 'Campos obrigatórios em falta' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();
    const serviceType = urgencia === '24 Horas' ? 'arrasto' : 'direto';

    const data: ConversationData = {
      telemovel: sessionId,
      origem,
      destino,
      viatura: viatura || 'Moto',
      urgencia,
      serviceType,
      objectionCount: 0,
    };

    let firstBotMessage: string;
    let step: string;
    let quickReplies: string[] | undefined;

    if (serviceType === 'direto') {
      // Calcular preço direto (YourBox)
      try {
        const settings = await db.collection('calculators').findOne({
          name: process.env.CALC_PRICE_MACHINE,
          companyProvider: 'Yourbox',
        });

        if (settings && origem && destino) {
          const fixResult = await fixCityPrice(origem, destino, settings.poligonos);
          const pesoMap: Record<string, string> = { Moto: '2', 'Furgão Classe 1': '150', 'Furgão Classe 2': '300' };
          const pesoRaw = pesoMap[viatura ?? 'Moto'] ?? '2';
          const typeMap = (p: string) => { const n = parseInt(p); if (n <= 2) return '2'; if (n <= 50) return '50'; if (n <= 150) return '150'; return '300'; };
          let type = typeMap(pesoRaw);
          let precedence = urgencia === '1 Hora' ? '1' : '4';

          if (fixResult.distanciaFinal > settings.globalParameters?.distance2To50 && type === '2') type = '50';
          if (fixResult.distanciaFinal > settings.globalParameters?.distance4To1 || new Date().getHours() > 13) precedence = '1';

          const priceResult = calculatePrice(fixResult, { type, precedence }, settings);
          const priceCalculated = priceResult.maxPrice;
          const discountRate = settings.discountPercent ?? 0.1;
          const discount = priceCalculated * discountRate;
          const priceWithDiscount = priceCalculated - discount;

          Object.assign(data, { priceCalculated, discount, priceWithDiscount, distance: fixResult.distanciaFinal });
        }
      } catch {
        // Se o calculo falhar, escalar para humano
      }

      // Construir mensagem de preco
      const fakeConv = { data } as any;
      const resp = buildPriceMessage(fakeConv);
      firstBotMessage = resp.text;
      quickReplies = resp.quickReplies;
      step = 'PRESENTING_PRICE';

    } else {
      // Servico 24h — perguntar peso
      const resp = build24hIntroMessage();
      firstBotMessage = resp.text;
      quickReplies = resp.quickReplies;
      step = 'COLLECTING_WEIGHT';
    }

    const botMsg: ConversationMessage = {
      role: 'bot',
      text: firstBotMessage,
      timestamp: now,
    };

    const conv = await db.collection('conversations').insertOne({
      telemovel: sessionId,
      canal: 'web',
      step,
      data,
      history: [botMsg],
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({
      success: true,
      conversationId: conv.insertedId.toString(),
      message: firstBotMessage,
      quickReplies,
      step,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
