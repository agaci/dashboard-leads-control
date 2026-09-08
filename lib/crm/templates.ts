import type { CrmConsulta, CrmPartner, CrmTemplate } from '@/types/crm';
import { labelDaCategoria } from './categorias';
import { linkFollowUp, linkRecusa, linkReporte, urlBase } from './tokens';

/**
 * Templates de mensagem (spec §9.3).
 *
 * A Meta exige pré-aprovação dos templates de WhatsApp e a spec manda desenhá-los cedo,
 * não no fim. Ficam aqui os quatro iniciais que a spec nomeia — nova lead, nova consulta
 * de cotação, adjudicação, aviso de saldo baixo — mais o follow-up ao cliente.
 *
 * Duas regras que não se negoceiam:
 *
 *   - Ao PARCEIRO diz-se tudo o que ele comprou: contacto do cliente, carga, rota.
 *   - Ao CLIENTE nunca se menciona parceiro, transportadora ou fornecedor. Para o
 *     cliente é sempre YourBox. O `followup_cliente` é o único template que sai para
 *     fora e por isso é o único onde isto se aplica — mas aplica-se por inteiro.
 */

export interface Mensagem {
  assunto: string;   // usado pelo email; ignorado pelo WhatsApp
  texto: string;     // WhatsApp e SMS (markdown do WhatsApp: *negrito*, _itálico_)
  html: string;      // email
}

export interface ContextoTemplate {
  consulta: CrmConsulta;
  parceiro?: CrmPartner;
  valorLead?: number;
  saldo?: number;
}

export function construir(template: CrmTemplate, ctx: ContextoTemplate): Mensagem {
  switch (template) {
    case 'nova_lead':        return novaLead(ctx);
    case 'nova_consulta':    return novaConsulta(ctx);
    case 'adjudicacao':      return adjudicacao(ctx);
    case 'saldo_baixo':      return saldoBaixo(ctx);
    case 'followup_cliente': return followUpCliente(ctx);
  }
}

// ── Linha B: lead vendida ao parceiro ────────────────────────────────────────

function novaLead({ consulta, parceiro, valorLead }: ContextoTemplate): Mensagem {
  const id = String(consulta._id ?? '');
  const pid = String(parceiro?._id ?? '');
  const ref = referencia(id);
  const c = consulta.cliente ?? {};
  const p = consulta.pedido ?? {};

  const linhas = [
    `*Nova lead YourBox* — ${labelDaCategoria(consulta.categoria)}`,
    `Ref: *${ref}*`,
    '',
    `Cliente: *${c.nome ?? 'sem nome'}*`,
    ...(c.telefone ? [`Telefone: ${c.telefone}`] : []),
    ...(c.email ? [`Email: ${c.email}`] : []),
    '',
    ...(p.origem ? [`Recolha: ${p.origem}`] : []),
    ...(p.destino ? [`Entrega: ${p.destino}`] : []),
    ...(cargaLinha(consulta) ? [cargaLinha(consulta)] : []),
    ...(p.urgencia ? [`Prazo: ${p.urgencia}`] : []),
    ...(p.observacoes ? [`Notas: ${p.observacoes}`] : []),
    '',
    ...(valorLead ? [`Custo desta lead: *${euro(valorLead)}*, debitado da sua carteira.`] : []),
    'Lead exclusiva: não foi enviada a mais ninguém.',
    '',
    `Se a lead for inválida, tem 24h para a contestar: ${linkRecusa(id, pid)}`,
    `Quando fechar (ou perder), reporte aqui: ${linkReporte(id, pid)}`,
  ];

  return {
    assunto: `${ref} — Nova lead YourBox · ${labelDaCategoria(consulta.categoria)}`,
    texto: linhas.join('\n'),
    html: emailBase(`Nova lead YourBox`, [
      ['Referência', ref],
      ['Categoria', labelDaCategoria(consulta.categoria)],
      ['Cliente', c.nome ?? 'sem nome'],
      ['Telefone', c.telefone ?? '—'],
      ['Email', c.email ?? '—'],
      ['Recolha', p.origem ?? '—'],
      ['Entrega', p.destino ?? '—'],
      ['Carga', cargaLinha(consulta) || '—'],
      ['Prazo', p.urgencia ?? '—'],
      ['Notas', p.observacoes ?? '—'],
      ...(valorLead ? [['Custo da lead', euro(valorLead)] as [string, string]] : []),
    ], [
      { texto: 'Reportar resultado', url: linkReporte(id, pid) },
      { texto: 'Contestar lead (24h)', url: linkRecusa(id, pid), secundario: true },
    ]),
  };
}

