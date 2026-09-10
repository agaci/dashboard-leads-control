import { esc } from '@/lib/html';

/**
 * O aspecto dos nossos emails, num sítio só.
 *
 * Cada email era montado à mão com o seu HTML, e o resultado eram mensagens da mesma
 * empresa com cinco desenhos diferentes — umas com logótipo, outras sem, cores que não
 * batiam certo. Isto passa a ser o molde de todos.
 *
 * Escrito para clientes de email, que não são browsers:
 *
 *   - **Tabelas, não flex nem grid.** O Outlook desenha com o motor do Word e ignora
 *     `display:flex`. Uma tabela de uma coluna é feia de escrever e é o que funciona em
 *     todo o lado.
 *   - **Estilos em linha.** Gmail apaga `<style>` em parte dos contextos.
 *   - **A marca não pode depender da imagem.** Gmail e Outlook bloqueiam imagens de
 *     remetentes desconhecidos por omissão, e é precisamente o primeiro email que é de
 *     um remetente desconhecido. Por isso o cabeçalho tem o símbolo E o nome escrito em
 *     texto: com as imagens bloqueadas continua a ler-se YourBox.
 *   - **Sem emojis**, aqui como no resto da casa.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://leads.comgo.pt').replace(/\/$/, '');

/** O símbolo, servido por nós. 96px de largura para o mostrar a 48 sem borrar em retina. */
export const LOGO_URL = `${APP_URL}/icons/yourbox-simbolo.png`;

export const COR = {
  lima: '#bed62f',
  escuro: '#2f3337',
  texto: '#3d4348',
  suave: '#7c858c',
  linha: '#e8ebee',
  fundo: '#f4f6f7',
  cartao: '#ffffff',
  avisoFundo: '#fbfbf4',
  avisoLinha: '#e6ecc4',
} as const;

export interface Envelope {
  /** Linha que o cliente de email mostra na caixa de entrada, a seguir ao assunto. */
  resumo: string;
  titulo: string;
  /** Uma frase por baixo do título. Opcional. */
  subtitulo?: string;
  /** HTML já montado — usar `cartao`, `paragrafo`, `botao`, `lista`. */
  corpo: string;
  /** Texto legal específico deste email, acrescentado ao rodapé comum. */
  rodape?: string;
  /**
   * Email para a equipa, não para um cliente.
   *
   * Muda duas coisas. O rodapé perde o texto de RGPD — dizer "usamos os seus dados
   * apenas para tratar o seu pedido" a quem trabalha cá não quer dizer nada, e a
   * repetição gasta a frase para quando ela importa. E o cabeçalho ganha a marca
   * BackOffice, para a gerente de conta distinguir num relance o que lhe é dirigido do
   * que é uma cópia de algo que saiu para um cliente.
   */
  interno?: boolean;
}

/**
 * O molde completo.
 *
 * O título vai em texto sobre fundo claro e não numa faixa de cor: uma faixa colorida
 * com texto por cima é a primeira coisa a partir-se quando o cliente de email força o
 * modo escuro, e passa a ser texto preto sobre preto.
 */
