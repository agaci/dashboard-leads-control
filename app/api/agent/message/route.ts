import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import {
  getConversation,
  createConversation,
  updateConversationData,
  setConversationStep,
  appendMessage,
  closeConversation,
  escalateConversation,
} from '@/lib/agent/conversationState';
import {
  processMessage,
  buildPriceMessage,
  buildLeadRegisteredMessage,
  buildPartnerPriceMessage,
  buildPartnerConfirmedMessage,
  normalizeViatura,
  normalizeUrgencia,
} from '@/lib/agent/botResponder';
import { matchSituacao, matchTriggerCode } from '@/lib/agent/matcher';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { calcAllActiveTariffs, parseWeight } from '@/lib/agent/partnerPricing';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { ConversationData } from '@/types/agent';
import type { PartnerTariff } from '@/types/partner';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { telemovel, mensagem, canal = 'whatsapp' } = body as {
      telemovel: string;
      mensagem: string;
      canal?: string;
    };

    if (!telemovel || !mensagem) {
      return Response.json({ error: 'telemovel e mensagem são obrigatórios' }, { status: 400 });
    }

    // PSERV reinicia sempre
    const isTriggerRestart = mensagem.trim().toUpperCase() === 'PSERV';

    let conv = await getConversation(telemovel);
    if (isTriggerRestart && conv) {
      await closeConversation(telemovel);
      conv = null;
    }
    if (!conv) {
      conv = await createConversation(telemovel, canal as any);
    }

    await appendMessage(telemovel, { role: 'lead', text: mensagem, timestamp: new Date() });

    // Detectar situação activa
    const sitId = matchSituacao(mensagem, conv.data);
    if (sitId && sitId !== conv.data.activeSituacaoId) {
      await updateConversationData(telemovel, { activeSituacaoId: sitId });
      conv.data.activeSituacaoId = sitId;
    }

    let response = processMessage(conv, mensagem);

    // ── Recolha de dados por step ────────────────────────────────────────────
    const dataUpdate: Partial<ConversationData> = {};

    switch (conv.step) {
      case 'COLLECTING_ORIGEM':
        dataUpdate.origem = mensagem;
        break;

      case 'COLLECTING_DESTINO':
        dataUpdate.destino = mensagem;
        break;

      case 'COLLECTING_URGENCIA': {
        const u = normalizeUrgencia(mensagem);
        if (u) {
          dataUpdate.urgencia = u;
          dataUpdate.serviceType = u === '24 Horas' ? 'arrasto' : 'direto';
        }
        break;
      }

      case 'COLLECTING_VIATURA': {
        const v = normalizeViatura(mensagem);
        if (v) dataUpdate.viatura = v;
        break;
      }

      case 'COLLECTING_WEIGHT': {
        const kg = parseWeight(mensagem);
        if (kg) dataUpdate.weightKg = kg;
        break;
      }

      case 'COLLECTING_NOME':
        dataUpdate.nome = mensagem;
        break;

      case 'COLLECTING_EMAIL': {
        if (mensagem.includes('@')) dataUpdate.email = mensagem.trim();
        break;
      }

      case 'PRESENTING_PRICE':
        if (response.nextStep === 'HANDLING_OBJECTION') {
          dataUpdate.objectionCount = (conv.data.objectionCount ?? 0) + 1;
        }
        break;
    }

    if (Object.keys(dataUpdate).length > 0) {
      await updateConversationData(telemovel, dataUpdate);
      Object.assign(conv.data, dataUpdate);
    }

    // ── Calcular preço — fluxo DIRETO (YourBox) ──────────────────────────────
    if (response.nextStep === 'CALCULATING_PRICE') {
      try {
        const db = await getDb();
        const settings = await db.collection('calculators').findOne({
          name: process.env.CALC_PRICE_MACHINE,
          companyProvider: 'Yourbox',
        });

        if (settings && conv.data.origem && conv.data.destino) {
          const fixResult = await fixCityPrice(conv.data.origem, conv.data.destino, settings.poligonos);

          const pesoMap: Record<string, string> = { Moto: '2', 'Furgão Classe 1': '150', 'Furgão Classe 2': '300' };
          const pesoRaw = pesoMap[conv.data.viatura ?? 'Moto'] ?? '2';
          const typeMap = (p: string) => { const n = parseInt(p); if (n <= 2) return '2'; if (n <= 50) return '50'; if (n <= 150) return '150'; return '300'; };
          let type = typeMap(pesoRaw);
          let precedence = conv.data.urgencia === '1 Hora' ? '1' : '4';

          if (fixResult.distanciaFinal > settings.globalParameters?.distance2To50 && type === '2') type = '50';
          if (fixResult.distanciaFinal > settings.globalParameters?.distance4To1 || new Date().getHours() > 13) precedence = '1';

          const priceResult = calculatePrice(fixResult, { type, precedence }, settings);
          const priceCalculated = priceResult.maxPrice;
          const discountRate = settings.discountPercent ?? 0.1;
          const discount = priceCalculated * discountRate;
          const priceWithDiscount = priceCalculated - discount;

          await updateConversationData(telemovel, { priceCalculated, discount, priceWithDiscount, distance: fixResult.distanciaFinal });
          conv.data = { ...conv.data, priceCalculated, discount, priceWithDiscount, distance: fixResult.distanciaFinal };

          const timeStamp = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
          const simResult = await db.collection('messages').insertOne({
            company: 'Yourbox', messageType: 'preLeadSimulation', to: 'admin', toPrivate: null,
            presentationMessage: 'stick', deletedAfter: 10000,
            message: `<div style="line-height:1.4;"><p><b>SIM BOT</b> <small>(${timeStamp})</small></p><p>${conv.data.origem} → ${conv.data.destino}</p><p><b>Viatura:</b> ${conv.data.viatura} | <b>Urgencia:</b> ${conv.data.urgencia}</p><p><b>Preco:</b> €${priceCalculated.toFixed(2)} | <b>10% OFF:</b> €${priceWithDiscount.toFixed(2)}</p></div>`,
            companyProvider: 'Yourbox', senderName: 'Bot Agent', variante: 'BOT',
            timeStamp: new Date(), closed: false, closedAt: new Date(), reply: [],
            leadData: { origem: conv.data.origem, destino: conv.data.destino, viatura: conv.data.viatura, urgencia: conv.data.urgencia, priceCalculated, priceWithDiscount, discount, distance: fixResult.distanciaFinal, telemovel, converted: false, source: 'bot' },
          });
          await updateConversationData(telemovel, { simulationId: simResult.insertedId.toString() });
          conv.data.simulationId = simResult.insertedId.toString();
        }

        response = buildPriceMessage(conv);
      } catch {
        response = { text: 'Não foi possível calcular o preço. Um agente vai entrar em contacto.', nextStep: 'ESCALATED_TO_HUMAN', escalate: true };
      }
    }

    // ── Calcular preço — fluxo ARRASTO (parceiro) ─────────────────────────────
    if ((response.nextStep as string) === 'CALCULATING_PARTNER_PRICE') {
      try {
        const db = await getDb();

        // Ler markup global
        const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
        const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;

        // Carregar tarifas activas
        const tariffDocs = await db.collection('partnerTariffs')
          .find({ active: true, zone: 'Nacional' })
          .sort({ sortOrder: 1 })
          .toArray() as unknown as PartnerTariff[];

        const kg = conv.data.weightKg ?? 1;
        const isSaturday = new Date().getDay() === 6;

        const prices = calcAllActiveTariffs(tariffDocs, kg, 0, isSaturday, defaultMarkup);

        if (prices.length === 0) throw new Error('Sem tarifas activas');

        // Guardar tarifa recomendada (primeira = mais económica)
        const recommended = prices[0];
        await updateConversationData(telemovel, {
          partnerTariffId: recommended.tariffId,
          partnerBasePrice: recommended.basePrice,
          partnerFinalPrice: recommended.finalPrice,
          partnerWindow: recommended.deliveryWindow,
        });
        conv.data = { ...conv.data, partnerTariffId: recommended.tariffId, partnerBasePrice: recommended.basePrice, partnerFinalPrice: recommended.finalPrice, partnerWindow: recommended.deliveryWindow };

        // Guardar simulação
        const timeStamp = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
        await db.collection('messages').insertOne({
          company: 'Yourbox', messageType: 'preLeadSimulation', to: 'admin', toPrivate: null,
          presentationMessage: 'stick', deletedAfter: 10000,
          message: `<div style="line-height:1.4;"><p><b>SIM BOT ARRASTO</b> <small>(${timeStamp})</small></p><p>${conv.data.origem} → ${conv.data.destino}</p><p><b>Peso:</b> ${kg}kg | <b>Urgencia:</b> Amanha</p><p><b>Janela recomendada:</b> ${recommended.serviceLabelShort}</p><p><b>Preco:</b> €${recommended.finalPrice.toFixed(2)}</p></div>`,
          companyProvider: 'Yourbox', senderName: 'Bot Agent', variante: 'BOT',
          timeStamp: new Date(), closed: false, closedAt: new Date(), reply: [],
          leadData: { origem: conv.data.origem, destino: conv.data.destino, urgencia: '24 Horas', serviceType: 'arrasto', weightKg: kg, partnerWindow: recommended.deliveryWindow, partnerFinalPrice: recommended.finalPrice, telemovel, converted: false, source: 'bot' },
        });

        response = buildPartnerPriceMessage(prices, kg);
      } catch (err) {
        response = { text: 'Não foi possível calcular o preço. Um agente vai entrar em contacto brevemente.', nextStep: 'ESCALATED_TO_HUMAN', escalate: true };
      }
    }

    // ── Confirmação de janela de parceiro ────────────────────────────────────
    if (conv.step === 'PRESENTING_PARTNER_PRICE' && response.nextStep === 'COLLECTING_NOME') {
      // Identificar qual janela o utilizador escolheu (se especificou)
      const db = await getDb();
      const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
      const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;

      const tariffDocs = await db.collection('partnerTariffs')
        .find({ active: true, zone: 'Nacional' })
        .sort({ sortOrder: 1 })
        .toArray() as unknown as PartnerTariff[];

      const { calcPartnerPrice } = await import('@/lib/agent/partnerPricing');
      const isSaturday = new Date().getDay() === 6;

      // Tentar detectar janela escolhida na mensagem
      let chosenTariff = tariffDocs[0]; // default = mais económica
      for (const t of tariffDocs) {
        if (mensagem.includes(t.deliveryWindow) || mensagem.toLowerCase().includes(t.serviceLabelShort.toLowerCase())) {
          chosenTariff = t;
          break;
        }
      }

      if (chosenTariff) {
        const price = calcPartnerPrice(chosenTariff, conv.data.weightKg ?? 1, 0, isSaturday, chosenTariff.markup ?? defaultMarkup);
        await updateConversationData(telemovel, {
          partnerTariffId: price.tariffId,
          partnerFinalPrice: price.finalPrice,
          partnerWindow: price.deliveryWindow,
        });
        conv.data.partnerFinalPrice = price.finalPrice;
        conv.data.partnerWindow = price.deliveryWindow;
        response = buildPartnerConfirmedMessage({ ...price, deliveryDescription: chosenTariff.deliveryDescription });
      }
    }

    // ── Registar lead ────────────────────────────────────────────────────────
    if (response.nextStep === 'LEAD_REGISTERED' && conv.step === 'COLLECTING_EMAIL') {
      const nome = conv.data.nome ?? 'Lead Bot';
      const db = await getDb();
      const timeStamp = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });

      const isArrasto = conv.data.serviceType === 'arrasto';
      const finalPrice = isArrasto ? conv.data.partnerFinalPrice : conv.data.priceWithDiscount;
      const serviceInfo = isArrasto
        ? `<p><b>Serviço:</b> Entrega Amanhã ${conv.data.partnerWindow} | <b>Peso:</b> ${conv.data.weightKg}kg</p>`
        : `<p><b>Viatura:</b> ${conv.data.viatura} | <b>Urgência:</b> ${conv.data.urgencia}</p>`;

      const leadResult = await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div style="line-height:1.4;"><p><b>LEAD BOT</b> <small>(${timeStamp})</small></p><p>${telemovel}</p><p>${nome}</p>${conv.data.email ? `<p>${conv.data.email}</p>` : ''}<p>${conv.data.origem} → ${conv.data.destino}</p>${serviceInfo}<p><b>Preco Final:</b> €${finalPrice?.toFixed(2)}</p><p style="color:green;"><b>CONTACTAR AGORA [canal: BOT]</b></p></div>`,
        companyProvider: 'Yourbox', senderName: 'Bot Agent', variante: 'BOT',
        timeStamp: new Date(), closed: false, closedAt: null, reply: [],
        leadData: {
          origem: conv.data.origem, destino: conv.data.destino,
          urgencia: conv.data.urgencia, serviceType: conv.data.serviceType,
          viatura: conv.data.viatura, weightKg: conv.data.weightKg,
          partnerWindow: conv.data.partnerWindow,
          priceCalculated: conv.data.priceCalculated,
          priceWithDiscount: conv.data.priceWithDiscount,
          discount: conv.data.discount, distance: conv.data.distance,
          partnerFinalPrice: conv.data.partnerFinalPrice,
          nome, email: conv.data.email, telefone: telemovel,
          timeStamp: new Date(), converted: true, convertedAt: new Date(), source: 'bot',
        },
      });
      await closeConversation(telemovel, leadResult.insertedId.toString());
      response = buildLeadRegisteredMessage(nome, finalPrice);
    }

    // ── Escalamento ──────────────────────────────────────────────────────────
    if (response.escalate || response.nextStep === 'ESCALATED_TO_HUMAN') {
      await escalateConversation(telemovel);
      const db = await getDb();
      await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin',
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div><p><b>ESCALAMENTO BOT</b></p><p>${telemovel}</p><p>${conv.data.origem ?? '?'} → ${conv.data.destino ?? '?'}</p><p>SIT: ${conv.data.activeSituacaoId ?? 'n/a'}</p></div>`,
        companyProvider: 'Yourbox', senderName: 'Bot Agent — Escalamento', variante: 'BOT',
        timeStamp: new Date(), closed: false, reply: [],
        leadData: { ...conv.data, telefone: telemovel, converted: false, source: 'bot_escalation' },
      });
    } else if (response.nextStep !== 'LEAD_REGISTERED') {
      await setConversationStep(telemovel, response.nextStep as any);
    }

    await appendMessage(telemovel, { role: 'bot', text: response.text, timestamp: new Date(), situacaoId: response.situacaoId });

    return Response.json({
      success: true,
      response: response.text,
      nextStep: response.nextStep,
      quickReplies: response.quickReplies ?? [],
      situacaoId: response.situacaoId ?? null,
      escalate: response.escalate ?? false,
    });
  } catch (err: any) {
    console.error('agent/message error:', err);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