// ── Linha A: pedido de cotação ───────────────────────────────────────────────

/**
 * Consulta de cotação. Note-se o que NÃO vai: contacto do cliente. Na Linha A a YourBox
 * gere o serviço e factura ao cliente final — o parceiro cota a carga, não a relação.
 */
function novaConsulta({ consulta }: ContextoTemplate): Mensagem {
  const ref = referencia(String(consulta._id ?? ''));
  const p = consulta.pedido ?? {};

  const linhas = [
    `*Pedido de cotação YourBox*`,
    `Ref: *${ref}*`,
    '',
    ...(p.origem ? [`Recolha: ${cidade(p.origem)}`] : []),
    ...(p.destino ? [`Entrega: ${cidade(p.destino)}`] : []),
    ...(cargaLinha(consulta) ? [cargaLinha(consulta)] : []),
    ...(p.urgencia ? [`Prazo: ${p.urgencia}`] : []),
    ...(p.observacoes ? [`Notas: ${p.observacoes}`] : []),
    '',
    'Responda com preço e validade da proposta.',
  ];

  return {
    assunto: `${ref} — Pedido de cotação YourBox`,
    texto: linhas.join('\n'),
    html: emailBase('Pedido de cotação', [
      ['Referência', ref],
      ['Recolha', cidade(p.origem ?? '') || '—'],
      ['Entrega', cidade(p.destino ?? '') || '—'],
      ['Carga', cargaLinha(consulta) || '—'],
      ['Prazo', p.urgencia ?? '—'],
      ['Notas', p.observacoes ?? '—'],
    ], []),
  };
}

function adjudicacao({ consulta }: ContextoTemplate): Mensagem {
  const ref = referencia(String(consulta._id ?? ''));
  const p = consulta.pedido ?? {};

  const linhas = [
    `*Serviço adjudicado* — ${ref}`,
    '',
    ...(p.origem ? [`Recolha: ${p.origem}`] : []),
    ...(p.destino ? [`Entrega: ${p.destino}`] : []),
    ...(cargaLinha(consulta) ? [cargaLinha(consulta)] : []),
    ...(p.urgencia ? [`Prazo: ${p.urgencia}`] : []),
    '',
    'A proposta foi aceite. Confirme a recolha.',
  ];

  return {
    assunto: `${ref} — Serviço adjudicado`,
    texto: linhas.join('\n'),
    html: emailBase('Serviço adjudicado', [
      ['Referência', ref],
      ['Recolha', p.origem ?? '—'],
      ['Entrega', p.destino ?? '—'],
      ['Carga', cargaLinha(consulta) || '—'],
      ['Prazo', p.urgencia ?? '—'],
    ], []),
  };
}

function saldoBaixo({ parceiro, saldo }: ContextoTemplate): Mensagem {
  const valor = euro(saldo ?? 0);
  const texto = [
    '*Saldo baixo na carteira YourBox*',
    '',
    `Saldo actual: *${valor}*.`,
    'Sem saldo, as próximas leads seguem para outro parceiro.',
    '',
    'Para carregar, responda a esta mensagem.',
  ].join('\n');

  return {
    assunto: `Saldo baixo — ${valor}`,
    texto,
    html: emailBase('Saldo baixo na carteira', [
      ['Parceiro', parceiro?.nome ?? '—'],
      ['Saldo actual', valor],
    ], [], 'Sem saldo, as próximas leads seguem para outro parceiro.'),
  };
}

// ── Follow-up ao cliente (spec §6.2) ─────────────────────────────────────────

/**
 * A fonte principal de visibilidade. Uma pergunta, resposta de um toque.
 *
 * Para o cliente, quem perguntou foi a YourBox — e é assim que tem de continuar a ser.
 * Nada aqui revela que o serviço foi entregue a outra empresa.
 */
