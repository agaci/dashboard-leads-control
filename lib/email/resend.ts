import { Resend } from 'resend';

const FROM    = process.env.ALERT_FROM_EMAIL ?? 'YourBox <noreply@yourbox.com.pt>';
const TO      = (process.env.ALERT_EMAIL ?? '').split(',').map(e => e.trim()).filter(Boolean);
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://leads.yourbox.com.pt').replace(/\/$/, '');

// Email de reengajamento — enviado AO VISITANTE que comecou o quiz e nao concluiu.
export async function sendQuizNudgeEmail(opts: {
  to:     string;
  nome:   string;
  rota:   string;   // "origem -> destino" ou "o seu envio"
  texto:  string;   // corpo ja com tokens preenchidos
  ctaUrl?: string;  // link "Contactem-me" que regista o pedido no inbox
}) {
  if (!process.env.RESEND_API_KEY || !opts.to) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);

  // CTA principal: pedir que a YourBox contacte (regista o pedido no inbox).
  // Fallback (sem ctaUrl): mantem o telefone clicavel.
  const cta = opts.ctaUrl
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:#bed62f;color:#1a2332;font-weight:700;padding:12px 26px;border-radius:8px;text-decoration:none;font-size:14px">
        Sim, contactem-me
      </a>
      <p style="margin:10px 0 0;font-size:12px;color:#888">ou ligue <a href="tel:+351214304546" style="color:#1a2332;font-weight:700;text-decoration:none">214 304 546</a></p>`
    : `<a href="tel:+351214304546" style="display:inline-block;background:#bed62f;color:#1a2332;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px">
        214 304 546
      </a>`;

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1a2332;padding:18px 24px">
    <span style="color:#fff;font-weight:700;font-size:16px">YourBox</span>
  </div>
  <div style="padding:24px;color:#333;font-size:14px;line-height:1.6">
    <p>${opts.texto.replace(/\n/g, '<br/>')}</p>
    <div style="margin-top:20px">
      ${cta}
    </div>
  </div>
  <div style="background:#f9fafb;padding:14px 24px;font-size:11px;color:#999;line-height:1.5;border-top:1px solid #eef0f3">
    <strong style="color:#777">YourBox &ndash; estafetas e transportes</strong><br/>
    <strong style="color:#777">Este é um contacto único &mdash; não lhe enviaremos mais nenhuma mensagem deste género.</strong><br/>
    Usamos os seus dados <strong>apenas</strong> para tratar o seu pedido de orçamento e contactá-lo. Não são vendidos nem
    partilhados com terceiros para fins de marketing. Para <strong>aceder, corrigir ou apagar</strong> os seus dados, basta
    responder a este email ou contactar-nos &mdash; ver a
    <a href="https://yourbox.com.pt/politica_de_privacidade.html" style="color:#999">Política de Privacidade</a>.
  </div>
</div>`;

  const r = await resend.emails.send({
    from:    FROM,
    to:      [opts.to],
    subject: `${opts.nome}, continuamos o seu orçamento?`,
    html,
  }).catch(err => { console.error('[Resend] falha no email de reengajamento:', err); return null; });
  return !!r;
}

