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
  parseWAPrefilledMessage,
  buildWAPrefilledResponse,
} from '@/lib/agent/botResponder';
import { matchSituacao, matchTriggerCode } from '@/lib/agent/matcher';
import { findAggregationHints } from '@/lib/agent/aggregation';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { calcAllActiveTariffs, parseWeight } from '@/lib/agent/partnerPricing';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import { parseEndereco, parseContacto, formatEndereco, formatContacto } from '@/lib/agent/addressParser';
import type { ConversationData } from '@/types/agent';
import type { PartnerTariff } from '@/types/partner';

function isSaltar(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.,?]+$/, '');
  return ['saltar', 'skip', 'avançar', 'avancar', 'passar', 'não', 'nao'].includes(t);
}

function isPronto(text: string): boolean {
  return text.trim().toLowerCase() === 'pronto';
}

// Steps de recolha de dados opcionais onde "pronto" salta tudo para o registo
const PRONTO_SHORTCUT_STEPS = [
  'COLLECTING_NOTAS', 'COLLECTING_ORIGEM_COMPLETA', 'CONFIRMING_ORIGEM_COMPLETA',
  'COLLECTING_DESTINO_COMPLETA', 'CONFIRMING_DESTINO_COMPLETA',
  'COLLECTING_DETALHES_RECOLHA', 'COLLECTING_DETALHES_ENTREGA',
] as const;

