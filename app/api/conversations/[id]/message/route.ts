import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getLlmResponse } from '@/lib/agent/llmResponder';
import { calcAllActiveTariffs } from '@/lib/agent/partnerPricing';
import { fixCityPrice } from '@/lib/pricing/fixCityPrice';
import { calculatePrice } from '@/lib/pricing/calculatePrice';
import { defaultRoutingConfig } from '@/lib/routing/decideMode';
import type { PartnerTariff } from '@/types/partner';

function toOid(id: string) {
  try { return new ObjectId(id); } catch { return null; }
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
        quickReplies: [],
      });
    }

    const mensagem = text.trim();
    const now = new Date();

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
      // Inserir lead de escalamento
      await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin',
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div><p><b>ESCALAMENTO WEB BOT</b></p><p>${convDoc.data.origem ?? '?'} → ${convDoc.data.destino ?? '?'}</p><p>Motivo: ${result.reason}</p></div>`,
        companyProvider: 'Yourbox', senderName: 'Bot Web — Escalamento', variante: 'BOT',
        timeStamp: now, closed: false, reply: [],
        leadData: { ...convDoc.data, converted: false, source: 'web_chat_escalation' },
      });

    } else if (result.type === 'register_lead') {
      nextStep = 'LEAD_REGISTERED';
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

      await db.collection('messages').insertOne({
        company: 'Yourbox', messageType: 'newLead', to: 'admin', toPrivate: null,
        presentationMessage: 'stick', deletedAfter: 0,
        message: `<div style="line-height:1.4;"><p><b>LEAD BOT WEB</b> <small>(${timeStamp})</small></p><p>${convDoc.data.origem} → ${convDoc.data.destino}</p>${serviceInfo}<p><b>Nome:</b> ${nome}</p><p><b>Telefone:</b> ${telefone}</p>${email ? `<p><b>Email:</b> ${email}</p>` : ''}${volumesHtml}${origemHtml}${contactoRecolhaHtml}${destinoHtml}${contactoEntregaHtml}${notasHtml}<p><b>Preço Final:</b> €${finalPrice?.toFixed(2) ?? '?'}</p><p style="color:green;"><b>CONTACTAR [canal: WEB CHAT BOT LLM]</b></p></div>`,
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
          timeStamp: now, converted: true, source: 'web_chat',
        },
      });

      // Atualizar conversa como fechada
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: 'LEAD_REGISTERED', 'data.nome': nome, 'data.telefone': telefone, 'data.email': email ?? null, updatedAt: now } }
      );

    } else if (result.type === 'close') {
      nextStep = 'CLOSED';
      await db.collection('conversations').updateOne(
        { _id: oid },
        { $set: { step: 'CLOSED', updatedAt: now } }
      );

    } else if (result.type === 'calculate_tomorrow') {
      // LLM pediu cálculo de entrega amanhã
      nextStep = 'PRESENTING_PARTNER_PRICE';
      try {
        const routingDoc = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
        const defaultMarkup = (routingDoc as any)?.defaultMarkup ?? defaultRoutingConfig.defaultMarkup;
        const tariffDocs = await db.collection('partnerTariffs')
          .find({ active: true, zone: 'Nacional' })
          .sort({ sortOrder: 1 })
          .toArray() as unknown as PartnerTariff[];

        const kg = result.weightKg ?? convDoc.data.weightKg ?? 1;
        const isSaturday = new Date().getDay() === 6;
        const prices = calcAllActiveTariffs(tariffDocs, kg, 0, isSaturday, defaultMarkup);

        if (prices.length > 0) {
          // Apresentar da mais cara (10h) para a mais barata (19h); recomendar a do meio (13h)
          const sorted = [...prices].reverse();
          const recommended = sorted[Math.floor(sorted.length / 2)];
          const priceLines = sorted.map((p) => `*${p.serviceLabelShort}* — €${p.finalPrice.toFixed(2)}`).join('\n');
          // Preços são sempre apresentados — o texto do LLM é substituído
          botText = `*Entrega YourBox Amanhã — ${kg} kg*\n\n${priceLines}\n\nRecomendamos *${recommended.serviceLabelShort}* a €${recommended.finalPrice.toFixed(2)}.\n\nQual janela prefere?`;
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

    // ── Guardar mensagem do bot no histórico ─────────────────────────────────
    history.push({ role: 'bot', text: botText, timestamp: now });

    const updateFields: Record<string, unknown> = {
      history,
      updatedAt: now,
    };
    if (!leadRegistered) updateFields.step = nextStep;

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
