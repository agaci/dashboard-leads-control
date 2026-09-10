import { esc } from '@/lib/html';
import { COR } from '@/lib/email/layout';

/**
 * Páginas de confirmação para quem clica num link assinado.
 *
 * Quem chega aqui é um parceiro ou um cliente com o telemóvel na mão, não um operador ao
 * computador — e chega vindo de um email nosso. Por isso partilham a paleta e o cabeçalho
 * com lib/email/layout.ts: a pessoa carrega num botão e aterra numa página que se parece
 * com a mensagem de onde veio. Duas identidades diferentes na mesma acção fazem qualquer
 * uma delas parecer falsa, ainda por cima quando o que se pede é uma autorização.
 *
 * O símbolo é servido por nós, na mesma origem — nunca depende de um domínio de imagens.
 */

const LOGO = '/icons/yourbox-simbolo.png';

/**
 * O cabeçalho da marca.
 *
 * Símbolo mais o nome escrito, como nos emails: se a imagem não carregar — rede fraca no
 * telemóvel, que é onde isto é aberto — continua a ler-se YourBox em vez de ficar um
 * quadrado vazio numa página que pede uma decisão.
 */
function marca(): string {
  return `<div style="display:flex;align-items:center;justify-content:center;gap:9px;margin:0 0 22px">
<img src="${LOGO}" width="30" height="32" alt="YourBox" style="display:block;border:0;width:30px;height:32px">
<span style="text-align:left;line-height:1.1">
  <span style="display:block;font-size:16px;font-weight:700;color:${COR.escuro};letter-spacing:-.2px">YourBox</span>
  <span style="display:block;font-size:9.5px;color:${COR.suave};letter-spacing:.6px;text-transform:uppercase">estafetas e transportes</span>
</span>
</div>`;
}

function moldura(titulo: string, dentro: string, largura = 440, alinhamento: 'center' | 'left' = 'center'): Response {
  return new Response(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<link rel="icon" href="${LOGO}">
<title>${esc(titulo)}</title></head>
<body style="font-family:system-ui,-apple-system,Helvetica,Arial,sans-serif;background:${COR.fundo};color:${COR.texto};margin:0;display:flex;min-height:100vh;align-items:${alinhamento === 'left' ? 'flex-start' : 'center'};justify-content:center;padding:20px">
<div style="background:${COR.cartao};border:1px solid ${COR.linha};border-radius:16px;padding:32px 28px;max-width:${largura}px;width:100%;text-align:${alinhamento};box-shadow:0 1px 2px rgba(35,39,42,.05),0 14px 32px -16px rgba(35,39,42,.25)">
${marca()}
${dentro}
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** Página de resultado: correu bem, ou não há nada a fazer. */
export function paginaHtml(titulo: string, corpo: string, ok = true): Response {
  const sinal = ok
    ? `<div style="width:52px;height:52px;border-radius:50%;margin:0 auto 18px;background:${COR.lima};display:flex;align-items:center;justify-content:center;font-size:25px;color:${COR.escuro};font-weight:700;line-height:1">&#10003;</div>`
    : `<div style="width:52px;height:52px;border-radius:50%;margin:0 auto 18px;background:${COR.fundo};border:1px solid ${COR.linha};display:flex;align-items:center;justify-content:center;font-size:25px;color:${COR.suave};font-weight:700;line-height:1">&#33;</div>`;

  return moldura(titulo, `${sinal}
<h1 style="font-size:19px;color:${COR.escuro};margin:0 0 10px;line-height:1.3">${esc(titulo)}</h1>
<div style="color:${COR.texto};font-size:14px;line-height:1.6">${corpo}</div>`);
}

/**
 * Página com botões — a escolha que o link deixou por fazer.
 *
 * Todos os botões iguais, de propósito. Nas duas utilizações que tem — autorizar ou não
 * autorizar, e o motivo de uma recusa — destacar uma das respostas seria desenhar para a
 * obter. No caso da autorização isso invalidaria o consentimento.
 */
export function paginaEscolha(titulo: string, texto: string, opcoes: { label: string; url: string }[]): Response {
  const botoes = opcoes
    .map((o) => `<a href="${esc(o.url)}" style="display:inline-block;background:${COR.escuro};color:#fff;font-weight:600;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin:4px">${esc(o.label)}</a>`)
    .join('');

  return moldura(titulo, `<h1 style="font-size:19px;color:${COR.escuro};margin:0 0 10px;line-height:1.3">${esc(titulo)}</h1>
<p style="color:${COR.texto};font-size:14px;line-height:1.6;margin:0 0 20px">${texto}</p>
<div>${botoes}</div>`);
}

/**
 * Página com conteúdo próprio — um formulário, tipicamente.
 *
 * Mesma marca e mesma paleta das outras, mas alinhada à esquerda e mais larga: um
 * formulário centrado com campos ao meio lê-se mal, e quem o preenche está a trabalhar,
 * não a receber uma confirmação.
 */
export function paginaConteudo(titulo: string, dentro: string, largura = 620): Response {
  return moldura(titulo, dentro, largura, 'left');
}
