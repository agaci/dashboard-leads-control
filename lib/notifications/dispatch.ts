import { sendWhatsAppMessage } from '@/lib/whatsapp/evolution';
import { sendEscalationEmail, sendLeadEmail } from '@/lib/email/resend';
import { getDb } from '@/lib/mongodb';

export type NotificationEvent = 'escalation' | 'lead';

export interface NotificationPayload {
  convId:     string;
  nome?:      string;
  telemovel?: string;
  origem?:    string;
  destino?:   string;
  lastMsg?:   string;
  price?:     number;
}

export function dispatchNotification(event: NotificationEvent, payload: NotificationPayload): void {
  _dispatch(event, payload).catch((err) => console.error('[dispatchNotification]', err));
}

async function _dispatch(event: NotificationEvent, payload: NotificationPayload): Promise<void> {
  const db  = await getDb();
  const cfg = await db.collection('routingConfig').findOne({ _id: 'yourbox_main' as any });
  const targets: any[] = (cfg as any)?.notificationTargets ?? [];
  const relevant = targets.filter(
    (t: any) => t.phone?.trim() || t.email?.trim()
      ? Array.isArray(t.events) && t.events.includes(event)
      : false
  );
  if (relevant.length === 0) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://leads.comgo.pt').replace(/\/$/, '');
  const ref    = '#' + payload.convId.slice(-5).toUpperCase();
  const nome   = payload.nome ?? payload.telemovel ?? '—';
  const rota   = payload.origem
    ? `${payload.origem.split(',')[0].trim()} → ${(payload.destino ?? '...').split(',')[0].trim()}`
    : null;

  const waLines = [
    event === 'escalation' ? '*Conversa escalada para humano*' : '*Nova lead registada*',
    `Ref: *${ref}*`,
    `Lead: *${nome}*`,
    ...(payload.telemovel ? [`Tel: ${payload.telemovel}`] : []),
    ...(rota ? [`Rota: ${rota}`] : []),
    ...(event === 'escalation' && payload.lastMsg
      ? [`Última msg: _"${payload.lastMsg.slice(0, 100)}"_`]
      : []),
    ...(event === 'lead' && payload.price != null
      ? [`Preço: *€${payload.price.toFixed(2)}*`]
      : []),
    `${appUrl}/dashboard`,
  ];
  const waText = waLines.join('\n');

  for (const target of relevant) {
    if (target.phone?.trim()) {
      sendWhatsAppMessage(target.phone.trim(), waText).catch(() => {});
    }
    if (target.email?.trim()) {
      if (event === 'escalation') {
        sendEscalationEmail({
          convId:      payload.convId,
          telemovel:   payload.telemovel ?? '',
          nome:        payload.nome,
          origem:      payload.origem,
          destino:     payload.destino,
          lastMsg:     payload.lastMsg,
          toOverride:  [target.email.trim()],
        }).catch(() => {});
      } else {
        sendLeadEmail({
          convId:     payload.convId,
          telemovel:  payload.telemovel ?? '',
          nome:       payload.nome,
          origem:     payload.origem,
          destino:    payload.destino,
          price:      payload.price,
          toOverride: [target.email.trim()],
        }).catch(() => {});
      }
    }
  }
}
