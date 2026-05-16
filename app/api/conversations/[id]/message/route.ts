import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getLlmResponse } from '@/lib/agent/llmResponder';
import { calcAllActiveTariffs, parseTotalCm } from '@/lib/agent/partnerPricing';
import { calcDepotPickupPrice } from '@/lib/agent/depotPricing';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { PartnerTariff } from '@/types/partner';
import type { PartnerDepot } from '@/types/pricing';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
}

function businessHoursContact(): string {
  const l = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const h = l.getHours(), m = l.getMinutes(), dow = l.getDay();
  const inHours = dow >= 1 && dow <= 5 && (h > 8 || (h === 8 && m >= 30)) && h < 20;
  return inHours
    ? 'Um operador vai analisar e contactá-lo brevemente.'
    : 'Respondemos no próximo dia útil a partir das 08h30.';
}

const DEPOT_OUT_OF_RANGE_MSG =
  'O serviço de entrega amanhã YourBox cobre directamente as zonas de Lisboa e Porto. ' +
  'A sua recolha fica fora dessa cobertura directa, o que implica uma cotação personalizada.';

function build24hPriceHeader(kg: number): { header: string; cutoffNote: string } {
  const l = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const afterCutoff = l.getHours() >= 16;
  return {
    header: afterCutoff
      ? `*Entrega YourBox — 2 dias úteis — ${kg} kg*`
      : `*Entrega YourBox Amanhã — ${kg} kg*`,
    cutoffNote: afterCutoff
      ? `\n\n⚠️ *Atenção:* após as 16h00, a recolha hoje já não é possível. A carga ficará agendada para *amanhã de manhã*, com entrega no *dia seguinte*.`
      : `\n\n_Nota: confirme antes das *16h00* para garantir recolha hoje._`,
  };
}