export function envelope(o: Envelope): string {
  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-font-smoothing:antialiased">
<div style="display:none;font-size:1px;color:${COR.fundo};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(o.resumo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${COR.cartao};border:1px solid ${COR.linha};border-radius:14px;overflow:hidden">

  <tr><td style="padding:22px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:10px;vertical-align:middle">
        <img src="${LOGO_URL}" width="34" height="36" alt="YourBox" style="display:block;border:0;width:34px;height:36px">
      </td>
      <td style="vertical-align:middle">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:${COR.escuro};letter-spacing:-0.2px;line-height:1.1">YourBox</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;color:${COR.suave};letter-spacing:0.6px;text-transform:uppercase;line-height:1.4">${o.interno ? 'BackOffice' : 'estafetas e transportes'}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <h1 style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:21px;line-height:1.3;font-weight:700;color:${COR.escuro}">${esc(o.titulo)}</h1>
    ${o.subtitulo ? `<p style="margin:7px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:${COR.texto}">${o.subtitulo}</p>` : ''}
  </td></tr>

  <tr><td style="padding:18px 28px 26px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.texto}">
    ${o.corpo}
  </td></tr>

  <tr><td style="padding:16px 28px 20px;background:#fafbfb;border-top:1px solid ${COR.linha};font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#9aa2a8">
    ${o.rodape ? `<p style="margin:0 0 8px">${o.rodape}</p>` : ''}
    ${o.interno ? `<p style="margin:0">YourBox BackOffice &middot; ${esc(new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }))}</p>` : `<p style="margin:0">
      <strong style="color:#7c858c">YourBox &ndash; estafetas e transportes</strong><br>
      <a href="tel:+351214304546" style="color:#9aa2a8;text-decoration:none">214 304 546</a> &nbsp;&middot;&nbsp;
      <a href="mailto:info@yourbox.com.pt" style="color:#9aa2a8;text-decoration:none">info@yourbox.com.pt</a>
    </p>
    <p style="margin:8px 0 0">
      Usamos os seus dados apenas para tratar o seu pedido de transporte e falar consigo.
      Para aceder, corrigir ou apagar os seus dados, responda a este email &mdash; ver a
      <a href="https://yourbox.com.pt/politica_de_privacidade.html" style="color:#9aa2a8">Politica de Privacidade</a>.
    </p>`}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── peças para montar o corpo ────────────────────────────────────────────────

export function paragrafo(html: string, margemTopo = 0): string {
  return `<p style="margin:${margemTopo}px 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.texto}">${html}</p>`;
}

/** Bloco destacado — o resumo do pedido, um aviso, o texto de uma autorização. */
export function cartao(html: string, tom: 'neutro' | 'aviso' = 'neutro'): string {
  const fundo = tom === 'aviso' ? COR.avisoFundo : '#fafbfb';
  const linha = tom === 'aviso' ? COR.avisoLinha : COR.linha;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">
<tr><td style="background:${fundo};border:1px solid ${linha};border-radius:10px;padding:14px 16px;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:${COR.texto}">${html}</td></tr></table>`;
}

/**
 * Botão.
 *
 * Uma tabela e não um `<a>` com padding porque o Outlook ignora o padding vertical de um
 * link e o botão fica com um risco de altura. `primario` é escuro e `neutro` é branco
 * com contorno — os dois com o mesmo tamanho, para quando são uma escolha e não uma
 * chamada à acção.
 */
export function botao(label: string, url: string, tipo: 'primario' | 'neutro' = 'primario'): string {
  const fundo = tipo === 'primario' ? COR.escuro : '#ffffff';
  const cor = tipo === 'primario' ? '#ffffff' : COR.escuro;
  const borda = tipo === 'primario' ? COR.escuro : '#cdd4d9';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 6px 8px 0">
<tr><td style="background:${fundo};border:1px solid ${borda};border-radius:8px">
<a href="${esc(url)}" style="display:block;padding:11px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${cor};text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

/** Pares chave/valor — o resumo de um pedido. Rótulo por cima, valor por baixo. */
export function lista(itens: [string, string | null | undefined][]): string {
  const linhas = itens
    .filter(([, v]) => String(v ?? '').trim())
    .map(([k, v], i) => `<tr><td style="padding:${i ? 9 : 0}px 0 0;border-top:${i ? `1px solid ${COR.linha}` : 'none'}">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};padding-top:${i ? 9 : 0}px">${esc(k)}</div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:${COR.escuro};font-weight:600;padding-top:2px">${esc(String(v))}</div>
</td></tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${linhas}</table>`;
}

/** Passos numerados, com a barra lima à esquerda. */
export function passos(itens: { titulo: string; texto: string }[]): string {
  return itens.map((p, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
<tr><td style="border-left:3px solid ${COR.lima};padding:2px 0 2px 12px;font-family:Helvetica,Arial,sans-serif">
<div style="font-size:13.5px;font-weight:700;color:${COR.escuro}">${i + 1}. ${esc(p.titulo)}</div>
<div style="font-size:13px;line-height:1.55;color:${COR.texto};padding-top:2px">${p.texto}</div>
</td></tr></table>`).join('');
}
