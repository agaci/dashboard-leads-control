import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getLlmResponse } from '@/lib/agent/llmResponder';
import { calcAllActiveTariffs, parseTotalCm } from '@/lib/agent/partnerPricing';
import { calcDepotPickupPrice } from '@/lib/agent/depotPricing';
import { CARGO_DISCLAIMER } from '@/lib/agent/botResponder';
import { buildPartnerServiceBreakdown } from '@/lib/pricing/priceBreakdownBuilder';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import { build24hPriceHeader, isPortugueseHoliday, getLisbonNow } from '@/lib/utils/holidays';
import { dispatchNotification } from '@/lib/notifications/dispatch';
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
  'O serviço YourBox de entrega amanhã cobre directamente as zonas de Lisboa e Porto. ' +
  'A sua recolha fica fora dessa cobertura directa e requer uma cotação personalizada.';


function dimQuestion(nVol: number): string {
  return nVol > 1
    ? `Indique as dimensões *do conjunto das ${nVol} caixas* (C × L × A em cm):\n\n_(ex: 100×150×40)_\n\nPode responder *saltar* se não souber.`
    : `Indique as dimensões *da caixa* (C × L × A em cm):\n\n_(ex: 60×40×30)_\n\nPode responder *saltar* se não souber.`;
}

function cargoRecapLine(nVol: number | undefined, totalCm: number, kg: number): string {
  if (!nVol && !totalCm) return '';
  const parts: string[] = [];
  if (nVol && nVol > 0) parts.push(`*${nVol} ${nVol > 1 ? 'caixas' : 'caixa'}*`);
  if (totalCm > 0) parts.push(`C+L+A *${totalCm} cm*`);
  parts.push(`*${kg} kg*`);
  return `_Carga confirmada: ${parts.join(' · ')}_\n\n`;
}

