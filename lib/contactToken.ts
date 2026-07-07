import { createHmac } from 'crypto';

// Token curto (HMAC) que assina o id da conversa, para validar o clique no CTA do
// email/WhatsApp sem guardar nada. Usado por lib do cron e pelo endpoint.
export function contactToken(convId: string): string {
  const secret = process.env.CONTACT_SECRET || process.env.CRON_SECRET || 'yb_contact_fallback';
  return createHmac('sha256', secret).update(String(convId)).digest('hex').slice(0, 16);
}