function isLeadInquiry(text: string): boolean {
  const upper = text.trim().toUpperCase();
  if (upper === 'PSERV' || upper === 'AJUDA' || upper === 'ESTADO') return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('orçamento') ||
    lower.includes('orcamento') ||
    lower.includes('solicitei') ||
    lower.includes('confirmar os detalhes') ||
    lower.includes('quanto custa') ||
    lower.includes('qual o preço') ||
    lower.includes('qual é o preço') ||
    lower.includes('preciso enviar') ||
    lower.includes('quero enviar') ||
    lower.includes('preciso de enviar') ||
    lower.includes('quero transportar') ||
    lower.includes('preciso transportar') ||
    lower.includes('quero um transporte') ||
    lower.includes('preciso de transporte')
  );
}

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

    // Sem conversa activa e mensagem sem sinais de lead → ignorar silenciosamente
    // (clientes existentes, drivers, equipa interna que contactam directamente)
    if (!conv && !isTriggerRestart && !isLeadInquiry(mensagem)) {
      return Response.json({ success: true, response: '', nextStep: 'CLOSED', quickReplies: [], situacaoId: null, escalate: false });
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

    // ── Mensagem pré-preenchida da landing page (botão WhatsApp) ────────────
    if (conv.step === 'INIT') {
      const prefilled = parseWAPrefilledMessage(mensagem);
      if (prefilled && (prefilled.origem || prefilled.destino)) {
        const seedData: Partial<ConversationData> = {};
        if (prefilled.origem)   seedData.origem  = prefilled.origem;
        if (prefilled.destino)  seedData.destino = prefilled.destino;
        if (prefilled.viatura)  seedData.viatura = prefilled.viatura;
        if (prefilled.urgencia) {
          seedData.urgencia    = prefilled.urgencia;
          seedData.serviceType = prefilled.urgencia === '24 Horas' ? 'arrasto' : 'direto';
        }
        if (prefilled.nome)  seedData.nome  = prefilled.nome;
        if (prefilled.email) seedData.email = prefilled.email;
        await updateConversationData(telemovel, seedData);
        Object.assign(conv.data, seedData);
        response = buildWAPrefilledResponse(prefilled);
      }
    }

    // ── Recolha de dados por step ────────────────────────────────────────────
    const dataUpdate: Partial<ConversationData> = {};

    switch (conv.step) {
      case 'COLLECTING_ORIGEM':
        dataUpdate.origem = mensagem;
        break;

      case 'COLLECTING_DESTINO': {
        dataUpdate.destino = mensagem;
        // Disparar análise de agregação em background — não bloqueia a resposta ao lead
        const origemParaAgg = conv.data.origem;
        const destinoParaAgg = mensagem;
        if (origemParaAgg) {
          findAggregationHints(origemParaAgg, destinoParaAgg)
            .then(async ({ hints }) => {
              if (hints.length === 0) return;
              const db = await getDb();
              await db.collection('conversations').updateOne(
                { telemovel },
                { $set: { aggHints: hints, aggHintsAt: new Date(), aggHintsSeen: false } },
              );
            })
            .catch(() => {});
        }
        break;
      }

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

      case 'COLLECTING_VOLUMES': {
        const countMatch = mensagem.match(/(\d+)\s*(volume|caixa|saco|embalagem|volumes|caixas|sacos|embalagens)/i);
        const dimMatch = mensagem.match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i);
        dataUpdate.volumes = {
          count: countMatch ? parseInt(countMatch[1]) : undefined,
          descricao: mensagem.trim(),
          dimensoes: dimMatch ? `${dimMatch[1]}×${dimMatch[2]}×${dimMatch[3]} cm` : undefined,
        };
        break;
      }

      case 'COLLECTING_NOME':
        dataUpdate.nome = mensagem;
        break;

      case 'COLLECTING_EMAIL': {
        if (mensagem.includes('@')) dataUpdate.email = mensagem.trim();
        break;
      }

      case 'COLLECTING_NOTAS': {
        const lower = mensagem.toLowerCase().trim();
        const skip = lower === 'não' || lower === 'nao' || lower.startsWith('sem nota') || lower.startsWith('não ') || lower.startsWith('nao ') || lower === 'pronto';
        if (!skip) dataUpdate.notas = mensagem.trim();
        break;
      }

      case 'COLLECTING_DETALHES_RECOLHA': {
        if (!isSaltar(mensagem)) {
          const contacto = await parseContacto(mensagem);
          dataUpdate.contactoRecolha = contacto;
        }
        break;
      }

      case 'COLLECTING_DETALHES_ENTREGA': {
        if (!isSaltar(mensagem)) {
          const contacto = await parseContacto(mensagem);
          dataUpdate.contactoEntrega = contacto;
        }
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

        // Apresentar da mais cara (10h) para a mais barata (19h); recomendar a do meio (13h)
        const sortedPrices = [...prices].reverse();
        const recommended = sortedPrices[Math.floor(sortedPrices.length / 2)];
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

        response = buildPartnerPriceMessage(sortedPrices, kg);
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

    // ── Atalho "pronto" — salta todos os passos opcionais e regista de imediato ─
    if (isPronto(mensagem) && (PRONTO_SHORTCUT_STEPS as readonly string[]).includes(conv.step)) {
      await setConversationStep(telemovel, 'COLLECTING_DETALHES_ENTREGA');
      conv.step = 'COLLECTING_DETALHES_ENTREGA' as any;
      response = { text: '', nextStep: 'LEAD_REGISTERED' };
    }

    // ── Morada de recolha — parse LLM + confirmação ──────────────────────────
    if (conv.step === 'COLLECTING_ORIGEM_COMPLETA') {
      if (isSaltar(mensagem)) {
        response = { text: 'E a morada completa de entrega?\n\n_(Rua, número/andar, código postal, localidade)_\n\nPode responder *saltar* para avançar.', nextStep: 'COLLECTING_DESTINO_COMPLETA' };
      } else {
        const parsed = await parseEndereco(mensagem);
        await updateConversationData(telemovel, { origemCompleta: parsed });
        conv.data.origemCompleta = parsed;
        const formatted = formatEndereco(parsed);
        response = {
          text: `Percebi a seguinte morada de recolha:\n\n*${formatted}*\n\nEstá correcto?`,
          nextStep: 'CONFIRMING_ORIGEM_COMPLETA',
          quickReplies: ['Sim, correcto', 'Não, corrigir'],
        };
      }
    }

    // ── Morada de entrega — parse LLM + confirmação ───────────────────────────
    if (conv.step === 'COLLECTING_DESTINO_COMPLETA') {
      if (isSaltar(mensagem)) {
        response = { text: 'Quem estará disponível para a recolha? Indique *nome*, *telefone* e *janela horária*.\n\nPode responder *saltar* para avançar.', nextStep: 'COLLECTING_DETALHES_RECOLHA', quickReplies: ['09:00-12:00', '12:00-17:00', '17:00-20:00', 'Saltar'] };
      } else {
        const parsed = await parseEndereco(mensagem);
        await updateConversationData(telemovel, { destinoCompleta: parsed });
        conv.data.destinoCompleta = parsed;
        const formatted = formatEndereco(parsed);
        response = {
          text: `Percebi a seguinte morada de entrega:\n\n*${formatted}*\n\nEstá correcto?`,
          nextStep: 'CONFIRMING_DESTINO_COMPLETA',
          quickReplies: ['Sim, correcto', 'Não, corrigir'],
        };
      }
    }

    // ── Auto-skip nome (dados pré-preenchidos, ex: web-b) ───────────────────────
    // Se o bot ia pedir o nome mas já está guardado, saltar directo para notas.
    if (response.nextStep === 'COLLECTING_NOME' && conv.data.nome) {
      response = {
        text: 'Tem alguma nota adicional? _(horários especiais, instruções de acesso, pisos, etc.)_\n\nResponda *não* para saltar.',
        nextStep: 'COLLECTING_NOTAS',
        quickReplies: ['Sem notas'],
      };
    }

    // ── Intercepção pré-lead: pagamento MBWAY (se pagamentoAtivo) ────────────
    if (response.nextStep === 'LEAD_REGISTERED') {
      const dbPag = await getDb();
      const routingDocPag = await dbPag.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
      const pagamentoAtivo = (routingDocPag as any)?.pagamentoAtivo ?? defaultRoutingConfig.pagamentoAtivo;
      const pagamentoProvider: 'paybylink' | 'mbway' | 'stripe' = (routingDocPag as any)?.pagamentoProvider ?? defaultRoutingConfig.pagamentoProvider;

      if (pagamentoAtivo) {
        const isArrasto = conv.data.serviceType === 'arrasto';
        const finalPrice = isArrasto ? conv.data.partnerFinalPrice : conv.data.priceWithDiscount;
        const rawPhone = conv.data.telemovel ?? telemovel;

        try {
          if (pagamentoProvider === 'paybylink') {
            // ── Pay By Link — gera link, cliente escolhe método (MB Way, Multibanco, Cartão...)
            const { createPayByLink, phoneToOrderId } = await import('@/lib/agent/paybylink/ifthenpay');
            const orderId = phoneToOrderId(rawPhone);
            const result = await createPayByLink({
              gatewayKey: process.env.PBL_GATEWAY_KEY!,
              orderId,
              amount: finalPrice ?? 0,
              description: `YourBox ${conv.data.origem ?? ''} → ${conv.data.destino ?? ''}`.slice(0, 200),
              expireHours: 24,
            });

            if (result.success && result.redirectUrl) {
              await updateConversationData(telemovel, { pblOrderId: orderId, pblPaymentUrl: result.redirectUrl });
              conv.data.pblOrderId = orderId;
              conv.data.pblPaymentUrl = result.redirectUrl;
              response = {
                text: `Para confirmar o seu serviço, efectue o pagamento através do link:\n\n` +
                  `👉 ${result.redirectUrl}\n\n` +
                  `*Valor: €${finalPrice?.toFixed(2)}*\n\n` +
                  `Pode pagar por MB Way, Multibanco ou Cartão. ` +
                  `O link é válido por *24 horas*.`,
                nextStep: 'AWAITING_PAYMENT',
              };
            }

          } else if (pagamentoProvider === 'mbway') {
            // ── MB Way directo — push para app MB Way
            const { createIfthenpayMbway, normalizePhoneIfthenpay } = await import('@/lib/agent/mbway/ifthenpay');
            const { phoneToOrderId: toOrderId } = await import('@/lib/agent/paybylink/ifthenpay');
            const phone = normalizePhoneIfthenpay(rawPhone);
            const result = await createIfthenpayMbway({
              mbwayKey: process.env.MBWAY_KEY!,
              orderId: toOrderId(rawPhone),
              amount: finalPrice ?? 0,
              phone,
            });

            if (result.status === '000') {
              await updateConversationData(telemovel, { ifthenpayRequestId: result.requestId });
              conv.data.ifthenpayRequestId = result.requestId;
              response = {
                text: `Para confirmar o seu pedido, vai receber uma notificação *MB Way* no número *${phone}*.\n\n` +
                  `Valor: *€${finalPrice?.toFixed(2)}*\n\n` +
                  `Aceite o pagamento na app MB Way. A notificação expira em *4 minutos*.`,
                nextStep: 'AWAITING_PAYMENT',
              };
            }

          } else {
            // ── Stripe MB Way
            const phone = rawPhone.startsWith('+') ? rawPhone : `+351${rawPhone}`;
            const amountCents = Math.round((finalPrice ?? 0) * 100);
            const StripeLib = (await import('stripe')).default;
            const stripe = new StripeLib(process.env.STRIPE_SECRET_KEY!);
            const pi = await stripe.paymentIntents.create({
              amount: amountCents,
              currency: 'eur',
              payment_method_types: ['mb_way'],
              payment_method_data: { type: 'mb_way', mb_way: { phone } },
              confirm: true,
              metadata: { telemovel: rawPhone },
            });
            await updateConversationData(telemovel, { stripePaymentIntentId: pi.id });
            conv.data.stripePaymentIntentId = pi.id;
            response = {
              text: `Para confirmar o seu pedido, vai receber uma notificação *MB Way* no número *${phone}*.\n\n` +
                `Valor: *€${finalPrice?.toFixed(2)}*\n\n` +
                `Assim que o pagamento for confirmado, o pedido fica registado.`,
              nextStep: 'AWAITING_PAYMENT',
            };
          }
        } catch (err: any) {
          console.error(`Pagamento ${pagamentoProvider} error:`, err.message);
          // Falha no pagamento — avança sem pagamento
        }
      }
    }

    // ── Registar lead ────────────────────────────────────────────────────────
    const leadRegistrationSteps = ['COLLECTING_DETALHES_ENTREGA'] as const;
    if (response.nextStep === 'LEAD_REGISTERED' && (leadRegistrationSteps as readonly string[]).includes(conv.step)) {
      const nome = conv.data.nome ?? 'Lead Bot';
      const db = await getDb();
      const timeStamp = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });

      const isArrasto = conv.data.serviceType === 'arrasto';
      const finalPrice = isArrasto ? conv.data.partnerFinalPrice : conv.data.priceWithDiscount;
      const serviceInfo = isArrasto
        ? `<p><b>Serviço:</b> Entrega Amanhã ${conv.data.partnerWindow} | <b>Peso:</b> ${conv.data.weightKg}kg</p>`
        : `<p><b>Viatura:</b> ${conv.data.viatura} | <b>Urgência:</b> ${conv.data.urgencia}</p>`;

      const moradaRecolhaHtml = conv.data.origemCompleta
        ? `<p><b>Recolha:</b> ${formatEndereco(conv.data.origemCompleta)}</p>` +
          (conv.data.contactoRecolha ? `<p><b>Contacto recolha:</b> ${formatContacto(conv.data.contactoRecolha)}</p>` : '')
        : '';
      const moradaEntregaHtml = conv.data.destinoCompleta
        ? `<p><b>Entrega:</b> ${formatEndereco(conv.data.destinoCompleta)}</p>` +
          (conv.data.contactoEntrega ? `<p><b>Contacto entrega:</b> ${formatContacto(conv.data.contactoEntrega)}</p>` : '')
        : '';
      const volumesHtml = conv.data.volumes?.descricao
        ? `<p><b>Volumes:</b> ${conv.data.volumes.descricao}</p>`
        : '';
      const notasHtml = conv.data.notas
        ? `<p><b>Notas:</b> ${conv.data.notas}</p>`
        : '';

      const leadResult = await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div style="line-height:1.4;"><p><b>LEAD BOT</b> <small>(${timeStamp})</small></p><p>${telemovel}</p><p>${nome}</p>${conv.data.email ? `<p>${conv.data.email}</p>` : ''}<p>${conv.data.origem} → ${conv.data.destino}</p>${serviceInfo}${volumesHtml}${moradaRecolhaHtml}${moradaEntregaHtml}${notasHtml}<p><b>Preco Final:</b> €${finalPrice?.toFixed(2)}</p><p style="color:green;"><b>CONTACTAR AGORA [canal: BOT]</b></p></div>`,
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
          origemCompleta: conv.data.origemCompleta,
          destinoCompleta: conv.data.destinoCompleta,
          contactoRecolha: conv.data.contactoRecolha,
          contactoEntrega: conv.data.contactoEntrega,
          volumes: conv.data.volumes,
          notas: conv.data.notas,
          timeStamp: new Date(), converted: true, convertedAt: new Date(), source: 'bot',
        },
      });
      await closeConversation(telemovel, leadResult.insertedId.toString());
      response = buildLeadRegisteredMessage(nome, finalPrice, conv.data.serviceType);
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