// build24hPriceHeader importado de @/lib/utils/holidays

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

    // Rastrear breakdown criado neste request (não usar convDoc que foi lido uma vez)
    let latestBreakdown: any = null;

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

    const routingCfgDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
    const _urgencyPhone: string = (routingCfgDoc as any)?.urgencyPhone ?? '';
    const _assistantName: string = (routingCfgDoc as any)?.assistantName ?? '';
    const URGENCY_NOTE = _urgencyPhone
      ? `_Em caso de urgência, ligue *${_urgencyPhone}*${_assistantName ? ` — ${_assistantName}` : ''}._`
      : '_Em caso de urgência, contacte-nos pelo número que já tem da YourBox._';

    // ── Delay: janela de intervenção do operador antes do bot disparar ────────
    const _delayMin: number = (routingCfgDoc as any)?.delayMinutesBeforeBot ?? 0;
    if (_delayMin > 0) {
      const _convCreatedAt = convDoc.createdAt instanceof Date
        ? convDoc.createdAt
        : new Date((convDoc as any).createdAt ?? 0);
      const _remainingMs = _delayMin * 60000 - (Date.now() - _convCreatedAt.getTime());
      if (_remainingMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, _remainingMs));
        // Re-verificar se o operador assumiu durante a espera
        const _freshConv = await db.collection('conversations').findOne({ _id: oid });
        if (_freshConv && ['LIVE_CHAT', 'ESCALATED_TO_HUMAN'].includes(_freshConv.step)) {
          const _h = (_freshConv.history ?? []) as any[];
          _h.push({ role: 'lead', text: mensagem, timestamp: new Date() });
          await db.collection('conversations').updateOne({ _id: oid }, { $set: { history: _h, updatedAt: new Date() } });
          return Response.json({ success: true, message: null, step: _freshConv.step, historyCount: _h.length, quickReplies: [] });
        }
      }
    }

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
        const escMsg = `Com *${kg} kg* em *${nVol} volume${nVol > 1 ? 's' : ''}*, o peso por volume (${kgPerVol} kg) excede o limite de *${maxVolKgNV} kg/volume* do serviço YourBox.\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db.collection('conversations').updateOne(
          { _id: oid },
          { $set: { step: 'ESCALATED_TO_HUMAN', 'data.nVolumes': nVol, history, escalatedAt: now, updatedAt: now } }
        );
        dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      const dimQ = `Obrigado. ${dimQuestion(nVol)}`;
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

      const kg = (convDoc.data as any).weightKg ?? 1;

      // ── Depósito dinâmico ──────────────────────────────────────────────────
      const depots24 = ((routingDoc as any)?.partnerDepots ?? []) as PartnerDepot[];
      let depotPrice24: number | undefined;
      let depotInfo24: import('@/lib/pricing/priceBreakdownBuilder').DepotInfo | undefined;
      let viaturaNote24 = '';
      let newViatura24: string | null = null;
      if (depots24.length > 0 && convDoc.data.origem) {
        const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depots24, db, (routingDoc as any)?.calcPriceMachine, kg, totalCm || undefined, (routingDoc as any)?.depotDistanceMultiplier ?? 1);
        if (!dr) {
          const escMsg = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
          history.push({ role: 'bot', text: escMsg, timestamp: now });
          await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
          dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
          return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
        }
        depotPrice24 = dr.pickupPrice;
        depotInfo24 = { name: dr.depot.name, distanceKm: dr.distanceKm, distanceMultiplier: dr.distanceMultiplier, effectiveDistanceKm: dr.effectiveDistanceKm, type: dr.type, precedence: dr.precedence, priceKm: dr.priceKm, priceMin: dr.priceMin, LX_PT: dr.LX_PT, GLX_GPT: dr.GLX_GPT };
        if (dr.viaturaOverridden && dr.viaturaRequired) {
          newViatura24 = dr.viaturaRequired;
          viaturaNote24 = `\n\n_Atenção: o peso/volume da carga requer *${dr.viaturaRequired}* — a viatura foi ajustada no cálculo (em vez de ${convDoc.data.viatura ?? 'Moto'})._`;
        }
      }

      const tariffDocs = await db2.collection('partnerTariffs')
        .find({ active: true, zone: 'Nacional' })
        .sort({ sortOrder: 1 })
        .toArray() as unknown as PartnerTariff[];

      // ── Verificar peso máximo da expedição ────────────────────────────────
      const maxExpKg24 = maxExpeditionKg(tariffDocs);
      if (maxExpKg24 > 0 && kg > maxExpKg24) {
        const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKg24} kg* por expedição).\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      // ── Verificar peso por volume e dimensões totais ───────────────────────
      const nVol24 = (convDoc.data as any).nVolumes ?? 1;
      const maxVolKgVal = maxVolumeKg(tariffDocs);
      const maxDimCmVal = maxAllVolumesCm(tariffDocs);

      if (maxVolKgVal > 0 && (kg / nVol24) > maxVolKgVal) {
        const kgPerVol = (kg / nVol24).toFixed(1);
        const escMsg = `Com *${kg} kg* em *${nVol24} volume${nVol24 > 1 ? 's' : ''}*, o peso por volume (${kgPerVol} kg) excede o limite de *${maxVolKgVal} kg/volume* do serviço YourBox.\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }
      if (totalCm > 0 && maxDimCmVal > 0 && totalCm > maxDimCmVal) {
        const escMsg = `As dimensões totais da carga (C+L+A = *${totalCm} cm*) excedem o máximo de *${maxDimCmVal} cm* do serviço YourBox de entrega amanhã.\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
        history.push({ role: 'bot', text: escMsg, timestamp: now });
        await db2.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
        dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
        return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
      }

      const isSaturday = new Date().getDay() === 6;
      const prices = calcAllActiveTariffs(tariffDocs, kg, totalCm, isSaturday, defaultMarkup, depotPrice24);
      const sorted = [...prices].reverse();
      const recommended = sorted[Math.floor(sorted.length / 2)];
      const recommendedTariff = tariffDocs.find((t) => t._id?.toString() === recommended.tariffId);
      const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)} _(IVA 23% incl.)_`).join('\n');
      const dimNote = totalCm === 0
        ? '\n\n_Nota: preço sem suplemento dimensional. Se comprimento + largura + altura > 150cm, o valor final pode ser superior._'
        : '';
      const showLimitsNote24 = nVol24 > 1 || kg > maxVolKgVal;
      const limitsNote24 = showLimitsNote24 && maxVolKgVal > 0
        ? `\n\n_Atenção: máximo *${maxVolKgVal} kg por volume* e *${maxDimCmVal} cm* de C+L+A no total de todos os volumes._`
        : '';
      const { header: hdr24, cutoffNote: cn24 } = build24hPriceHeader(kg);
      const recap24 = cargoRecapLine(nVol24, totalCm === 0 ? 0 : totalCm, kg);
      const botText = `${hdr24}\n\n${recap24}${priceLines}\n\nRecomendamos *${recommended.serviceLabelShort}* a €${recommended.finalPrice.toFixed(2)}.${dimNote}${limitsNote24}${cn24}${viaturaNote24}\n\n${CARGO_DISCLAIMER}\n\nQual janela prefere?`;

      // ── Construir breakdown para auditoria ──
      let priceBreakdown: any;
      if (recommendedTariff) {
        priceBreakdown = buildPartnerServiceBreakdown(
          recommendedTariff,
          kg,
          totalCm,
          recommended,
          depotPrice24,
          (routingDoc as any)?.calcPriceMachine ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI',
          depotInfo24,
        );
        latestBreakdown = priceBreakdown;
      }

      history.push({ role: 'bot', text: botText, timestamp: now });
      const updateSet: Record<string, unknown> = {
        step: 'PRESENTING_PARTNER_PRICE',
        'data.totalCm': totalCm || null,
        'data.partnerFinalPrice': recommended.finalPrice,
        'data.partnerWindow': recommended.deliveryWindow,
        history,
        updatedAt: now,
      };
      if (priceBreakdown) updateSet['data.priceBreakdown'] = priceBreakdown;
      if (newViatura24) updateSet['data.viatura'] = newViatura24;
      await db2.collection('conversations').updateOne(
        { _id: oid },
        { $set: updateSet }
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
        fridayBotText = `O serviço YourBox de entrega ao *sábado* requer análise individual — as entregas garantidas operam apenas em dias úteis.\n\n${contactSuffix}\n\n${URGENCY_NOTE}`;
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
          fridayBotText = `Óptimo, agendamos para *segunda-feira*!\n\n${dimQuestion(nVolumesFri)}`;
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
            let depotInfoFri: import('@/lib/pricing/priceBreakdownBuilder').DepotInfo | undefined;
            let viaturaNoteFri = '';
            let newViaturaFri: string | null = null;
            if (depotsFri.length > 0 && convDoc.data.origem) {
              const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depotsFri, db, (routingDoc as any)?.calcPriceMachine, kg, totalCmKnown || undefined, (routingDoc as any)?.depotDistanceMultiplier ?? 1);
              if (!dr) {
                fridayBotText = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
                fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
                history.push({ role: 'bot', text: fridayBotText!, timestamp: now });
                const fridayFieldsEsc: Record<string, unknown> = { history, step: fridayStep, updatedAt: now, escalatedAt: now };
                await db.collection('conversations').updateOne({ _id: oid }, { $set: fridayFieldsEsc });
                dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
                return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: [], escalate: true });
              }
              depotPriceFri = dr.pickupPrice;
              depotInfoFri = { name: dr.depot.name, distanceKm: dr.distanceKm, distanceMultiplier: dr.distanceMultiplier, effectiveDistanceKm: dr.effectiveDistanceKm, type: dr.type, precedence: dr.precedence, priceKm: dr.priceKm, priceMin: dr.priceMin, LX_PT: dr.LX_PT, GLX_GPT: dr.GLX_GPT };
              if (dr.viaturaOverridden && dr.viaturaRequired) {
                newViaturaFri = dr.viaturaRequired;
                viaturaNoteFri = `\n\n_Atenção: o peso/volume da carga requer *${dr.viaturaRequired}* — a viatura foi ajustada no cálculo (em vez de ${convDoc.data.viatura ?? 'Moto'})._`;
              }
            }

            const tariffDocs = await db.collection('partnerTariffs')
              .find({ active: true, zone: 'Nacional' }).sort({ sortOrder: 1 }).toArray() as unknown as PartnerTariff[];

            // ── Verificar peso máximo da expedição ────────────────────────
            const maxExpKgFri = maxExpeditionKg(tariffDocs);
            if (maxExpKgFri > 0 && kg > maxExpKgFri) {
              fridayBotText = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgFri} kg* por expedição).\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
              fridayStep = 'ESCALATED_TO_HUMAN'; fridayEscalate = true;
              history.push({ role: 'bot', text: fridayBotText!, timestamp: now });
              const fridayFieldsEsc2: Record<string, unknown> = { history, step: fridayStep, updatedAt: now, escalatedAt: now };
              await db.collection('conversations').updateOne({ _id: oid }, { $set: fridayFieldsEsc2 });
              dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
              return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: [], escalate: true });
            }

            const prices = calcAllActiveTariffs(tariffDocs, kg, totalCmKnown, false, defaultMarkup, depotPriceFri);
            if (prices.length > 0) {
              const sorted = [...prices].reverse();
              const rec = sorted[Math.floor(sorted.length / 2)];
              const recTariff = tariffDocs.find((t) => t._id?.toString() === rec.tariffId);
              const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)} _(IVA 23% incl.)_`).join('\n');
              const nVolFri = (convDoc.data as any).nVolumes ?? 1;
              const maxVolKgFriVal = maxVolumeKg(tariffDocs);
              const maxDimCmFriVal = maxAllVolumesCm(tariffDocs);
              const showLimitsNoteFri = nVolFri > 1 || kg > maxVolKgFriVal;
              const limitsNoteFri = showLimitsNoteFri && maxVolKgFriVal > 0
                ? `\n\n_Atenção: máximo *${maxVolKgFriVal} kg por volume* e *${maxDimCmFriVal} cm* de C+L+A no total de todos os volumes._`
                : '';
              const { cutoffNote: cnFri } = build24hPriceHeader(kg);
              const totalCmFri = (convDoc.data as any).totalCm ?? 0;
              const recapFri = cargoRecapLine(nVolFri, totalCmFri, kg);
              fridayBotText = `*Entrega YourBox — ${kg} kg* (segunda-feira)\n\n${recapFri}${priceLines}\n\nRecomendamos *${rec.serviceLabelShort}* a €${rec.finalPrice.toFixed(2)}.${limitsNoteFri}${cnFri}${viaturaNoteFri}\n\n${CARGO_DISCLAIMER}\n\nQual janela prefere?`;
              fridayQuickReplies.push(...sorted.map((p) => `${p.serviceLabelShort} €${p.finalPrice.toFixed(2)}`), 'Cancelar');

              let priceBreakdownFri: any;
              if (recTariff) {
                priceBreakdownFri = buildPartnerServiceBreakdown(
                  recTariff,
                  kg,
                  totalCmFri,
                  rec,
                  depotPriceFri,
                  (routingDoc as any)?.calcPriceMachine ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI',
                  depotInfoFri,
                );
                latestBreakdown = priceBreakdownFri;
              }

              const updateSetFri: Record<string, unknown> = {
                step: 'PRESENTING_PARTNER_PRICE',
                'data.serviceType': 'arrasto',
                'data.weightKg': kg,
                'data.partnerFinalPrice': rec.finalPrice,
                'data.partnerWindow': rec.deliveryWindow,
                updatedAt: now,
              };
              if (priceBreakdownFri) updateSetFri['data.priceBreakdown'] = priceBreakdownFri;
              if (newViaturaFri) updateSetFri['data.viatura'] = newViaturaFri;
              await db.collection('conversations').updateOne(
                { _id: oid },
                { $set: updateSetFri }
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
      if (fridayEscalate) dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
      return Response.json({ success: true, message: fridayBotText!, step: fridayStep, quickReplies: fridayQuickReplies, escalate: fridayEscalate });
    }

    // Adicionar mensagem do utilizador ao histórico
    const history = convDoc.history ?? [];
    history.push({ role: 'lead', text: mensagem, timestamp: now });

    // ── Bypass LLM: se peso pré-preenchido do form e lead quer serviço amanhã ─
    const _msgLower = mensagem.toLowerCase().trim();
    const _preFilledKg: number | undefined = (convDoc.data as any).weightKg;
    const _inPriceStep = ['PRESENTING_PRICE', 'HANDLING_OBJECTION', 'PRESENTING_PARTNER_PRICE'].includes(convDoc.step);
    const _isAmanhaSwitch =
      _preFilledKg && _preFilledKg > 0 &&
      (
        // A partir de PRESENTING_PRICE / HANDLING_OBJECTION: switch para 24h
        (_inPriceStep && (
          _msgLower.includes('entrega amanhã') ||
          _msgLower === 'amanhã' ||
          /\b24\s*h(oras?)?\b/i.test(mensagem) ||
          /recalcul|refazer.*calc|calcul.*amanhã|calcul.*24/i.test(mensagem)
        )) ||
        // Em COLLECTING_WEIGHT: peso já conhecido, qualquer confirmação dispara cálculo
        (convDoc.step === 'COLLECTING_WEIGHT' && /^(sim|ok|okay|confirmar?|s|m|p|certo|correto|exato)$/i.test(_msgLower))
      );

    // Chamar LLM
    const result = _isAmanhaSwitch
      ? ({ type: 'calculate_tomorrow', weightKg: _preFilledKg, text: '' } as any)
      : await getLlmResponse(convDoc.data, history, mensagem);

    let botText = result.text;
    let nextStep: string = convDoc.step;
    let escalate = false;
    let leadRegistered = false;
    let leadInsertedId: string | undefined;
    const extraDataUpdate: Record<string, unknown> = {};
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

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
      // Refetch convDoc para ter breakdown que possa ter sido criado num request anterior
      const freshConvDoc = await db.collection('conversations').findOne({ _id: oid });
      const convDocToUse = freshConvDoc || convDoc;

      const isEscalatedCase = !!(convDocToUse.data as any).isEscalatedCase;
      nextStep = isEscalatedCase ? 'ESCALATED_TO_HUMAN' : 'LEAD_REGISTERED';
      leadRegistered = true;
      const nome = result.nome;
      const telefone = result.telefone;
      const email = result.email;
      const isArrasto = convDocToUse.data.serviceType === 'arrasto';
      const finalPrice = isArrasto ? convDocToUse.data.partnerFinalPrice : convDocToUse.data.priceWithDiscount;
      const timeStamp = now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
      const serviceInfo = isArrasto
        ? `<p><b>Serviço:</b> Entrega Amanhã ${convDocToUse.data.partnerWindow ?? ''} | <b>Peso:</b> ${convDocToUse.data.weightKg ?? '?'}kg</p>`
        : `<p><b>Viatura:</b> ${convDocToUse.data.viatura} | <b>Urgência:</b> ${convDocToUse.data.urgencia}</p>`;
      const notasHtml = result.notas ? `<p><b>Notas:</b> ${result.notas}</p>` : '';
      const origemHtml = result.origemCompleta ? `<p><b>Recolha:</b> ${result.origemCompleta}</p>` : '';
      const destinoHtml = result.destinoCompleta ? `<p><b>Entrega:</b> ${result.destinoCompleta}</p>` : '';
      const contactoRecolhaHtml = result.contactoRecolha ? `<p><b>Contacto recolha:</b> ${result.contactoRecolha}</p>` : '';
      const contactoEntregaHtml = result.contactoEntrega ? `<p><b>Contacto entrega:</b> ${result.contactoEntrega}</p>` : '';
      const volumesHtml = result.volumes ? `<p><b>Volumes:</b> ${result.volumes}</p>` : '';
      const canalLabel = isEscalatedCase ? 'WEB CHAT FORA DE HORÁRIO' : 'WEB CHAT BOT LLM';

      const leadDataToInsert = {
        origem: convDocToUse.data.origem, destino: convDocToUse.data.destino,
        urgencia: convDocToUse.data.urgencia, serviceType: convDocToUse.data.serviceType,
        viatura: convDocToUse.data.viatura, weightKg: convDocToUse.data.weightKg,
        partnerWindow: convDocToUse.data.partnerWindow,
        priceWithDiscount: convDocToUse.data.priceWithDiscount,
        partnerFinalPrice: convDocToUse.data.partnerFinalPrice,
        nome, email, telefone,
        notas: result.notas,
        origemCompleta: result.origemCompleta,
        destinoCompleta: result.destinoCompleta,
        contactoRecolha: result.contactoRecolha,
        contactoEntrega: result.contactoEntrega,
        volumes: result.volumes,
        timeStamp: now, converted: true,
        source: isEscalatedCase ? 'web_chat_escalated' : 'web_chat',
        ...(latestBreakdown || convDocToUse.data.priceBreakdown) && { priceBreakdown: latestBreakdown || convDocToUse.data.priceBreakdown },
      };

      const _leadInsert = await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div style="line-height:1.4;"><p><b>LEAD BOT WEB</b> <small>(${timeStamp})</small></p><p>${convDoc.data.origem} → ${convDoc.data.destino}</p>${serviceInfo}<p><b>Nome:</b> ${nome}</p><p><b>Telefone:</b> ${telefone}</p>${email ? `<p><b>Email:</b> ${email}</p>` : ''}${volumesHtml}${origemHtml}${contactoRecolhaHtml}${destinoHtml}${contactoEntregaHtml}${notasHtml}${!isEscalatedCase ? `<p><b>Preço Final:</b> €${finalPrice?.toFixed(2) ?? '?'}</p>` : ''}<p style="color:${isEscalatedCase ? 'orange' : 'green'};"><b>CONTACTAR [canal: ${canalLabel}]</b></p></div>`,
        companyProvider: 'Yourbox', senderName: 'Bot Agent Web', variante: 'BOT',
        timeStamp: now, closed: false, closedAt: null, reply: [],
        leadData: leadDataToInsert,
      });
      leadInsertedId = _leadInsert.insertedId.toString();

      // Atualizar conversa com leadId
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: nextStep, leadId: leadInsertedId, 'data.nome': nome, 'data.telefone': telefone, 'data.email': email ?? null, updatedAt: now } }
      );

    } else if (result.type === 'signal_off_topic') {
      const newStreak = (convDoc.data.offTopicStreak ?? 0) + 1;
      extraDataUpdate['data.offTopicStreak'] = newStreak;
      if (newStreak >= 3) {
        nextStep = 'CLOSED';
        botText = 'Este chat é dedicado a pedidos de transporte. Se precisar de ajuda com um envio, estamos à disposição.';
        extraDataUpdate['data.closedForOffTopic'] = true;
        extraDataUpdate['data.abuseIp'] = clientIp;
      } else {
        botText = result.redirectMessage;
      }

    } else if (result.type === 'close') {
      nextStep = 'CLOSED';
      extraDataUpdate['data.abuseIp'] = clientIp;
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
          const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgTmr} kg* por expedição).\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
          history.push({ role: 'bot', text: escMsg, timestamp: now });
          await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', 'data.weightKg': kg, history, escalatedAt: now, updatedAt: now } });
          dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
          return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
        }
      }

      // ── 6ª feira: confirmar sábado vs segunda (não activa em feriado) ────────
      const lisbonNow6 = getLisbonNow();
      if (lisbonNow6.getDay() === 5 && !isPortugueseHoliday(lisbonNow6)) {
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
        botText = `Obrigado. ${dimQuestion(nVolumesTmr)}`;
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
          let depotInfoTmr: import('@/lib/pricing/priceBreakdownBuilder').DepotInfo | undefined;
          let viaturaNoteTmr = '';
          let newViaturaТmr: string | null = null;
          if (depotsTmr.length > 0 && convDoc.data.origem) {
            const dr = await calcDepotPickupPrice(convDoc.data.origem, convDoc.data.viatura ?? 'Furgão Classe 1', convDoc.data.urgencia ?? '4 Horas', depotsTmr, db, (routingDoc as any)?.calcPriceMachine, kg, totalCmKnown || undefined, (routingDoc as any)?.depotDistanceMultiplier ?? 1);
            if (!dr) {
              const escMsg = `${DEPOT_OUT_OF_RANGE_MSG}\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
              history.push({ role: 'bot', text: escMsg, timestamp: now });
              await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
              dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
              return Response.json({ success: true, message: escMsg, step: 'ESCALATED_TO_HUMAN', quickReplies: [], escalate: true });
            }
            depotPriceTmr = dr.pickupPrice;
            depotInfoTmr = { name: dr.depot.name, distanceKm: dr.distanceKm, distanceMultiplier: dr.distanceMultiplier, effectiveDistanceKm: dr.effectiveDistanceKm, type: dr.type, precedence: dr.precedence, priceKm: dr.priceKm, priceMin: dr.priceMin, LX_PT: dr.LX_PT, GLX_GPT: dr.GLX_GPT };
            if (dr.viaturaOverridden && dr.viaturaRequired) {
              newViaturaТmr = dr.viaturaRequired;
              viaturaNoteTmr = `\n\n_Atenção: o peso/volume da carga requer *${dr.viaturaRequired}* — a viatura foi ajustada no cálculo (em vez de ${convDoc.data.viatura ?? 'Moto'})._`;
            }
          }

          const tariffDocs = await db.collection('partnerTariffs')
            .find({ active: true, zone: 'Nacional' })
            .sort({ sortOrder: 1 })
            .toArray() as unknown as PartnerTariff[];

          // ── Verificar peso máximo da expedição ──────────────────────────
          const maxExpKgTmr2 = maxExpeditionKg(tariffDocs);
          if (maxExpKgTmr2 > 0 && kg > maxExpKgTmr2) {
            const escMsg = `Com *${kg} kg*, a carga excede a capacidade máxima do serviço YourBox de entrega amanhã (máximo *${maxExpKgTmr2} kg* por expedição).\n\n${businessHoursContact()}\n\n${URGENCY_NOTE}`;
            history.push({ role: 'bot', text: escMsg, timestamp: now });
            await db.collection('conversations').updateOne({ _id: oid }, { $set: { step: 'ESCALATED_TO_HUMAN', history, escalatedAt: now, updatedAt: now } });
            dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
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
            const recapTmr = cargoRecapLine(nVolTmr, totalCmKnown, kg);
            botText = `${hdrTmr}\n\n${recapTmr}${priceLines}\n\nRecomendamos *${recommended.serviceLabelShort}* a €${recommended.finalPrice.toFixed(2)}.${limitsNoteTmr}${cnTmr}${viaturaNoteTmr}\n\n${CARGO_DISCLAIMER}\n\nQual janela prefere?`;

            // Usar recommended directamente — já tem toda a info de preço calculada
            const priceBreakdownTmr = buildPartnerServiceBreakdown(
              { partner: recommended.serviceLabelShort, _id: recommended.tariffId } as any,
              kg,
              totalCmKnown,
              recommended,
              depotPriceTmr,
              (routingDoc as any)?.calcPriceMachine ?? process.env.CALC_PRICE_MACHINE ?? 'calculator_1_FixCityPriceAPI',
              depotInfoTmr,
            );
            latestBreakdown = priceBreakdownTmr;

            const updateSetTmr: Record<string, unknown> = {
              step: 'PRESENTING_PARTNER_PRICE',
              'data.serviceType': 'arrasto',
              'data.weightKg': kg,
              'data.partnerFinalPrice': recommended.finalPrice,
              'data.partnerWindow': recommended.deliveryWindow,
              updatedAt: now,
            };
            if (priceBreakdownTmr) updateSetTmr['data.priceBreakdown'] = priceBreakdownTmr;
            if (newViaturaТmr) updateSetTmr['data.viatura'] = newViaturaТmr;
            await db.collection('conversations').updateOne(
              { _id: oid },
              { $set: updateSetTmr }
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
      ...extraDataUpdate,
    };
    if (!leadRegistered) updateFields.step = nextStep;
    if (escalate) updateFields.escalatedAt = now;

    await db.collection('conversations').updateOne({ _id: oid }, { $set: updateFields });

    if (escalate && nextStep === 'ESCALATED_TO_HUMAN') {
      dispatchNotification('escalation', { convId: oid.toString(), nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, lastMsg: mensagem });
    } else if (leadRegistered && nextStep === 'LEAD_REGISTERED') {
      const isArrasto = convDoc.data?.serviceType === 'arrasto';
      dispatchNotification('lead', { convId: oid.toString(), leadId: leadInsertedId, nome: convDoc.data?.nome, telemovel: convDoc.data?.telefone ?? convDoc.data?.telemovel, origem: convDoc.data?.origem, destino: convDoc.data?.destino, price: isArrasto ? convDoc.data?.partnerFinalPrice : convDoc.data?.priceWithDiscount });
    }

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