function followUpCliente({ consulta }: ContextoTemplate): Mensagem {
  const id = String(consulta._id ?? '');
  const nome = primeiroNome(consulta.cliente?.nome);

  const texto = [
    `Olá${nome ? ` ${nome}` : ''}, aqui é a YourBox.`,
    '',
    'Conseguiu resolver o seu transporte?',
    '',
    `Sim: ${linkFollowUp(id, true)}`,
    `Não: ${linkFollowUp(id, false)}`,
  ].join('\n');

  return {
    assunto: 'Conseguiu resolver o seu transporte?',
    texto,
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  ${cabecalho('YourBox')}
  <div style="padding:24px;color:#333;font-size:14px;line-height:1.6">
    <p style="margin:0 0 18px">Olá${nome ? ` ${escapar(nome)}` : ''}, conseguiu resolver o seu transporte?</p>
    <div>
      <a href="${linkFollowUp(id, true)}" style="display:inline-block;background:#bed62f;color:#1a2332;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;margin-right:8px">Sim</a>
      <a href="${linkFollowUp(id, false)}" style="display:inline-block;background:#eef0f3;color:#1a2332;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px">Não</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:14px 24px;font-size:11px;color:#999;line-height:1.5;border-top:1px solid #eef0f3">
    <strong style="color:#777">YourBox &ndash; estafetas e transportes</strong><br/>
    Um único contacto para sabermos se ficou bem servido. Para aceder, corrigir ou apagar os seus dados,
    responda a este email &mdash; ver a
    <a href="https://yourbox.com.pt/politica_de_privacidade.html" style="color:#999">Política de Privacidade</a>.
  </div>
</div>`,
  };
}

// ── Auxiliares ───────────────────────────────────────────────────────────────

/** Os cinco últimos caracteres do id, como já se faz no lib/notifications/dispatch.ts. */
export function referencia(id: string): string {
  return '#' + String(id).slice(-5).toUpperCase();
}

function cargaLinha(consulta: CrmConsulta): string {
  const p = consulta.pedido ?? {};
  const partes: string[] = [];
  if (p.nVolumes) partes.push(`${p.nVolumes} volume${p.nVolumes === 1 ? '' : 's'}`);
  if (p.totalCm) partes.push(`C+L+A ${p.totalCm} cm`);
  if (p.weightKg) partes.push(`${p.weightKg} kg`);
  return partes.length ? `Carga: ${partes.join(' · ')}` : '';
}

function cidade(morada: string): string {
  return String(morada ?? '').split(',')[0].trim();
}

function primeiroNome(nome?: string): string {
  return String(nome ?? '').trim().split(/\s+/)[0] ?? '';
}

function euro(v: number): string {
  return `${(Number(v) || 0).toFixed(2)} EUR`;
}

function escapar(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Cabecalho comum aos emails.
 *
 * A imagem tem de ser absoluta — um email nao tem base a partir da qual resolver
 * caminhos — e por isso sai de `urlBase()`. Muitos clientes de email bloqueiam imagens
 * ate o leitor as pedir, portanto o nome vai em texto ao lado e nao dentro da imagem:
 * com ou sem imagem, le-se sempre quem esta a escrever.
 */
function cabecalho(titulo: string): string {
  return `
  <div style="background:#1a2332;padding:16px 24px">
    <img src="${urlBase()}/icons/icon-64x64.png" width="26" height="26" alt=""
         style="border-radius:6px;vertical-align:middle;display:inline-block">
    <span style="color:#fff;font-weight:700;font-size:16px;vertical-align:middle;margin-left:10px">${escapar(titulo)}</span>
  </div>`;
}

function emailBase(
  titulo: string,
  linhas: [string, string][],
  botoes: { texto: string; url: string; secundario?: boolean }[],
  rodape?: string,
): string {
  const tr = linhas
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#888;width:120px;vertical-align:top">${escapar(k)}</td><td style="color:#333">${escapar(v)}</td></tr>`)
    .join('');
  const cta = botoes
    .map((b) => `<a href="${b.url}" style="display:inline-block;background:${b.secundario ? '#eef0f3' : '#00bcd4'};color:${b.secundario ? '#1a2332' : '#fff'};font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px;margin-right:8px">${escapar(b.texto)}</a>`)
    .join('');

  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  ${cabecalho(titulo)}
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">${tr}</table>
    ${rodape ? `<p style="margin:18px 0 0;font-size:13px;color:#555">${escapar(rodape)}</p>` : ''}
    ${cta ? `<div style="margin-top:20px">${cta}</div>` : ''}
  </div>
  <div style="background:#f9fafb;padding:10px 24px;font-size:11px;color:#aaa">
    YourBox CRM de Parceiros · ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}
  </div>
</div>`;
}
