import { Resend } from 'resend';
import { esc } from '@/lib/html';
import { botao, cartao, COR, envelope, lista, paragrafo, passos } from './layout';

const FROM    = process.env.ALERT_FROM_EMAIL ?? 'YourBox <noreply@yourbox.com.pt>';
const TO      = (process.env.ALERT_EMAIL ?? '').split(',').map(e => e.trim()).filter(Boolean);
// leads.comgo.pt e o dominio de producao. O fallback so entra se NEXT_PUBLIC_APP_URL
// faltar no ambiente — e nesse caso todos os links dos emails tem de continuar a bater
// no sitio certo. Estava aqui leads.yourbox.com.pt, que nao serve a aplicacao.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://leads.comgo.pt').replace(/\/$/, '');

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

  const html = envelope({
    resumo: 'Ficou a meio o seu pedido de orçamento. Continuamos?',
    titulo: `${opts.nome}, continuamos o seu orçamento?`,
    subtitulo: esc(opts.rota),
    corpo: paragrafo(esc(opts.texto).replace(/\n/g, '<br/>'))
      + (opts.ctaUrl ? botao('Sim, contactem-me', opts.ctaUrl) : '')
      + paragrafo(`ou ligue <a href="tel:+351214304546" style="color:${COR.escuro};font-weight:700;text-decoration:none">214 304 546</a>`),
    rodape: 'Este é um contacto único — não lhe enviaremos mais nenhuma mensagem deste género.',
  });

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

  const html = envelope({
    interno: true,
    resumo: `${ref} — ${nome} pediu para falar com uma pessoa.`,
    titulo: 'Conversa escalada para humano',
    corpo: cartao(lista([
      ['Referência', ref],
      ['Lead', nome],
      ['Telefone', opts.telemovel],
      ['Rota', rota],
      // Sem `esc`: a `lista` escapa tudo o que recebe. Isto e texto escrito por quem
      // esta do outro lado do chat, e ate aqui entrava no HTML sem passar por lado nenhum.
      ['Última mensagem', opts.lastMsg ? `"${opts.lastMsg.slice(0, 160).replace(/\*/g, '')}"` : null],
    ]))
    + botao('Abrir Inbox', link),
  });

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

  const html = envelope({
    interno: true,
    resumo: `${ref} — ${nome} começou uma conversa.`,
    titulo: 'Nova conversa iniciada',
    corpo: cartao(lista([
      ['Referência', ref],
      ['Lead', nome],
      ['Telefone', opts.telemovel],
      ['Rota', rota],
    ]))
    + botao('Abrir Inbox', link),
  });

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

  const html = envelope({
    interno: true,
    resumo: `${ref} — ${nome}${opts.price != null ? ` · ${opts.price.toFixed(2)} EUR` : ''}`,
    titulo: 'Nova lead registada',
    corpo: cartao(lista([
      ['Referência', ref],
      ['Lead', nome],
      ['Telefone', opts.telemovel],
      ['Rota', rota],
      ['Preço', opts.price != null ? `${opts.price.toFixed(2)} EUR` : null],
    ]))
    + botao('Abrir Dashboard', link),
  });

  await resend.emails.send({
    from:    FROM,
    to:      recipients,
    subject: `${ref} — Nova lead · ${nome}`,
    html,
  }).catch(err => console.error('[Resend] falha ao enviar email de lead:', err));
}

/**
 * Pedido de autorização ao cliente — o pedido dele pode seguir para outra empresa?
 *
 * Enviado sozinho quando não há gerentes de conta de serviço (ver lib/crm/autorizacao.ts).
 * É o único email nosso que pede uma decisão sobre os dados da pessoa, e por isso foge
 * ao formato dos outros em três pontos:
 *
 *   - O texto da pergunta vai citado, palavra por palavra, tal como fica gravado como
 *     prova. Um email que resuma o que se está a pedir não demonstra consentimento.
 *   - Os dois botões têm o mesmo peso visual. Pôr o "sim" em destaque e o "não" em letra
 *     pequena é desenhar para obter uma resposta, e um consentimento assim obtido não é
 *     livre — que é exactamente o que o RGPD exige que seja.
 *   - Diz o que acontece se não responder. Silêncio não é autorização, e a pessoa tem de
 *     saber que pode simplesmente ignorar o email.
 */