function maxExpeditionKg(tariffDocs: PartnerTariff[]): number {
  return tariffDocs.reduce((m, t) => Math.max(m, t.conditions?.maxWeightPerExpedition ?? 0), 0);
}
function maxVolumeKg(tariffDocs: PartnerTariff[]): number {
  return tariffDocs.reduce((m, t) => Math.max(m, t.conditions?.maxWeightPerVolume ?? 0), 0);
}
function maxAllVolumesCm(tariffDocs: PartnerTariff[]): number {
  return tariffDocs.reduce((m, t) => Math.max(m, t.conditions?.maxDimensionCm ?? 0), 0);
}
function parseNVolumes(text: string): number | null {
  const wordMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'três': 3, 'tres': 3,
    'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
  };
  const m = text.match(/\b(\d+)\b/);
  if (m) return parseInt(m[1], 10);
  const lower = text.toLowerCase().trim();
  for (const [word, val] of Object.entries(wordMap)) {
    if (lower.includes(word)) return val;
  }
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oid = toOid(id);
    if (!oid) return Response.json({ error: 'ID invalido' }, { status: 400 });

    const { text } = await request.json();
    if (!text?.trim()) return Response.json({ error: 'Texto obrigatorio' }, { status: 400 });

    const db = await getDb();
    const convDoc = await db.collection('conversations').findOne({ _id: oid });
    if (!convDoc) return Response.json({ error: 'Conversa nao encontrada' }, { status: 404 });
    if (['CLOSED', 'LEAD_REGISTERED'].includes(convDoc.step)) {
      return Response.json({ error: 'Conversa encerrada', step: convDoc.step }, { status: 409 });
    }

    // Chat em tempo real com operador: guardar mensagem, sem resposta automática
    if (convDoc.step === 'LIVE_CHAT') {
      const history = convDoc.history ?? [];
      history.push({ role: 'lead', text: text.trim(), timestamp: new Date() });
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { history, updatedAt: new Date() } }
      );
      return Response.json({
        success: true,
        message: null,
        step: 'LIVE_CHAT',
        historyCount: history.length,
        quickReplies: [],
      });
    }

    // Quando escalado: guardar mensagem no histórico para o agente ver, sem processar pelo LLM
    if (convDoc.step === 'ESCALATED_TO_HUMAN') {
      const history = convDoc.history ?? [];
      history.push({ role: 'lead', text: text.trim(), timestamp: new Date() });
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { history, updatedAt: new Date() } }
      );
      return Response.json({
        success: true,
        message: null,
        step: 'ESCALATED_TO_HUMAN',
        historyCount: history.length,
        quickReplies: [],
      });
    }

    const mensagem = text.trim();
    const now = new Date();

    // ── Step estruturado: recolha do nº de volumes (serviço 24h) ────────────
    if (convDoc.step === 'COLLECTING_NVOLUMES_24H') {
      const history = convDoc.history ?? [];
      history.push({ role: 'lead', text: mensagem, timestamp: now });

      const nVol = parseNVolumes(mensagem);
      if (!nVol || nVol < 1 || nVol > 99) {
        const retryText = 'Não percebi. Quantas *caixas/volumes* tem a carga? _(ex: 1, 2, 3...)_';
        history.push({ role: 'bot', text: retryText, timestamp: now });
        await db.collection('conversations').updateOne({ _id: oid }, { $set: { history, updatedAt: now } });
        return Response.json({ success: true, message: retryText, step: 'COLLECTING_NVOLUMES_24H', quickReplies: ['1', '2', '3', '4 ou mais'] });
      }

      const kg = (convDoc.data as any).weightKg ?? 1;
      const tariffDocsNV = await db.collection('partnerTariffs')
        .find({ active: true, zone: 'Nacional' }).sort({ sortOrder: 1 }).toArray() as unknown as PartnerTariff[];
      const maxVolKgNV = maxVolumeKg(tariffDocsNV);

      if (maxVolKgNV > 0 && (kg / nVol) > maxVolKgNV) {
        const kgPerVol = (kg / nVol).toFixed(1);
        const escMsg = `Com *${kg} kg* em *${nVol} volume${nVol > 1 ? 's' : ''}*, o peso médio por volume (${kgPerVol} kg) excede o limite de *${maxVolKgNV} kg/volume* do serviço YourBox.\n\nA nossa equipa vai analisar a melhor solução para a sua carga. ${businessHoursContact()}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { step: 'ESCALATED_TO_HUMAN', 'data.nVolumes': nVol, history, escalatedAt: now, updatedAt: now } }
        );
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      const dimQ = `Obrigado. Indique as *dimensões* de cada caixa (C × L × A em cm):\n\n_(ex: 60×40×30)_\n\nPode responder *saltar* se não souber.`;
      history.push({ role: 'bot', text: dimQ, timestamp: now });
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: 'COLLECTING_DIMENSIONS_24H', 'data.nVolumes': nVol, history, updatedAt: now } }
      );
      return Response.json({ success: true, message: dimQ, step: 'COLLECTING_DIMENSIONS_24H', quickReplies: [] });
    }

    // ── Step estruturado: recolha de dimensões para serviço 24h ─────────────
    if (convDoc.step === 'COLLECTING_DIMENSIONS_24H') {
      const history = convDoc.history ?? [];
      history.push({ role: 'lead', text: mensagem, timestamp: now });

      const isSaltar = /^s(altar)?$/i.test(mensagem.trim());
      const totalCm = isSaltar ? 0 : (parseTotalCm(mensagem) ?? 0);

      const db2 = db;
      const routingDoc = await db2.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
      const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;

      // ── Depósito dinâmico ──────────────────────────────────────────────────
      const depots24 = ((routingDoc as any)?.partnerDepots ?? []) as PartnerDepot[];
      let depotPrice24: number | undefined;
      if (depots24.length > 0 && convDoc.data.origem) {
        const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depots24, db);
        if (!dr) {
          const escMsg = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}`;
          history.push({ role: 'bot', text: escMsg, timestamp: now });
          await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
          return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
        }
        depotPrice24 = dr.pickupPrice;
      }

      const tariffDocs = await db2.collection('partnerTariffs')
        .find({ active: true, zone: 'Nacional' })
        .sort({ sortOrder: 1 })
        .toArray() as unknown as PartnerTariff[];

      const kg = (convDoc.data as any).weightKg ?? 1;

      // ── Verificar peso máximo da expedição ────────────────────────────────
      const maxExpKg24 = maxExpeditionKg(tariffDocs);
      if (maxExpKg24 > 0 && kg > maxExpKg24) {
        const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKg24} kg* por expedição).\n\nA nossa equipa vai analisar soluções para a sua carga. ${businessHoursContact()}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      // ── Verificar peso por volume e dimensões totais ───────────────────────
      const nVol24 = (convDoc.data as any).nVolumes ?? 1;
      const maxVolKgVal = maxVolumeKg(tariffDocs);
      const maxDimCmVal = maxAllVolumesCm(tariffDocs);

      if (maxVolKgVal > 0 && (kg / nVol24) > maxVolKgVal) {
        const kgPerVol = (kg / nVol24).toFixed(1);
        const escMsg = `Com *${kg} kg* em *${nVol24} volume${nVol24 > 1 ? 's' : ''}*, o peso médio por volume (${kgPerVol} kg) excede o limite de *${maxVolKgVal} kg/volume* do serviço YourBox.\n\nA nossa equipa vai analisar a melhor solução. ${businessHoursContact()}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }
      if (totalCm > 0 && maxDimCmVal > 0 && (totalCm * nVol24) > maxDimCmVal) {
        const totalDim = totalCm * nVol24;
        const escMsg = `As dimensões totais dos *${nVol24} volume${nVol24 > 1 ? 's' : ''}* (${totalCm} cm × ${nVol24} = ${totalDim} cm de C+L+A) excedem o limite de *${maxDimCmVal} cm* do serviço YourBox.\n\nA nossa equipa vai analisar soluções para o seu envio. ${businessHoursContact()}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      const isSaturday = new Date().getDay() === 6;
      const prices = calcAllActiveTariffs(tariffDocs, kg, totalCm, isSaturday, defaultMarkup, depotPrice24);
      const sorted = [...prices].reverse();
      const recommended = sorted[Math.floor(sorted.length / 2)];
      const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)} _(IVA 23% incl.)_`).join('\n');
      const dimNote = totalCm === 0
        ? '\n\n_Nota: preço sem suplemento dimensional. Se comprimento + largura + altura > 150cm, o valor final pode ser superior._'
        : '';
      const showLimitsNote24 = nVol24 > 1 || kg > maxVolKgVal;
      const limitsNote24 = showLimitsNote24 && maxVolKgVal > 0
        ? `\n\n_Atenção: máximo *${maxVolKgVal} kg por volume* e *${maxDimCmVal} cm* de C+L+A no total de todos os volumes._`
        : '';
      const { header: hdr24, cutoffNote: cn24 } = build24hPriceHeader(kg);
      const botText = `${hdr24}\n\n${priceLines}\n\nRecomendamos *${recommended.serviceLabelShort}* a €${recommended.finalPrice.toFixed(2)}.${dimNote}${limitsNote24}${cn24}\n\nQual janela prefere?`;

      history.push({ role: 'bot', text: botText, timestamp: now });
      await db2.collection('conversations').updateOne(
        { _id: oid },
        { $set: {
          step: 'PRESENTING_PARTNER_PRICE',
          'data.totalCm': totalCm || null,
          'data.partnerFinalPrice': recommended.finalPrice,
          'data.partnerWindow': recommended.deliveryWindow,
          history, updatedAt: now,
        }}
      );
      return Response.json({
        success: true,
        message: botText,
        step: 'PRESENTING_PARTNER_PRICE',
        quickReplies: sorted.map((p) => `${p.serviceLabelShort} €${p.finalPrice.toFixed(2)}`).concat(['Cancelar']),
      });
    }

    // ── Step: confirmar entrega 6ª feira (sábado vs segunda) ────────────────
    if (convDoc.step === 'CONFIRMING_FRIDAY_DELIVERY') {
      const history = convDoc.history ?? [];
      history.push({ role: 'lead', text: mensagem, timestamp: now });

      const wantsSaturday = /s[áa]bado|[ée]\s*amanh[aã]|tem\s*de\s*ser|precis[ao]\s*ser|n[aã]o\s*pode\s*esperar|urgente/i.test(mensagem);
      const contactSuffix = businessHoursContact();

      let fridayBotText: string;
      let fridayStep: string;
      let fridayEscalate = false;
      const fridayQuickReplies: string[] = [];

      if (wantsSaturday) {
        fridayStep = 'ESCALATED_TO_HUMAN';
        fridayEscalate = true;
        fridayBotText = `O serviço YourBox de entrega ao *sábado* requer análise individual — as entregas garantidas operam apenas em dias úteis.\n\n${contactSuffix}`;
        await db.collection('messages').insertOne({
          company: 'Yourbox', messageType: 'newLead', to: 'admin',
          presentationMessage: 'stick', deletedAfter: 0,
          message: `<div><p><b>ESCALAMENTO — ENTREGA SÁBADO</b></p><p>${convDoc.data.origem ?? '?'} → ${convDoc.data.destino ?? '?'}</p><p>Lead necessita entrega ao sábado (fora de dias úteis do parceiro)</p></div>`,
          companyProvider: 'Yourbox', senderName: 'Bot Web — Entrega Sábado', variante: 'BOT',
          timeStamp: now, closed: false, reply: [],
          leadData: { ...convDoc.data, converted: false, source: 'web_chat_saturday_delivery' },
        });
      } else {
        const kg = (convDoc.data as any).weightKg ?? 1;
        const totalCmKnown = (convDoc.data as any).totalCm ?? 0;
        const nVolumesFri = (convDoc.data as any).nVolumes;
        if (!nVolumesFri) {
          fridayStep = 'COLLECTING_NVOLUMES_24H';
          fridayBotText = `Óptimo, agendamos para *segunda-feira*!\n\nQuantas *caixas/volumes* tem a carga? _(ex: 1 caixa, 2 volumes)_`;
          fridayQuickReplies.push('1', '2', '3', '4 ou mais');
          await db.collection('conversations').updateOne(
            { _id: oid },
            { $set: { step: 'COLLECTING_NVOLUMES_24H', updatedAt: now } }
          );
        } else if (totalCmKnown === 0) {
          fridayStep = 'COLLECTING_DIMENSIONS_24H';
          fridayBotText = `Óptimo, agendamos para *segunda-feira*!\n\nPara o preço mais preciso, indique as *dimensões* da(s) caixa(s):\n\n*Comprimento × Largura × Altura* em cm _(ex: 60×40×30)_\n\nPode responder *saltar* se não souber.`;
          await db.collection('conversations').updateOne(
            { _id: oid },
            { $set: { step: 'COLLECTING_DIMENSIONS_24H', updatedAt: now } }
          );
        } else {
          fridayStep = 'PRESENTING_PARTNER_PRICE';
          try {
            const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
            const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;

            // ── Depósito dinâmico ────────────────────────────────────────────
            const depotsFri = ((routingDoc as any)?.partnerDepots ?? []) as PartnerDepot[];
            let depotPriceFri: number | undefined;
            if (depotsFri.length > 0 && convDoc.data.origem) {
              const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depotsFri, db);
              if (!dr) {
                fridayBotText = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}`;
                fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
                history.push({ role: 'bot', text: fridayBotText!, timestamp: now });
                const fridayFieldsEsc: Record<string, unknown> = { history, step: fridayStep, updatedAt: now, escalatedAt: now };
                await db.collection('conversations').updateOne({ _id: oid }, { $set: fridayFieldsEsc });
                return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: [], escalate: true });
              }
              depotPriceFri = dr.pickupPrice;
            }

            const tariffDocs = await db.collection('partnerTariffs')
              .find({ active: true, zone: 'Nacional' }).sort({ sortOrder: 1 }).toArray() as unknown as PartnerTariff[];

            // ── Verificar peso máximo da expedição ────────────────────────
            const maxExpKgFri = maxExpeditionKg(tariffDocs);
            if (maxExpKgFri > 0 && kg > maxExpKgFri) {
              fridayBotText = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgFri} kg* por expedição).\n\nA nossa equipa vai analisar soluções para a sua carga. ${businessHoursContact()}`;
              fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
              history.push({ role: 'bot', text: fridayBotText!, timestamp: now });
              const fridayFieldsEsc2: Record<string, unknown> = { history, step: fridayStep, updatedAt: now, escalatedAt: now };
              await db.collection('conversations').updateOne({ _id: oid }, { $set: fridayFieldsEsc2 });
              return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: [], escalate: true });
            }

            const prices = calcAllActiveTariffs(tariffDocs, kg, totalCmKnown, false, defaultMarkup, depotPriceFri);
            if (prices.length > 0) {
              const sorted = [...prices].reverse();
              const rec = sorted[Math.floor(sorted.length / 2)];
              const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)} _(IVA 23% incl.)_`).join('\n');
              const nVolFri = (convDoc.data as any).nVolumes ?? 1;
              const maxVolKgFriVal = maxVolumeKg(tariffDocs);
              const maxDimCmFriVal = maxAllVolumesCm(tariffDocs);
              const showLimitsNoteFri = nVolFri > 1 || kg > maxVolKgFriVal;
              const limitsNoteFri = showLimitsNoteFri && maxVolKgFriVal > 0
                ? `\n\n_Atenção: máximo *${maxVolKgFriVal} kg por volume* e *${maxDimCmFriVal} cm* de C+L+A no total de todos os volumes._`
                : '';
              const { cutoffNote: cnFri } = build24hPriceHeader(kg);
              fridayBotText = `*Entrega YourBox — ${kg} kg* (segunda-feira)\n\n${priceLines}\n\nRecomendamos *${rec.serviceLabelShort}* a €${rec.finalPrice.toFixed(2)}.${limitsNoteFri}${cnFri}\n\nQual janela prefere?`;
              fridayQuickReplies.push(...sorted.map((p) => `${p.serviceLabelShort} €${p.finalPrice.toFixed(2)}`), 'Cancelar');
              await db.collection('conversations').updateOne(
                { _id: oid },
                { $set: { step: 'PRESENTING_PARTNER_PRICE', 'data.serviceType': 'arrasto', 'data.weightKg': kg, 'data.partnerFinalPrice': rec.finalPrice, 'data.partnerWindow': rec.deliveryWindow, updatedAt: now } }
              );
            } else {
              fridayBotText = 'Não foi possível calcular o preço. A nossa equipa contactará brevemente.';
              fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
            }
          } catch {
            fridayBotText = 'Não foi possível calcular o preço. A nossa equipa contactará brevemente.';
            fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
          }
        }
        // Define fridayBotText para typescript (garantir sempre definido)
        fridayBotText ??= 'Não foi possível processar. A nossa equipa vai contactar brevemente.';
      }

      history.push({ role: 'bot', text: fridayBotText!, timestamp: now });
      const fridayFields: Record<string, unknown> = { history, step: fridayStep, updatedAt: now };
      if (fridayEscalate) fridayFields.escalatedAt = now;
      await db.collection('conversations').updateOne({ _id: oid }, { $set: fridayFields });
      return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: fridayQuickReplies, escalate: fridayEscalate });
    }

    // Adicionar mensagem do utilizador ao histórico
    const history = convDoc.history ?? [];
    history.push({ role: 'lead', text: mensagem, timestamp: now });

    // Chamar LLM
    const result = await getLlmResponse(convDoc.data, history, mensagem);

    let botText = result.text;
    let nextStep: string = convDoc.step;
    let escalate = false;
    let leadRegistered = false;

    // ── Processar resultado do LLM ───────────────────────────────────────────

    if (result.type === 'escalate') {
      nextStep = 'ESCALATED_TO_HUMAN';
      escalate = true;
      const isAggRequest = result.reason?.startsWith('[AGG_REQUEST]');
      if (isAggRequest) {
        nextStep = 'LIVE_CHAT';
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { escalationType: 'agg_request' } },
        );
      }
      // Inserir lead de escalamento
      await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin',
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div><p><b>${isAggRequest ? 'PEDIDO DE ANÁLISE DE AGREGAÇÃO' : 'ESCALAMENTO WEB BOT'}</b></p><p>${convDoc.data.origem ?? '?'} → ${convDoc.data.destino ?? '?'}</p><p>Motivo: ${result.reason}</p></div>`,
        companyProvider: 'Yourbox', senderName: isAggRequest ? 'Bot Web — Pedido Agregação' : 'Bot Web — Escalamento', variante: 'BOT',
        timeStamp: now, closed: false, reply: [],
        leadData: { ...convDoc.data, converted: false, source: isAggRequest ? 'web_chat_agg_request' : 'web_chat_escalation' },
      });

    } else if (result.type === 'register_lead') {
      const isEscalatedCase = !!(convDoc.data as any).isEscalatedCase;
      nextStep = isEscalatedCase ? 'ESCALATED_TO_HUMAN' : 'LEAD_REGISTERED';
      leadRegistered = true;
      const nome = result.nome;
      const telefone = result.telefone;
      const email = result.email;
      const isArrasto = convDoc.data.serviceType === 'arrasto';
      const finalPrice = isArrasto ? convDoc.data.partnerFinalPrice : convDoc.data.priceWithDiscount;
      const timeStamp = now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
      const serviceInfo = isArrasto
        ? `<p><b>Serviço:</b> Entrega Amanhã ${convDoc.data.partnerWindow ?? ''} | <b>Peso:</b> ${convDoc.data.weightKg ?? '?'}kg</p>`
        : `<p><b>Viatura:</b> ${convDoc.data.viatura} | <b>Urgência:</b> ${convDoc.data.urgencia}</p>`;
      const notasHtml = result.notas ? `<p><b>Notas:</b> ${result.notas}</p>` : '';
      const origemHtml = result.origemCompleta ? `<p><b>Recolha:</b> ${result.origemCompleta}</p>` : '';
      const destinoHtml = result.destinoCompleta ? `<p><b>Entrega:</b> ${result.destinoCompleta}</p>` : '';
      const contactoRecolhaHtml = result.contactoRecolha ? `<p><b>Contacto recolha:</b> ${result.contactoRecolha}</p>` : '';
      const contactoEntregaHtml = result.contactoEntrega ? `<p><b>Contacto entrega:</b> ${result.contactoEntrega}</p>` : '';
      const volumesHtml = result.volumes ? `<p><b>Volumes:</b> ${result.volumes}</p>` : '';
      const canalLabel = isEscalatedCase ? 'WEB CHAT FORA DE HORÁRIO' : 'WEB CHAT BOT LLM';

      await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div style="line-height:1.4;"><p><b>LEAD BOT WEB</b> <small>(${timeStamp})</small></p><p>${convDoc.data.origem} → ${convDoc.data.destino}</p>${serviceInfo}<p><b>Nome:</b> ${nome}</p><p><b>Telefone:</b> ${telefone}</p>${email ? `<p><b>Email:</b> ${email}</p>` : ''}${volumesHtml}${origemHtml}${contactoRecolhaHtml}${destinoHtml}${contactoEntregaHtml}${notasHtml}${!isEscalatedCase ? `<p><b>Preço Final:</b> €${finalPrice?.toFixed(2) ?? '?'}</p>` : ''}<p style="color:${isEscalatedCase ? 'orange' : 'green'};"><b>CONTACTAR [canal: ${canalLabel}]</b></p></div>`,
        companyProvider: 'Yourbox', senderName: 'Bot Agent Web', variante: 'BOT',
        timeStamp: now, closed: false, closedAt: null, reply: [],
        leadData: {
          origem: convDoc.data.origem, destino: convDoc.data.destino,
          urgencia: convDoc.data.urgencia, serviceType: convDoc.data.serviceType,
          viatura: convDoc.data.viatura, weightKg: convDoc.data.weightKg,
          partnerWindow: convDoc.data.partnerWindow,
          priceWithDiscount: convDoc.data.priceWithDiscount,
          partnerFinalPrice: convDoc.data.partnerFinalPrice,
          nome, email, telefone,
          notas: result.notas,
          origemCompleta: result.origemCompleta,
          destinoCompleta: result.destinoCompleta,
          contactoRecolha: result.contactoRecolha,
          contactoEntrega: result.contactoEntrega,
          volumes: result.volumes,
          timeStamp: now, converted: true,
          source: isEscalatedCase ? 'web_chat_escalated' : 'web_chat',
        },
      });

      // Atualizar conversa
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: nextStep, 'data.nome': nome, 'data.telefone': telefone, 'data.email': email ?? null, updatedAt: now } }
      );

    } else if (result.type === 'close') {
      nextStep = 'CLOSED';
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: 'CLOSED', updatedAt: now } }
      );

    } else if (result.type === 'calculate_tomorrow') {
      const kg = result.weightKg ?? convDoc.data.weightKg ?? 1;

      // ── Verificar peso máximo antes de qualquer passo ─────────────────────
      {
        const tariffDocsTmrPre = await db.collection('partnerTariffs')
          .find({ active: true, zone: 'Nacional' }).toArray() as unknown as PartnerTariff[];
        const maxExpKgTmr = maxExpeditionKg(tariffDocsTmrPre);
        if (maxExpKgTmr > 0 && kg > maxExpKgTmr) {
          const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgTmr} kg* por expedição).\n\nA nossa equipa vai analisar soluções para a sua carga. ${businessHoursContact()}`;
          history.push({ role: 'bot', text: escMsg, timestamp: now });
          await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', 'data.weightKg': kg, history, escalatedAt: now, updatedAt: now } });
          return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
        }
      }

      // ── 6ª feira: confirmar sábado vs segunda ──────────────────────────────
      const lisbonNow6 = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
      if (lisbonNow6.getDay() === 5) {
        const fridayQ = `Como hoje é *sexta-feira*, a entrega *amanhã* seria ao *sábado*.\n\nPrefere entrega no *sábado* ou pode aguardar até *segunda-feira*?`;
        history.push({ role: 'bot', text: fridayQ, timestamp: now });
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { step: 'CONFIRMING_FRIDAY_DELIVERY', 'data.weightKg': kg, history, updatedAt: now } }
        );
        return Response.json({ success: true, message: fridayQ, step: 'CONFIRMING_FRIDAY_DELIVERY', quickReplies: ['Sábado', 'Segunda-feira'] });
      }

      // Se não temos nVolumes, pedir primeiro
      const nVolumesTmr = (convDoc.data as any).nVolumes;
      if (!nVolumesTmr) {
        const nVolQ = `Quantas *caixas/volumes* tem a carga? _(ex: 1 caixa, 2 volumes)_`;
        history.push({ role: 'bot', text: nVolQ, timestamp: now });
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { step: 'COLLECTING_NVOLUMES_24H', 'data.weightKg': kg, history, updatedAt: now } }
        );
        return Response.json({ success: true, message: nVolQ, step: 'COLLECTING_NVOLUMES_24H', quickReplies: ['1', '2', '3', '4 ou mais'] });
      }

      const totalCmKnown = (convDoc.data as any).totalCm ?? 0;

      // Se não temos dimensões, pedir antes de calcular
      if (totalCmKnown === 0) {
        nextStep = 'COLLECTING_DIMENSIONS_24H';
        botText = `Obrigado. Para apresentar o preço mais preciso, indique as *dimensões* da(s) caixa(s):\n\n*Comprimento × Largura × Altura* em cm _(ex: 60×40×30)_\n\nPode responder *saltar* se não souber.`;
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { step: 'COLLECTING_DIMENSIONS_24H', 'data.weightKg': kg, updatedAt: now } }
        );
      } else {
        // Dimensões já conhecidas — calcular directamente
        nextStep = 'PRESENTING_PARTNER_PRICE';
        try {
          const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
          const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;

          // ── Depósito dinâmico ──────────────────────────────────────────────
          const depotsTmr = ((routingDoc as any)?.partnerDepots ?? []) as PartnerDepot[];
          let depotPriceTmr: number | undefined;
          if (depotsTmr.length > 0 && convDoc.data.origem) {
            const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depotsTmr, db);
            if (!dr) {
              const escMsg = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}`;
              history.push({ role: 'bot', text: escMsg, timestamp: now });
              await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
              return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
            }
            depotPriceTmr = dr.pickupPrice;
          }

          const tariffDocs = await db.collection('partnerTariffs')
            .find({ active: true, zone: 'Nacional' })
            .sort({ sortOrder: 1 })
            .toArray() as unknown as PartnerTariff[];

          // ── Verificar peso máximo da expedição ──────────────────────────
          const maxExpKgTmr2 = maxExpeditionKg(tariffDocs);
          if (maxExpKgTmr2 > 0 && kg > maxExpKgTmr2) {
            const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgTmr2} kg* por expedição).\n\nA nossa equipa vai analisar soluções para a sua carga. ${businessHoursContact()}`;
            history.push({ role: 'bot', text: escMsg, timestamp: now });
            await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
            return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
          }

          const totalCm = totalCmKnown;
          const isSaturday = new Date().getDay() === 6;
          const prices = calcAllActiveTariffs(tariffDocs, kg, totalCm, isSaturday, defaultMarkup, depotPriceTmr);

          if (prices.length > 0) {
            const sorted = [...prices].reverse();
            const recommended = sorted[Math.floor(sorted.length / 2)];
            const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)} _(IVA 23% incl.)_`).join('\n');
            const nVolTmr = (convDoc.data as any).nVolumes ?? 1;
            const maxVolKgTmr = maxVolumeKg(tariffDocs);
            const maxDimCmTmr = maxAllVolumesCm(tariffDocs);
            const showLimitsNoteTmr = nVolTmr > 1 || kg > maxVolKgTmr;
            const limitsNoteTmr = showLimitsNoteTmr && maxVolKgTmr > 0
              ? `\n\n_Atenção: máximo *${maxVolKgTmr} kg por volume* e *${maxDimCmTmr} cm* de C+L+A no total de todos os volumes._`
              : '';
            const { header: hdrTmr, cutoffNote: cnTmr } = build24hPriceHeader(kg);
            botText = `${hdrTmr}\n\n${priceLines}\n\nRecomendamos *${recommended.serviceLabelShort}* a €${recommended.finalPrice.toFixed(2)}.${limitsNoteTmr}${cnTmr}\n\nQual janela prefere?`;
            await db.collection('conversations').updateOne(
              { _id: oid },
              { $set: {
                step: 'PRESENTING_PARTNER_PRICE',
                'data.serviceType': 'arrasto',
                'data.weightKg': kg,
                'data.partnerFinalPrice': recommended.finalPrice,
                'data.partnerWindow': recommended.deliveryWindow,
                updatedAt: now,
              }}
            );
          }
        } catch {
          botText = botText || 'Não foi possível calcular o preço. A nossa equipa vai contactar brevemente.';
          nextStep = 'ESCALATED_TO_HUMAN';
          escalate = true;
        }
      }
    }

    // ── Guardar mensagem do bot no histórico ─────────────────────────────────
    history.push({ role: 'bot', text: botText, timestamp: now });

    const updateFields: Record<string, unknown> = {
      history,
      updatedAt: now,
    };
    if (!leadRegistered) updateFields.step = nextStep;
    if (escalate) updateFields.escalatedAt = now;

    await db.collection('conversations').updateOne({ _id: oid }, { $set: updateFields });

    return Response.json({
      success: true,
      message: botText,
      step: nextStep,
      quickReplies: [],
      escalate,
    });
  } catch (err: any) {
    console.error('[conversation/message] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
