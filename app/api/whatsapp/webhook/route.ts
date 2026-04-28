import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, isWhatsAppBotAtivo } from '@/lib/whatsapp/evolution';

// Verifica se a mensagem vem do próprio bot (evitar loop)
function isFromBot(data: any, botNumber: string): boolean {
  const from: string = data?.data?.key?.remoteJid ?? '';
  const fromMe: boolean = data?.data?.key?.fromMe ?? false;
  if (fromMe) return true;
  const fromDigits = from.replace(/\D/g, '').replace(/^55/, ''); // limpar JID whatsapp
  const botDigits = botNumber.replace(/\D/g, '');
  return fromDigits === botDigits;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Evolution API envia vários tipos de evento — só nos interessa MESSAGES_UPSERT
    const event: string = body?.event ?? body?.type ?? '';
    if (!event.includes('MESSAGES') && !event.includes('messages')) {
      return NextResponse.json({ ok: true });
    }

    const msgData = body?.data;
    if (!msgData) return NextResponse.json({ ok: true });

    // Ignorar mensagens enviadas pelo próprio bot
    const fromMe: boolean = msgData?.key?.fromMe ?? false;
    if (fromMe) return NextResponse.json({ ok: true });

    // Ignorar mensagens de grupo
    const remoteJid: string = msgData?.key?.remoteJid ?? '';
    if (remoteJid.includes('@g.us')) return NextResponse.json({ ok: true });

    // Extrair número e texto
    const telefone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const mensagem: string =
      msgData?.message?.conversation ??
      msgData?.message?.extendedTextMessage?.text ??
      msgData?.message?.imageMessage?.caption ??
      '';

    if (!telefone || !mensagem.trim()) return NextResponse.json({ ok: true });

    // Verificar se bot WhatsApp está activo
    const botAtivo = await isWhatsAppBotAtivo();
    if (!botAtivo) return NextResponse.json({ ok: true });

    // Chamar o agente existente
    const agentRes = await fetch(
      `${process.env.NEXTAUTH_URL ?? 'http://yourbox-leads:3006'}/api/agent/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemovel: telefone,
          mensagem:  mensagem.trim(),
          canal:     'whatsapp',
        }),
      }
    );

    if (!agentRes.ok) return NextResponse.json({ ok: true });

    const agentData = await agentRes.json();
    const resposta: string = agentData?.response ?? agentData?.message ?? '';

    if (resposta) {
      await sendWhatsAppMessage(telefone, resposta);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[WA Webhook]', err);
    return NextResponse.json({ ok: true }); // sempre 200 para a Evolution não retentar
  }
}

// A Evolution API faz GET para verificar o endpoint
export async function GET() {
  return NextResponse.json({ status: 'YourBox WhatsApp webhook activo' });
}