export async function sendPedidoAutorizacaoEmail(opts: {
  to: string;
  nome: string;
  servico: string;
  guiao: { versao: string; texto: string };
  url: string;
  validadeHoras: number;
}) {
  if (!process.env.RESEND_API_KEY || !opts.to) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = envelope({
    resumo: 'Precisamos de uma resposta sua para avançar com o seu pedido.',
    titulo: `${opts.nome}, precisamos da sua autorização`,
    subtitulo: `Sobre o pedido que nos fez: <strong>${esc(opts.servico)}</strong>.`,
    corpo: cartao(
      `<strong style="color:${COR.escuro}">${esc(opts.guiao.texto)}</strong>`
      + `<div style="margin-top:12px">${botao('Responder ao pedido', opts.url)}</div>`
      + `<div style="font-size:12px;color:${COR.suave};margin-top:2px">`
      + `A ligação abre uma página onde escolhe autorizar ou não autorizar. `
      + `É válida durante ${opts.validadeHoras} horas.</div>`,
      'aviso',
    )
    + paragrafo('Se não responder, não acontece nada: o seu pedido não é passado a ninguém.'),
    rodape: 'Só partilhamos o seu pedido com outra empresa se autorizar aqui. Nesse caso, é essa '
      + 'empresa que passa a ser responsável pelos dados que lhe entregamos.',
  });

  const r = await resend.emails.send({
    from:    FROM,
    to:      [opts.to],
    subject: 'O seu pedido de transporte — precisamos da sua autorização',
    html,
  }).catch(err => { console.error('[Resend] falha no pedido de autorização:', err); return null; });
  return !!r;
}

/**
 * Confirmação do pedido, para o cliente. O primeiro email que ele recebe de nós.
 *
 * Duas versões, decididas pela triagem que corre no mesmo instante em que isto é
 * enviado (ver app/api/quiz-progress/route.ts):
 *
 *   - **servível** — recebemos, analisamos, ligamos. É a esmagadora maioria.
 *   - **fora do âmbito** — o mesmo, mais o pedido de autorização para o pedido seguir
 *     para uma empresa especializada.
 *
 * A segunda versão existe para não haver dois emails sobre o mesmo assunto com minutos
 * de diferença. Uma pessoa que acabou de pedir um orçamento e recebe logo duas mensagens
 * nossas fica com a impressão de que não sabemos o que estamos a fazer — e a segunda
 * mensagem trazia uma pergunta que contradizia a promessa da primeira.
 *
 * O botão da autorização aponta para a página de escolha e nunca para o "sim" directo:
 * varredores de segurança abrem as ligações dos emails antes do destinatário (ver
 * app/api/crm/autorizacao/route.ts).
 */
export async function sendConfirmacaoPedidoEmail(opts: {
  to: string;
  nome: string;
  resumo: [string, string | null | undefined][];
  /** Só nas leads fora do âmbito e com o pedido de autorização preparado. */
  autorizacao?: { texto: string; url: string; validadeHoras: number } | null;
}) {
  if (!process.env.RESEND_API_KEY || !opts.to) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const nome = String(opts.nome ?? '').trim().split(/\s+/)[0];
  const trata = nome ? `, ${nome}` : '';
  const a = opts.autorizacao;

  const corpo = a
    ? [
        cartao(
          `<strong style="color:${COR.escuro}">${esc(a.texto)}</strong>`
          + `<div style="margin-top:12px">${botao('Responder ao pedido', a.url)}</div>`
          + `<div style="font-size:12px;color:${COR.suave};margin-top:2px">`
          + `A ligação abre uma página onde escolhe autorizar ou não autorizar. `
          + `É válida durante ${a.validadeHoras} horas.</div>`,
          'aviso',
        ),
        paragrafo('Enquanto não responder, o seu pedido fica connosco e não é passado a ninguém. '
          + 'Se preferir falar primeiro, ligue-nos.'),
        cartao(`<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};margin-bottom:10px">O seu pedido</div>`
          + lista(opts.resumo)),
      ].join('')
    : [
        passos([
          { titulo: 'Análise do pedido', texto: 'Estamos a ver os detalhes do que nos pediu.' },
          { titulo: 'Contacto', texto: 'Falamos consigo para confirmar o que faltar.' },
          { titulo: 'Orcamento', texto: 'Apresentamos o preço para o seu caso.' },
        ]),
        `<div style="height:6px"></div>`,
        cartao(`<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};margin-bottom:10px">O seu pedido</div>`
          + lista(opts.resumo)),
      ].join('');

  const html = envelope({
    resumo: a
      ? 'Recebemos o seu pedido. Precisamos de uma resposta sua para avançar.'
      : 'Recebemos o seu pedido e entramos em contacto consigo em breve.',
    titulo: `Pedido recebido${trata}`,
    subtitulo: a
      ? 'Para este transporte em concreto precisamos de uma resposta sua antes de avançar.'
      : 'Já o temos connosco. Entramos em contacto consigo em breve.',
    corpo,
    rodape: a ? 'Se não responder, não acontece nada: o seu pedido não é partilhado com ninguém.' : undefined,
  });

  const r = await resend.emails.send({
    from:    FROM,
    to:      [opts.to],
    subject: a ? 'O seu pedido — precisamos da sua autorização' : 'Recebemos o seu pedido',
    html,
  }).catch(err => { console.error('[Resend] falha na confirmação do pedido:', err); return null; });
  return !!r;
}

