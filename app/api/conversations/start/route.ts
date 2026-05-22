import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { buildPriceMessage, build24hIntroMessage } from '@/lib/agent/botResponder';
import { findAggregationHints } from '@/lib/agent/aggregation';
import { calcAllActiveTariffs, parseTotalCm, parseNVolumesFromText, parseWeightKgFromText } from '@/lib/agent/partnerPricing';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { decideMode, defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { ConversationData, ConversationMessage } from '@/types/agent';
import type { PartnerTariff } from '@/types/partner';

// POST — inicializar conversa web a partir de dados do formulário
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origem, destino, viatura, urgencia, sessionId, nome, email, telemovel: phoneFromForm, source, observacoes } = body as {
      origem: string;
      destino: string;
      viatura: string;
      urgencia: string;
      sessionId?: string;
      nome?: string;
      email?: string;
      telemovel?: string;
      source?: string;
      observacoes?: string;
    };

    // web-b passa telemovel real; web-a passa sessionId (identificador aleatório)
    const identifier = (phoneFromForm || sessionId || '').trim();

    if (!origem || !destino || !urgencia || !identifier) {
      return Response.json({ error: 'Campos obrigatórios em falta' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();

    // ── Verificar routing config ────────────────────────────────────────────
    const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
    const cfg = routingDoc ? { ...defaultRoutingConfig, ...routingDoc } : defaultRoutingConfig;
    const routing = decideMode(cfg, urgencia, now);

    if (routing === 'MANUAL') {
      if (!cfg.systemActive) {
        // Bot desativado manualmente — chat em tempo real com operador humano
        const botMsg = `Bem-vindo! O nosso assistente automático está temporariamente indisponível.\n\nUm operador YourBox irá atendê-lo directamente. Pode deixar a sua mensagem abaixo.`;
        const liveConv = await db.collection('conversations').insertOne({
          telemovel: identifier,
          canal: 'web',
          step: 'LIVE_CHAT',
          data: {
            telemovel: identifier, origem, destino,
            viatura: viatura || 'Moto', urgencia,
            serviceType: urgencia === '24 Horas' ? 'arrasto' : 'direto',
            objectionCount: 0,
            ...(nome ? { nome } : {}),
            ...(email ? { email } : {}),
            ...(source ? { source } : {}),
          },
          history: [{ role: 'bot', text: botMsg, timestamp: now }],
          escalatedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return Response.json({
          success: true,
          conversationId: liveConv.insertedId.toString(),
          message: botMsg,
          quickReplies: [],
          step: 'LIVE_CHAT',
        });
      }

      // Fora do horário / fim-de-semana — recolher contacto para follow-up
      const hasPhone = !!phoneFromForm?.trim();
      const contactPrompt = hasPhone
        ? `Os seus dados: *Nome: ${nome}, Telemóvel: ${phoneFromForm}*. Confirma ou quer alterar algum?`
        : `Para agilizarmos o contacto, *${nome}* — qual é o seu *número de telemóvel*?`;
      const botMsg = `Pedido recebido!\n\nEstamos fora do horário de atendimento automático (Segunda a Sexta, das 9h às 20h), mas a nossa equipa entrará em contacto brevemente.\n\nPara casos urgentes contacte-nos diretamente pelo *214 304 546*.\n\n${contactPrompt}`;
      const escalatedConv = await db.collection('conversations').insertOne({
        telemovel: identifier,
        canal: 'web',
        step: hasPhone ? 'HANDLING_OBJECTION' : 'COLLECTING_NOME',
        data: {
          telemovel: identifier, origem, destino,
          viatura: viatura || 'Moto', urgencia,
          serviceType: urgencia === '24 Horas' ? 'arrasto' : 'direto',
          objectionCount: 0,
          isEscalatedCase: true,
          ...(nome ? { nome } : {}),
          ...(email ? { email } : {}),
          ...(source ? { source } : {}),
        },
        history: [{ role: 'bot', text: botMsg, timestamp: now }],
        escalatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return Response.json({
        success: true,
        conversationId: escalatedConv.insertedId.toString(),
        message: botMsg,
        quickReplies: [],
        step: hasPhone ? 'HANDLING_OBJECTION' : 'COLLECTING_NOME',
      });
    }

    const serviceType = urgencia === '24 Horas' ? 'arrasto' : urgencia === 'Internacional' ? 'internacional' : 'direto';

    const data: ConversationData = {
      telemovel: identifier,
      origem,
      destino,
      viatura: viatura || 'Moto',
      urgencia,
      serviceType,
      objectionCount: 0,
      ...(nome        ? { nome:        nome.trim()        } : {}),
      ...(email       ? { email:       email.trim()       } : {}),
      ...(source      ? { source:      source.trim()      } : {}),
      ...(observacoes ? { notas:       observacoes.trim() } : {}),
      ...(observacoes ? (() => { const cm = parseTotalCm(observacoes); return cm ? { totalCm: cm } : {}; })() : {}),
      ...(observacoes ? (() => { const nv = parseNVolumesFromText(observacoes); return nv ? { nVolumes: nv } : {}; })() : {}),
      ...(observacoes ? (() => { const wkg = parseWeightKgFromText(observacoes); return wkg ? { weightKg: wkg } : {}; })() : {}),
    };

    let firstBotMessage: string;
    let step: string;
    let quickReplies: string[] | undefined;

    if (serviceType === 'internacional') {
      firstBotMessage =
        'Para envios para as *Ilhas* (Madeira & Açores) ou *Internacional*, a nossa equipa prepara um orçamento personalizado.\n\n' +
        'Um agente vai entrar em contacto brevemente.\n\n' +
        'Pode deixar uma mensagem adicional ou aguardar o contacto.';
      step = 'ESCALATED_TO_HUMAN';
      quickReplies = undefined;

    } else if (serviceType === 'direto') {
      // Calcular preço direto (YourBox)
      try {
        const settings = await db.collection('calculators').findOne({
          name: process.env.CALC_PRICE_MACHINE,
          companyProvider: 'Yourbox',
        });

        if (settings && origem && destino) {
          const fixResult = await fixCityPrice(origem, destino, settings.poligonos);
          const pesoMap: Record<string, string> = { Moto: '2', Auto: '50', 'Furgão Classe 1': '150', 'Furgão Classe 2': '300' };
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
      const threshold = (cfg as any).aggEscalationThreshold ?? 0;
      const isShortUrgency = urgencia === '1 Hora' || urgencia === '4 Horas';
      const showAggOffer = threshold > 0 && isShortUrgency && (data.priceWithDiscount ?? 0) > threshold;
      if (showAggOffer) data.aggOfferShown = true as any;

      const fakeConv = { data } as any;
      const resp = buildPriceMessage(fakeConv, showAggOffer);
      firstBotMessage = resp.text;
      quickReplies = resp.quickReplies;
      step = 'PRESENTING_PRICE';

    } else {
      // Servico 24h — se peso já pré-preenchido, confirmar em vez de perguntar
      const preKg: number | undefined = (data as any).weightKg;
      if (preKg && preKg > 0) {
        firstBotMessage = `Encontrei o peso de *${preKg} kg* nas suas notas.\n\nPara calcular o preço de entrega amanhã com este peso, responda *confirmar* — ou corrija o valor se necessário.`;
        quickReplies = ['Confirmar'];
        step = 'COLLECTING_WEIGHT';
      } else {
        const resp = build24hIntroMessage();
        firstBotMessage = resp.text;
        quickReplies = resp.quickReplies;
        step = 'COLLECTING_WEIGHT';
      }
    }

    const botMsg: ConversationMessage = {
      role: 'bot',
      text: firstBotMessage,
      timestamp: now,
    };

    const conv = await db.collection('conversations').insertOne({
      telemovel: identifier,
      canal: 'web',
      step,
      data,
      history: [botMsg],
      createdAt: now,
      updatedAt: now,
    });

    // Disparar análise de agregação em background — não bloqueia a resposta
    if (serviceType !== 'arrasto' && serviceType !== 'internacional') {
      const convId = conv.insertedId;
      findAggregationHints(origem, destino)
        .then(async ({ hints }) => {
          if (hints.length === 0) return;
          await db.collection('conversations').updateOne(
            { _id: convId },
            { $set: { aggHints: hints, aggHintsAt: new Date(), aggHintsSeen: false } },
          );
        })
        .catch(() => {});
    }

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
