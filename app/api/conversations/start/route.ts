import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { buildPriceMessage, build24hIntroMessage } from '@/lib/agent/botResponder';
import { getOohInfo, getLisbonNow } from '@/lib/utils/holidays';
import { findAggregationHints } from '@/lib/agent/aggregation';
import { calcAllActiveTariffs, parseTotalCm, parseNVolumesFromText, parseWeightKgFromText } from '@/lib/agent/partnerPricing';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { buildDirectServiceBreakdown } from '@/lib/pricing/priceBreakdownBuilder';
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
      const _dias = cfg.autoWeekends ? 'todos os dias' : 'Segunda a Sexta';
      const _horario = `das ${cfg.autoStartHour}h às ${cfg.autoEndHour}h`;
      const _urgPhone = (cfg as any).urgencyPhone || '214 304 546';
      const botMsg = `Pedido recebido!\n\nEstamos fora do horário de atendimento automático (${_dias}, ${_horario}), mas a nossa equipa entrará em contacto brevemente.\n\nPara casos urgentes contacte-nos diretamente pelo *${_urgPhone}*.\n\n${contactPrompt}`;
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
        const calcNameStart = cfg?.calcPriceMachine ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI';
        const settings = await db.collection('calculators').findOne({
          name: calcNameStart,
          companyProvider: 'Yourbox',
        });

        if (settings && origem && destino) {
          const fixResult = await fixCityPrice(origem, destino, settings.poligonos);
          const pesoMap: Record<string, string> = { Moto: '2', Auto: '50', 'Furgão Classe 1': '150', 'Furgão Classe 2': '300' };
          const pesoRaw = pesoMap[viatura ?? 'Moto'] ?? '2';
          const typeMap = (p: string) => { const n = parseInt(p); if (n <= 2) return '2'; if (n <= 50) return '50'; if (n <= 150) return '150'; return '300'; };
          let type = typeMap(pesoRaw);
          let precedence = urgencia === '1 Hora' ? '1' : '4';

          // Se o peso/volume real (das observações) exige veículo maior, elevar o tipo
          const viaturaMap: Record<string, string> = { '2': 'Moto', '50': 'Auto', '150': 'Furgão Classe 1', '300': 'Furgão Classe 2' };
          const typeForKg = (kg: number) => kg <= 2 ? '2' : kg <= 50 ? '50' : kg <= 150 ? '150' : '300';
          const MAX_CM_TYPE2 = 100; // 40×30×30 cm
          let viaturaWarningStart = '';
          const preFilledKg: number | undefined = (data as any).weightKg;
          const preFilledCm: number | undefined = (data as any).totalCm;
          if (preFilledKg && preFilledKg > 0) {
            const requiredType = typeForKg(preFilledKg);
            if (parseInt(requiredType) > parseInt(type)) {
              const viaturaRequired = viaturaMap[requiredType];
              viaturaWarningStart = `\n\n_Atenção: o peso/volume da carga requer *${viaturaRequired}* — a viatura foi ajustada automaticamente (em vez de ${viatura ?? 'Moto'})._`;
              type = requiredType;
              data.viatura = viaturaRequired;
            }
          }
          if (preFilledCm && preFilledCm > 0 && type === '2' && preFilledCm > MAX_CM_TYPE2) {
            const viaturaRequired = 'Auto';
            viaturaWarningStart = `\n\n_Atenção: o peso/volume da carga requer *${viaturaRequired}* — a viatura foi ajustada automaticamente (em vez de ${viatura ?? 'Moto'})._`;
            type = '50';
            data.viatura = viaturaRequired;
          }

          if (fixResult.distanciaFinal > settings.globalParameters?.distance2To50 && type === '2') type = '50';
          if (fixResult.distanciaFinal > settings.globalParameters?.distance4To1 || new Date().getHours() > 13) precedence = '1';

          const priceResult = calculatePrice(fixResult, { type, precedence }, settings);
          const oohInfo = getOohInfo(getLisbonNow(), settings?.outOfHoursFees);
          let priceCalculated = priceResult.maxPrice;
          if (oohInfo.multiplier !== 1) {
            priceCalculated = Math.round(priceCalculated * oohInfo.multiplier * 10) / 10;
          }
          const discountRate = settings.discountPercent ?? 0.1;
          const discount = priceCalculated * discountRate;
          const priceWithDiscount = priceCalculated - discount;
          const percentPlusMax = priceCalculated > 0 ? priceWithDiscount / priceCalculated : 1;

          const breakdown = buildDirectServiceBreakdown(
            fixResult,
            priceResult,
            priceCalculated,
            percentPlusMax,
            discountRate > 0,
            calcNameStart,
          );

          Object.assign(data, { priceCalculated, discount, priceWithDiscount, distance: fixResult.distanciaFinal, priceBreakdown: breakdown, effectiveType: type, ...(oohInfo.note ? { oohNote: oohInfo.note } : {}) });
          if (viaturaWarningStart) (data as any)._viaturaWarning = viaturaWarningStart;
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
      firstBotMessage = resp.text + ((data as any)._viaturaWarning ?? '');
      delete (data as any)._viaturaWarning;
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