/**
 * A carta de apresentação a um parceiro. O primeiro email que aquela empresa recebe de nós.
 *
 * Enviado à mão, um a um, por uma gerente de conta que já escolheu aquela empresa por uma
 * razão concreta — nunca em série. O texto e as razões de cada parte estão em
 * lib/crm/apresentacao.ts.
 *
 * Duas coisas que este email tem e os outros não:
 *
 *   - **Um mecanismo de oposição.** Mesmo a este volume é exigência legal para
 *     comunicação comercial não solicitada, e respeitá-lo é permanente.
 *   - **O nome de quem assina.** Uma empresa não escreve a outra a partir de um sistema.
 */
export async function sendApresentacaoParceiroEmail(opts: {
  to: string;
  empresa: string;
  assunto: string;
  corpo: {
    intro: string;
    oQueE: string[];
    comoFunciona: { titulo: string; texto: string }[];
    fecho: string;
  };
  urlFormulario: string;
  urlOposicao: string;
  rodapeOposicao: string;
  assinatura: string;
}) {
  if (!process.env.RESEND_API_KEY || !opts.to) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = envelope({
    resumo: 'Temos pedidos de transporte na vossa zona que não conseguimos servir.',
    titulo: opts.assunto,
    subtitulo: opts.corpo.intro,
    corpo: [
      opts.corpo.oQueE.map((p) => paragrafo(esc(p))).join(''),

      cartao(
        `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};margin-bottom:12px">Como funciona</div>`
        + passos(opts.corpo.comoFunciona.map((p) => ({ titulo: p.titulo, texto: esc(p.texto) }))),
      ),

      paragrafo(opts.corpo.fecho),
      botao('Dizer o que fazemos e onde', opts.urlFormulario),
      `<p style="margin:6px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${COR.suave}">`
      + `Cinco campos. Não pedimos documentos nem dados de pagamento nesta fase.</p>`,

      `<p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.texto}">`
      + `Com os melhores cumprimentos,<br><strong style="color:${COR.escuro}">${esc(opts.assinatura)}</strong>`
      + `<br><span style="font-size:12.5px;color:${COR.suave}">YourBox &mdash; estafetas e transportes</span></p>`,
    ].join(''),
    rodape: `${esc(opts.rodapeOposicao)} <a href="${esc(opts.urlOposicao)}" style="color:#9aa2a8">Não receber mais contactos</a>.`,
  });

  const r = await resend.emails.send({
    from:    FROM,
    to:      [opts.to],
    subject: opts.assunto,
    html,
  }).catch(err => { console.error('[Resend] falha na apresentacao a parceiro:', err); return null; });
  return !!r;
}

/**
 * Envia HTML ja montado.
 *
 * Existe para os emails cujo corpo e composto noutro sitio — a carta de apresentacao, que
 * a operadora escolhe e parametriza, e cujo HTML tem de ser exactamente o mesmo que ela
 * viu na pre-visualizacao. Duplicar aqui a montagem seria criar um segundo caminho que um
 * dia divergiria do primeiro.
 */
export async function sendHtmlBruto(opts: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY || !opts.to) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const r = await resend.emails.send({
    from: FROM, to: [opts.to], subject: opts.subject, html: opts.html,
  }).catch(err => { console.error('[Resend] falha no envio:', err); return null; });
  return !!r;
}
