import type { Db } from 'mongodb';
import type { Conversation } from '@/types/agent';
import { closeConversation } from './conversationState';
import { buildLeadRegisteredMessage } from './botResponder';
import { formatEndereco, formatContacto } from './addressParser';

export async function registerLead(
  db: Db,
  telemovel: string,
  conv: Conversation,
): Promise<{ leadId: string; responseText: string }> {
  const nome = conv.data.nome ?? 'Lead Bot';
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

  const pagamentoHtml = conv.data.stripePaymentIntentId
    ? `<p><b>Pagamento:</b> MBWAY ✓ (${conv.data.stripePaymentIntentId})</p>`
    : '';

  const leadResult = await db.collection('messages').insertOne({
    company: 'Yourbox',
    messageType: 'newLead',
    to: 'admin',
    toPrivate: null,
    presentationMessage: 'stick',
    deletedAfter: 0,
    message: `<div style="line-height:1.4;"><p><b>LEAD BOT</b> <small>(${timeStamp})</small></p><p>${telemovel}</p><p>${nome}</p>${conv.data.email ? `<p>${conv.data.email}</p>` : ''}<p>${conv.data.origem} → ${conv.data.destino}</p>${serviceInfo}${moradaRecolhaHtml}${moradaEntregaHtml}${pagamentoHtml}<p><b>Preco Final:</b> €${finalPrice?.toFixed(2)}</p><p style="color:green;"><b>CONTACTAR AGORA [canal: BOT]</b></p></div>`,
    companyProvider: 'Yourbox',
    senderName: 'Bot Agent',
    variante: 'BOT',
    timeStamp: new Date(),
    closed: false,
    closedAt: null,
    reply: [],
    leadData: {
      origem: conv.data.origem,
      destino: conv.data.destino,
      urgencia: conv.data.urgencia,
      serviceType: conv.data.serviceType,
      viatura: conv.data.viatura,
      weightKg: conv.data.weightKg,
      partnerWindow: conv.data.partnerWindow,
      priceCalculated: conv.data.priceCalculated,
      priceWithDiscount: conv.data.priceWithDiscount,
      discount: conv.data.discount,
      distance: conv.data.distance,
      partnerFinalPrice: conv.data.partnerFinalPrice,
      nome,
      email: conv.data.email,
      telefone: telemovel,
      origemCompleta: conv.data.origemCompleta,
      destinoCompleta: conv.data.destinoCompleta,
      contactoRecolha: conv.data.contactoRecolha,
      contactoEntrega: conv.data.contactoEntrega,
      stripePaymentIntentId: conv.data.stripePaymentIntentId,
      timeStamp: new Date(),
      converted: true,
      convertedAt: new Date(),
      source: 'bot',
    },
  });

  const leadId = leadResult.insertedId.toString();
  await closeConversation(telemovel, leadId);

  const { text } = buildLeadRegisteredMessage(nome, finalPrice);
  return { leadId, responseText: text };
}
