import { botao, cartao, COR, envelope, lista, paragrafo, passos } from './layout';
import { esc } from '@/lib/html';
import { GUIAO_AUTORIZACAO_EMAIL } from '@/lib/crm/guiao';
import { renderizar, type TextoCarta } from '@/lib/crm/textosCarta';
import {
  APRESENTACOES, corpoApresentacao, RODAPE_OPOSICAO,
  type CampoApresentacao, type VarianteApresentacao,
} from '@/lib/crm/apresentacao';

/**
 * O catálogo dos emails que esta plataforma envia.
 *
 * Existe por duas razões, e a segunda é a que o torna necessário e não apenas simpático.
 *
 * **Para se ver.** Uma gerente de conta que vai escolher que carta enviar tem de poder
 * ler o email antes de o mandar, e saber em que situação é que cada um é o certo. Um
 * catálogo escrito à mão num documento fica desactualizado na primeira semana.
 *
 * **Para não mentir.** Cada exemplo é renderizado pelo mesmo código que produz o email a
 * sério — o `envelope()` de ./layout.ts, os mesmos `cartao`, `lista` e `botao`. Não há
 * cópia nenhuma. Se o molde mudar amanhã, a pré-visualização muda com ele; não existe o
 * estado em que a página mostra uma coisa e o cliente recebe outra.
 *
 * Os valores de exemplo são inventados de propósito e ditos como tal na interface, para
 * ninguém confundir uma amostra com uma lead real.
 */

export type Publico = 'cliente' | 'visitante' | 'parceiro' | 'equipa';

export interface ModeloEmail {
  id: string;
  nome: string;
  publico: Publico;
  assunto: string;
  /** Quando é que este email sai. */
  quando: string;
  /** O que a operadora precisa de saber antes de o mandar, ou de o explicar a alguém. */
  descricao: string;
  /** Enviado à mão por uma pessoa, ou pelo sistema? */
  manual: boolean;
  /** Só nos manuais: o que é preciso preencher antes de enviar. */
  campos?: CampoApresentacao[];
  /** O HTML, renderizado com os valores dados (ou com a amostra). */
  render: (valores?: Record<string, unknown>) => string;
}

export const ROTULO_PUBLICO: Record<Publico, string> = {
  cliente:   'Cliente',
  visitante: 'Visitante',
  parceiro:  'Parceiro',
  equipa:    'Equipa',
};

// ── amostras ─────────────────────────────────────────────────────────────────

const RESUMO_PEDIDO: [string, string | null | undefined][] = [
  ['Recolha', 'Av. Central 578, Amora, Portugal'],
  ['Entrega', 'Várias moradas (porta-a-porta)'],
  ['Material', 'Mudança de casa / escritório'],
  ['Carga', '1 volume · 10 kg'],
  ['Urgência', '1 Hora'],
  ['Embalagem', 'Não embalado'],
];

const tituloBloco = (t: string) =>
  `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};margin-bottom:10px">${esc(t)}</div>`;

const avisoAutorizacao = cartao(
  `<strong style="color:${COR.escuro}">${esc(GUIAO_AUTORIZACAO_EMAIL.texto)}</strong>`
  + `<div style="margin-top:12px">${botao('Responder ao pedido', '#')}</div>`
  + `<div style="font-size:12px;color:${COR.suave};margin-top:2px">A ligação abre uma página `
  + `onde escolhe autorizar ou não autorizar. É válida durante 72 horas.</div>`,
  'aviso',
);

// ── as cartas de apresentação ────────────────────────────────────────────────

/**
 * Os valores em cru, para o `renderizar` os escapar ele.
 *
 * Escapá-los antes daria "Silva &amp;amp; Filhos": o `renderizar` escapa sempre, porque é
 * ele que decide o que é marcação e o que é texto. O caminho antigo — sem textos da base
 * de dados — continua a receber os valores já escapados, como sempre recebeu.
 *
 * `pedidosPorMes` é o nome do campo no formulário e `{pedidos}` o da variável no texto.
 * Aceitam-se os dois para não obrigar ninguém a escrever `{pedidosPorMes}` numa frase.
 */
function valoresEmCru(v: Record<string, unknown>): Record<string, unknown> {
  return {
    categoria: v.categoria,
    zona: v.zona,
    pedidos: v.pedidos ?? v.pedidosPorMes,
    pessoa: v.pessoa,
    quemIndicou: v.quemIndicou,
  };
}

