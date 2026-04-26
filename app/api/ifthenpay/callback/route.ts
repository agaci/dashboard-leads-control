import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { registerLead } from '@/lib/agent/registerLead';

// Ifthenpay chama este endpoint via GET quando um pagamento MB Way é confirmado.
// URL a registar na Ifthenpay (via suporte):
//   https://leads.comgo.pt/api/ifthenpay/callback
//     ?chave=[ANTI_PHISHING_KEY]
//     &referencia=[REFERENCIA]
//     &idpedido=[ID_TRANSACAO]
//     &valor=[VALOR]
//     &datahorapag=[DATA]
//     &estado=[ESTADO]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chave    = searchParams.get('chave');
  const idpedido = searchParams.get('idpedido');   // RequestId do initPayment
  const estado   = searchParams.get('estado');

  // Validar anti-phishing key — retornar 401 para chave inválida (Ifthenpay retenta)
  const expectedKey = process.env.MBWAY_ANTI_PHISHING_KEY;
  if (!expectedKey || chave !== expectedKey) {
    console.error('Callback Ifthenpay: chave anti-phishing inválida');
    return new Response('Unauthorized', { status: 401 });
  }

  // Só processar pagamentos confirmados
  if (estado !== 'PAGO') {
    console.log(`Callback Ifthenpay: estado=${estado} idpedido=${idpedido}`);
    return new Response('OK', { status: 200 });
  }

  try {
    // O orderId que passámos ao initPayment é o telemovel
    // Precisamos de encontrar a conversa pelo ifthenpayRequestId
    const db = await getDb();
    const convDoc = await db.collection('conversations').findOne({
      'data.ifthenpayRequestId': idpedido,
      step: 'AWAITING_PAYMENT',
    });

    if (convDoc) {
      const { getConversation: getConv } = await import('@/lib/agent/conversationState');
      const conv = await getConv(convDoc.telemovel);
      if (conv && conv.step === 'AWAITING_PAYMENT') {
        await registerLead(db, conv.telemovel, conv);
      }
    }
  } catch (err: any) {
    console.error('Ifthenpay callback error:', err.message);
    // Retornar 200 mesmo em erro interno — evitar retentativas desnecessárias
  }

  return new Response('OK', { status: 200 });
}
