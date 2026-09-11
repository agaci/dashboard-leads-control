import type { CrmConsulta, CrmPartner, CrmTemplate } from '@/types/crm';
import { labelDaCategoria } from './categorias';
import { linkFollowUp, linkRecusa, linkReporte } from './tokens';
import { botao as botaoEmail, cartao, COR, envelope, lista } from '@/lib/email/layout';

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
    // Os dois botoes com o mesmo peso: a pergunta e se resolveu, nao um convite a dizer
    // que sim. Um "Sim" em destaque e um "Nao" apagado enviesava a unica medida que
    // temos da qualidade das leads.
    html: envelope({
      resumo: 'Uma pergunta rapida sobre o transporte que nos pediu.',
      titulo: `Conseguiu resolver o seu transporte${nome ? `, ${escapar(nome)}` : ''}?`,
      subtitulo: 'Uma resposta de um toque, e ficamos a saber se ficou bem servido.',
      corpo: botaoEmail('Sim, resolvi', linkFollowUp(id, true))
        + botaoEmail('Não, ainda não', linkFollowUp(id, false)),
      rodape: 'Um único contacto para sabermos se ficou bem servido.',
    }),
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
/**
 * O molde destes cinco emails.
 *
 * Passou a delegar em lib/email/layout.ts: tinha o seu proprio cabecalho azul-escuro e o
 * seu proprio botao turquesa, e o resultado eram emails da mesma empresa com desenhos
 * diferentes conforme a parte do sistema que os tinha enviado.
 *
 * O primeiro botao fica primario e os restantes neutros — excepto quando o chamador diz
 * `secundario`, que e como a recusa e o reporte aparecem lado a lado sem que um pareca a
 * resposta certa.
 */
function emailBase(
  titulo: string,
  linhas: [string, string][],
  botoes: { texto: string; url: string; secundario?: boolean }[],
  rodape?: string,
): string {
  const cta = botoes
    .map((b, i) => botaoEmail(b.texto, b.url, b.secundario || i > 0 ? 'neutro' : 'primario'))
    .join('');

  return envelope({
    resumo: `${titulo}${linhas[0] ? ` — ${linhas[0][1]}` : ''}`,
    titulo,
    corpo: cartao(lista(linhas.filter(([, v]) => v && v !== '—')))
      + (rodape ? `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:${COR.texto}">${escapar(rodape)}</p>` : '')
      + cta,
  });
}