/** O assunto de uma carta, já com as variáveis substituídas. */
export function assuntoApresentacao(
  variante: VarianteApresentacao,
  v: Record<string, unknown>,
  textos?: TextoCarta,
): string {
  const meta = APRESENTACOES.find((a) => a.id === variante)!;
  if (!textos?.assunto) return meta.assunto;
  // Volta a descodificar o que o `renderizar` escapou: isto vai no cabeçalho do email,
  // que é texto e não HTML — um "&" tem de chegar como "&" e não como "&amp;".
  return renderizar(textos.assunto, valoresEmCru(v))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Monta uma carta de apresentação.
 *
 * Exportada porque é a mesma função que o envio a sério usa: a pré-visualização e o email
 * que chega ao parceiro saem daqui os dois, e por isso não podem divergir.
 *
 * `textos` vem da base de dados (lib/crm/textos.ts) e manda no assunto, na abertura e nos
 * parágrafos do meio. Sem ele vale o que está em código — é o que acontece se a base não
 * responder, e é de propósito: uma carta velha é melhor do que carta nenhuma.
 */
export function montarApresentacao(
  variante: VarianteApresentacao,
  v: Record<string, unknown>,
  urlFormulario = '#',
  urlOposicao = '#',
  textos?: TextoCarta,
): string {
  const meta = APRESENTACOES.find((a) => a.id === variante)!;
  // Escapados AQUI, antes de entrarem no texto. O `corpoApresentacao` compoe frases com
  // marcacao — os <strong> a volta da categoria e da zona — e por isso o resultado tem de
  // ir em cru para o molde. Se os valores nao fossem escapados neste ponto, uma empresa
  // chamada "Silva & Filhos <Lda>" partia a carta.
  const texto = (x: unknown) => esc(x) || undefined;
  const c = corpoApresentacao(variante, {
    categoria: texto(v.categoria),
    zona: texto(v.zona),
    pedidosPorMes: Number(v.pedidosPorMes) > 0 ? Number(v.pedidosPorMes) : null,
    pessoa: texto(v.pessoa),
    quemIndicou: texto(v.quemIndicou),
    assinatura: String(v.assinatura ?? ''),
  });

  const cru = valoresEmCru(v);
  // Já escapados pelo `renderizar`, e levam <strong> lá dentro: não podem ser escapados
  // outra vez. O caminho antigo continua a escapar no uso, como sempre.
  const intro = textos?.abertura ? renderizar(textos.abertura, cru) : c.intro;
  const meio = textos?.oQueE?.length
    ? textos.oQueE.map((p) => renderizar(p, cru))
    : c.oQueE.map((p) => esc(p));

  return envelope({
    resumo: 'Temos pedidos de transporte na vossa zona que não conseguimos servir.',
    titulo: assuntoApresentacao(variante, v, textos),
    subtitulo: intro,
    corpo: [
      meio.map((p) => paragrafo(p)).join(''),
      cartao(tituloBloco('Como funciona')
        + passos(c.comoFunciona.map((p) => ({ titulo: p.titulo, texto: esc(p.texto) })))),
      paragrafo(c.fecho),
      botao('Dizer o que fazemos e onde', urlFormulario),
      `<p style="margin:6px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${COR.suave}">`
      + 'Cinco campos. Não pedimos documentos nem dados de pagamento nesta fase.</p>',
      `<p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.texto}">`
      + `Com os melhores cumprimentos,<br><strong style="color:${COR.escuro}">${esc(v.assinatura)}</strong>`
      + `<br><span style="font-size:12.5px;color:${COR.suave}">YourBox &mdash; estafetas e transportes</span></p>`,
    ].join(''),
    rodape: `${esc(RODAPE_OPOSICAO)} <a href="${esc(urlOposicao)}" style="color:#9aa2a8">Não receber mais contactos</a>.`,
  });
}

/** Os valores de amostra de cada variante, para a pré-visualização não vir vazia. */
function amostraDaVariante(id: string): Record<string, unknown> {
  const meta = APRESENTACOES.find((a) => a.id === id)!;
  const v: Record<string, unknown> = {};
  for (const c of meta.campos) v[c.id] = c.exemplo;
  return v;
}

// ── o catálogo ───────────────────────────────────────────────────────────────

export function catalogo(textos?: Partial<Record<string, TextoCarta>>): ModeloEmail[] {
  const cartas: ModeloEmail[] = APRESENTACOES.map((a) => ({
    id: `apresentacao_${a.id}`,
    nome: `Apresentação — ${a.nome}`,
    publico: 'parceiro' as const,
    assunto: textos?.[a.id]?.assunto || a.assunto,
    quando: a.quando,
    descricao:
      'A carta que abre a conversa com uma empresa que ainda não é parceira. Enviada à mão, '
      + 'uma a uma, nunca em série. Diz o modelo de negócio à primeira — paga-se por lead, as '
      + 'primeiras são grátis, sem exclusividade — e pede uma coisa só: o formulário de cinco '
      + 'campos que gera as capacidades. Leva sempre o mecanismo de oposição no rodapé.',
    manual: true,
    campos: a.campos,
    render: (valores) => montarApresentacao(
      a.id, valores ?? amostraDaVariante(a.id), '#', '#', textos?.[a.id],
    ),
  }));

  const automaticos: ModeloEmail[] = [
    {
      id: 'confirmacao',
      nome: 'Confirmação do pedido',
      publico: 'cliente',
      assunto: 'Recebemos o seu pedido',
      quando: 'Assim que uma lead servível termina o quiz.',
      descricao:
        'O primeiro email que o cliente recebe. Passou a ser nosso e deixou de ser da plataforma '
        + 'antiga porque a triagem corre no mesmo instante em que ele sai — é isso que permite '
        + 'decidir se leva, ou não, o pedido de autorização.',
      manual: false,
      render: () => envelope({
        resumo: 'Recebemos o seu pedido e entramos em contacto consigo em breve.',
        titulo: 'Pedido recebido, Helder',
        subtitulo: 'Já o temos connosco. Entramos em contacto consigo em breve.',
        corpo: passos([
          { titulo: 'Análise do pedido', texto: 'Estamos a ver os detalhes do que nos pediu.' },
          { titulo: 'Contacto', texto: 'Falamos consigo para confirmar o que faltar.' },
          { titulo: 'Orcamento', texto: 'Apresentamos o preço para o seu caso.' },
        ]) + '<div style="height:6px"></div>' + cartao(tituloBloco('O seu pedido') + lista(RESUMO_PEDIDO)),
      }),
    },
    {
      id: 'confirmacao_autorizacao',
      nome: 'Confirmação com pedido de autorização',
      publico: 'cliente',
      assunto: 'O seu pedido — precisamos da sua autorização',
      quando: 'Lead fora do âmbito, com o interruptor de autorização por email ligado.',
      descricao:
        'A mesma confirmação, com a pergunta do RGPD lá dentro. Existe para não haver duas '
        + 'mensagens sobre o mesmo assunto com minutos de diferença. O botão aponta para uma '
        + 'página de escolha e nunca para o "sim" directo: varredores de segurança abrem as '
        + 'ligações dos emails antes do destinatário.',
      manual: false,
      render: () => envelope({
        resumo: 'Recebemos o seu pedido. Precisamos de uma resposta sua para avançar.',
        titulo: 'Pedido recebido, Helder',
        subtitulo: 'Para este transporte em concreto precisamos de uma resposta sua antes de avançar.',
        corpo: avisoAutorizacao
          + paragrafo('Enquanto não responder, o seu pedido fica connosco e não é passado a ninguém. '
            + 'Se preferir falar primeiro, ligue-nos.')
          + cartao(tituloBloco('O seu pedido') + lista(RESUMO_PEDIDO)),
        rodape: 'Se não responder, não acontece nada: o seu pedido não é partilhado com ninguém.',
      }),
    },
    {
      id: 'autorizacao_avulsa',
      nome: 'Pedido de autorização, sozinho',
      publico: 'cliente',
      assunto: 'O seu pedido de transporte — precisamos da sua autorização',
      quando: 'Consulta triada mais tarde, quando a confirmação já saiu há muito.',
      descricao:
        'Mesma pergunta, email próprio. Fica gravado com `via: link_email` e o texto exacto que '
        + 'a pessoa viu — é a prova mais forte que temos, porque ninguém a transcreveu.',
      manual: false,
      render: () => envelope({
        resumo: 'Precisamos de uma resposta sua para avançar com o seu pedido.',
        titulo: 'Helder, precisamos da sua autorização',
        subtitulo: 'Sobre o pedido que nos fez: <strong>Mudança de casa — Amora para Lisboa</strong>.',
        corpo: avisoAutorizacao
          + paragrafo('Se não responder, não acontece nada: o seu pedido não é passado a ninguém.'),
        rodape: 'Só partilhamos o seu pedido com outra empresa se autorizar aqui. Nesse caso, é essa '
          + 'empresa que passa a ser responsável pelos dados que lhe entregamos.',
      }),
    },
    {
      id: 'followup',
      nome: 'Follow-up ao cliente',
      publico: 'cliente',
      assunto: 'Conseguiu resolver o seu transporte?',
      quando: '48 horas depois de a lead ser entregue a um parceiro.',
      descricao:
        'Uma pergunta de um toque. Os dois botões têm o mesmo peso de propósito: destacar o '
        + '"sim" enviesaria a única medida que temos da qualidade das leads.',
      manual: false,
      render: () => envelope({
        resumo: 'Uma pergunta rapida sobre o transporte que nos pediu.',
        titulo: 'Conseguiu resolver o seu transporte, Helder?',
        subtitulo: 'Uma resposta de um toque, e ficamos a saber se ficou bem servido.',
        corpo: botao('Sim, resolvi', '#') + botao('Não, ainda não', '#'),
        rodape: 'Um único contacto para sabermos se ficou bem servido.',
      }),
    },
    {
      id: 'reengajamento',
      nome: 'Reengajamento do quiz',
      publico: 'visitante',
      assunto: 'Continuamos o seu orçamento?',
      quando: 'Quiz começado e não terminado, com contacto deixado pelo caminho.',
      descricao: 'Um contacto único, e o email di-lo. Não há sequência nem insistência.',
      manual: false,
      render: () => envelope({
        resumo: 'Ficou a meio o seu pedido de orçamento. Continuamos?',
        titulo: 'Helder, continuamos o seu orçamento?',
        subtitulo: 'Amora para Lisboa',
        corpo: paragrafo('Começou um pedido de orçamento connosco e não chegou ao fim.<br/>'
          + 'Se ainda precisar, tratamos disso numa chamada rapida.')
          + botao('Sim, contactem-me', '#')
          + paragrafo(`ou ligue <a href="tel:+351214304546" style="color:${COR.escuro};font-weight:700;text-decoration:none">214 304 546</a>`),
        rodape: 'Este é um contacto único — não lhe enviaremos mais nenhuma mensagem deste género.',
      }),
    },
    {
      id: 'parceiro_lead',
      nome: 'Nova lead para o parceiro',
      publico: 'parceiro',
      assunto: 'Nova lead YourBox',
      quando: 'Quando uma lead da Linha B é distribuída e cobrada.',
      descricao:
        'Leva o contacto do cliente e os dois links da janela de recusa: contestar em 24h e '
        + 'reportar o resultado. Os dois com o mesmo peso — é o reporte dos negativos que mede '
        + 'a qualidade das leads.',
      manual: false,
      render: () => envelope({
        resumo: '#A3F91 — Mudanças',
        titulo: 'Nova lead YourBox',
        corpo: cartao(lista([
          ['Referência', '#A3F91'], ['Categoria', 'Mudanças'], ['Cliente', 'Helder Caldas'],
          ['Telefone', '961220881'], ['Recolha', 'Av. Central 578, Amora'],
          ['Entrega', 'Várias moradas (porta-a-porta)'], ['Custo desta lead', '22.00 EUR'],
        ]))
        + paragrafo('Lead exclusiva: não foi enviada a mais ninguém. Se for inválida, tem 24h para a contestar.')
        + botao('Contestar esta lead', '#') + botao('Reportar o resultado', '#', 'neutro'),
      }),
    },
    {
      id: 'saldo_baixo',
      nome: 'Aviso de saldo baixo',
      publico: 'parceiro',
      assunto: 'Saldo baixo',
      quando: 'Quando a carteira do parceiro desce abaixo do limite configurado.',
      descricao: 'Sem saldo, as leads da área dele passam ao parceiro seguinte. O aviso diz isso.',
      manual: false,
      render: () => envelope({
        resumo: 'Saldo baixo — 12.50 EUR',
        titulo: 'Saldo baixo',
        corpo: cartao(lista([['Saldo actual', '12.50 EUR'], ['Limite de aviso', '25.00 EUR']]))
          + paragrafo('Sem saldo, as leads da sua área passam ao parceiro seguinte.')
          + botao('Carregar a carteira', '#'),
      }),
    },
    {
      id: 'interno_lead',
      nome: 'Nova lead (backoffice)',
      publico: 'equipa',
      assunto: 'Nova lead',
      quando: 'Cada lead registada. Também há um para nova conversa e outro para escalada.',
      descricao:
        'Mesmo molde, com duas diferenças: o cabeçalho diz BackOffice e o rodapé perde a nota '
        + 'de RGPD — dizer "usamos os seus dados apenas para tratar o seu pedido" a quem trabalha '
        + 'cá não quer dizer nada, e a repetição gasta a frase para quando ela importa.',
      manual: false,
      render: () => envelope({
        interno: true,
        resumo: '#A3F91 — Helder Caldas · 48.00 EUR',
        titulo: 'Nova lead registada',
        corpo: cartao(lista([
          ['Referência', '#A3F91'], ['Lead', 'Helder Caldas'], ['Telefone', '961220881'],
          ['Rota', 'Av. Central 578 → Rua das Flores 12'], ['Preço', '48.00 EUR'],
        ])) + botao('Abrir Dashboard', '#'),
      }),
    },
  ];

  return [...cartas, ...automaticos];
}

export function modelo(id: string, textos?: Partial<Record<string, TextoCarta>>): ModeloEmail | undefined {
  return catalogo(textos).find((m) => m.id === id);
}