export async function sendEscalationEmail(opts: {
  convId:      string;
  telemovel:   string;
  nome?:       string;
  origem?:     string;
  destino?:    string;
  lastMsg?:    string;
  toOverride?: string[];
}) {
  const recipients = opts.toOverride ?? TO;
  if (!process.env.RESEND_API_KEY || recipients.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const ref  = '#' + opts.convId.slice(-5).toUpperCase();
  const nome = opts.nome ?? opts.telemovel;
  const rota = opts.origem ? `${opts.origem.split(',')[0]} → ${(opts.destino ?? '...').split(',')[0]}` : null;
  const link = `${APP_URL}/dashboard?conv=${opts.convId}`;

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1a2332;padding:18px 24px;display:flex;align-items:center;gap:10px">
    <span style="color:#fff;font-weight:700;font-size:16px">Conversa escalada para humano</span>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">
      <tr><td style="padding:6px 0;color:#888;width:110px">Referência</td><td style="font-weight:700;color:#1a2332">${ref}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Lead</td><td>${nome}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Telefone</td><td>${opts.telemovel}</td></tr>
      ${rota ? `<tr><td style="padding:6px 0;color:#888">Rota</td><td>${rota}</td></tr>` : ''}
      ${opts.lastMsg ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top">Última msg</td><td style="color:#555;font-style:italic">"${opts.lastMsg.slice(0, 120).replace(/\*/g, '')}"</td></tr>` : ''}
    </table>
    <div style="margin-top:20px">
      <a href="${link}" style="display:inline-block;background:#00bcd4;color:#fff;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px">
        Abrir Inbox →
      </a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:10px 24px;font-size:11px;color:#aaa">
    YourBox BackOffice · ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}
  </div>
</div>`;

  await resend.emails.send({
    from:    FROM,
    to:      recipients,
    subject: `${ref} — Conversa escalada · ${nome}`,
    html,
  }).catch(err => console.error('[Resend] falha ao enviar email de escalada:', err));
}

export async function sendConversationEmail(opts: {
  convId:      string;
  telemovel:   string;
  nome?:       string;
  origem?:     string;
  destino?:    string;
  toOverride?: string[];
}) {
  const recipients = opts.toOverride ?? TO;
  if (!process.env.RESEND_API_KEY || recipients.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const ref  = '#' + opts.convId.slice(-5).toUpperCase();
  const nome = opts.nome ?? opts.telemovel;
  const rota = opts.origem ? `${opts.origem.split(',')[0]} → ${(opts.destino ?? '...').split(',')[0]}` : null;
  const link = `${APP_URL}/dashboard?conv=${opts.convId}`;

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1a2332;padding:18px 24px">
    <span style="color:#fff;font-weight:700;font-size:16px">Nova conversa iniciada</span>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">
      <tr><td style="padding:6px 0;color:#888;width:110px">Referência</td><td style="font-weight:700;color:#1a2332">${ref}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Lead</td><td>${nome}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Telefone</td><td>${opts.telemovel}</td></tr>
      ${rota ? `<tr><td style="padding:6px 0;color:#888">Rota</td><td>${rota}</td></tr>` : ''}
    </table>
    <div style="margin-top:20px">
      <a href="${link}" style="display:inline-block;background:#00bcd4;color:#fff;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px">
        Abrir Inbox →
      </a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:10px 24px;font-size:11px;color:#aaa">
    YourBox BackOffice · ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}
  </div>
</div>`;

  await resend.emails.send({
    from:    FROM,
    to:      recipients,
    subject: `${ref} — Nova conversa · ${nome}`,
    html,
  }).catch(err => console.error('[Resend] falha ao enviar email de conversa:', err));
}

export async function sendLeadEmail(opts: {
  convId:      string;
  leadId?:     string;
  telemovel:   string;
  nome?:       string;
  origem?:     string;
  destino?:    string;
  price?:      number;
  toOverride?: string[];
}) {
  const recipients = opts.toOverride ?? TO;
  if (!process.env.RESEND_API_KEY || recipients.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const ref  = '#' + opts.convId.slice(-5).toUpperCase();
  const nome = opts.nome ?? opts.telemovel;
  const rota = opts.origem ? `${opts.origem.split(',')[0]} → ${(opts.destino ?? '...').split(',')[0]}` : null;
  const link = opts.leadId ? `${APP_URL}/dashboard?lead=${opts.leadId}` : `${APP_URL}/dashboard`;

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1a2332;padding:18px 24px;display:flex;align-items:center;gap:10px">
    <span style="color:#fff;font-weight:700;font-size:16px">Nova lead registada</span>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">
      <tr><td style="padding:6px 0;color:#888;width:110px">Referência</td><td style="font-weight:700;color:#1a2332">${ref}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Lead</td><td>${nome}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Telefone</td><td>${opts.telemovel}</td></tr>
      ${rota ? `<tr><td style="padding:6px 0;color:#888">Rota</td><td>${rota}</td></tr>` : ''}
      ${opts.price != null ? `<tr><td style="padding:6px 0;color:#888">Preço</td><td style="font-weight:700;color:#2e7d32">€${opts.price.toFixed(2)}</td></tr>` : ''}
    </table>
    <div style="margin-top:20px">
      <a href="${link}" style="display:inline-block;background:#00bcd4;color:#fff;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px">
        Abrir Dashboard →
      </a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:10px 24px;font-size:11px;color:#aaa">
    YourBox BackOffice · ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}
  </div>
</div>`;

  await resend.emails.send({
    from:    FROM,
    to:      recipients,
    subject: `${ref} — Nova lead · ${nome}`,
    html,
  }).catch(err => console.error('[Resend] falha ao enviar email de lead:', err));
}
