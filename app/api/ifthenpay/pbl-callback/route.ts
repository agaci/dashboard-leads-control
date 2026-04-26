import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { registerLead } from '@/lib/agent/registerLead';

// Ifthenpay chama este endpoint via GET quando um pagamento Pay By Link é confirmado.
// URL a registar na Ifthenpay (via suporte):
//   https://leads.comgo.pt/api/ifthenpay/pbl-callback
//     ?key=[ANTI_PHISHING_KEY]
//     &id=[ORDER_ID]
//     &amount=[AMOUNT]
//     &payment_datetime=[DATETIME]
//     &payment_method=[METHOD]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key            = searchParams.get('key');
  const id             = searchParams.get('id');             // orderId = phoneToOrderId(telemovel)
  const payment_method = searchParams.get('payment_method'); // MBWAY, MB, CCARD, etc.

  // Validar anti-phishing key
  const expectedKey = process.env.PBL_ANTI_PHISHING_KEY;
  if (!expectedKey || key !== expectedKey) {
    console.error('PBL callback: chave anti-phishing inválida');
    return new Response('Unauthorized', { status: 401 });
  }

  if (!id) return new Response('Missing id', { status: 400 });

  try {
    const db = await getDb();

    // Encontrar conversa pelo pblOrderId
    const convDoc = await db.collection('conversations').findOne({
      'data.pblOrderId': id,
      step: 'AWAITING_PAYMENT',
    });

    if (convDoc) {
      const { getConversation } = await import('@/lib/agent/conversationState');
      const conv = await getConversation(convDoc.telemovel);
      if (conv && conv.step === 'AWAITING_PAYMENT') {
        await registerLead(db, conv.telemovel, conv);
        console.log(`PBL pago: orderId=${id} método=${payment_method} telemovel=${conv.telemovel}`);
      }
    }
  } catch (err: any) {
    console.error('PBL callback error:', err.message);
    // Retornar 200 mesmo em erro — evitar retentativas
  }

  return new Response('OK', { status: 200 });
}
