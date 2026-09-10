# Prompt para a plataforma YourBox antiga (Meteor / nodechef) — desenho dos emails

> Para colar num agente a trabalhar no repositório do `weby-5204.nodechef.com`.
> A cópia de referência que temos deste código é `docs/api.js` e `docs/methods/`.

---

## Contexto

A plataforma nova (`leads.comgo.pt`) reescreveu todos os seus emails com um molde único.
Falta fazer o mesmo aqui, para as duas plataformas deixarem de parecer duas empresas.

Neste momento, cada um dos 21 pontos de envio monta o seu HTML à mão: uns têm faixa lima,
outros faixa azul-escura, outros nem cabeçalho têm; uns usam `<table>`, outros `<div>` com
`<style>` no `<head>`; os assuntos misturam emojis (✅ 🔔 💼 📅 🔥) com texto. O cliente que
receba dois emails nossos no mesmo dia vê duas identidades diferentes.

**O objectivo: um só molde, aplicado aos 21, sem excepção.**

---

## As regras do molde

Não são gosto pessoal — cada uma responde a uma coisa que se parte num cliente de email.

1. **Tabelas, nunca `flex` nem `grid`.** O Outlook desenha com o motor do Word e ignora
   `display:flex`. Há emails aqui com `display:flex` no cabeçalho — no Outlook, o logótipo
   e o título aparecem um por baixo do outro.
2. **Estilos em linha, nunca `<style>` no `<head>`.** O Gmail apaga o `<style>` em parte
   dos contextos, sobretudo no webmail com várias contas. Vários ficheiros de
   `methods/` dependem inteiramente de um `<style>` no `<head>`.
3. **A marca não pode depender da imagem.** O Gmail e o Outlook bloqueiam imagens de
   remetentes desconhecidos por omissão. O cabeçalho leva o símbolo **e** o nome escrito
   em texto: com as imagens bloqueadas continua a ler-se YourBox. Toda a `<img>` leva
   `alt`.
4. **Título em texto sobre fundo claro, não numa faixa de cor.** Uma faixa lima com texto
   por cima é a primeira coisa a partir-se quando o cliente força o modo escuro — passa a
   preto sobre preto. O lima fica nas barras laterais e nos contornos, onde não carrega
   texto.
5. **Zero emojis**, no corpo e no assunto. É regra em toda a stack.
6. **Botões em `<table>`, não `<a>` com padding.** O Outlook ignora o padding vertical de
   um link e o botão fica com um risco de altura.
7. **Escapar tudo o que vem de fora.** Nome do cliente, morada, observações, mensagens.
   Vários destes emails interpolam texto de utilizador directamente no HTML.
8. **Largura máxima 560 px**, e o email inteiro abaixo de 100 KB (o Gmail corta aos 102 e
   esconde o resto atrás de "mensagem truncada").

---

## O molde

Criar `imports/emails/molde.js`:

```js
/**
 * O aspecto de todos os emails da YourBox.
 *
 * Escrito para clientes de email, que nao sao browsers: tabelas em vez de flex (Outlook
 * desenha com o motor do Word), estilos em linha (o Gmail apaga o <style>), e a marca em
 * texto ao lado do simbolo (Gmail e Outlook bloqueiam imagens de remetentes desconhecidos).
 *
 * Igual ao molde da plataforma nova, em lib/email/layout.ts.
 */
import { Meteor } from 'meteor/meteor';

const URL_IMAGENS = () => Meteor.settings.urlForEmailsImages || 'https://yourbox.com.pt/';
const LOGO = () => URL_IMAGENS() + 'yourbox-simbolo.png';

export const COR = {
  lima:       '#bed62f',
  escuro:     '#2f3337',
  texto:      '#3d4348',
  suave:      '#7c858c',
  linha:      '#e8ebee',
  fundo:      '#f4f6f7',
  cartao:     '#ffffff',
  avisoFundo: '#fbfbf4',
  avisoLinha: '#e6ecc4',
};

/** Escapa o que vem de fora. Nome, morada, observacoes: nada entra em HTML sem passar aqui. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * O molde completo.
 *
 * @param {Object}  o
 * @param {string}  o.resumo     linha que o cliente de email mostra na caixa de entrada
 * @param {string}  o.titulo     escapado automaticamente — passar texto simples
 * @param {string} [o.subtitulo] HTML permitido (uma frase por baixo do titulo)
 * @param {string}  o.corpo      HTML ja montado com cartao/lista/botao/paragrafo/passos
 * @param {string} [o.rodape]    texto legal especifico deste email
 * @param {boolean}[o.interno]   email para a equipa, nao para um cliente
 */
export function envelope(o) {
  const rodapeCliente = `<p style="margin:0">
      <strong style="color:#7c858c">YourBox &ndash; estafetas e transportes</strong><br>
      <a href="tel:+351214304546" style="color:#9aa2a8;text-decoration:none">214 304 546</a> &nbsp;&middot;&nbsp;
      <a href="mailto:info@yourbox.com.pt" style="color:#9aa2a8;text-decoration:none">info@yourbox.com.pt</a>
    </p>
    <p style="margin:8px 0 0">
      Usamos os seus dados apenas para tratar o seu pedido de transporte e falar consigo.
      Para aceder, corrigir ou apagar os seus dados, responda a este email &mdash; ver a
      <a href="https://yourbox.com.pt/politica_de_privacidade.html" style="color:#9aa2a8">Politica de Privacidade</a>.
    </p>`;

  const rodapeInterno = `<p style="margin:0">YourBox BackOffice &middot; ${
    esc(new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }))}</p>`;

  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-font-smoothing:antialiased">
<div style="display:none;font-size:1px;color:${COR.fundo};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(o.resumo || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${COR.cartao};border:1px solid ${COR.linha};border-radius:14px;overflow:hidden">

  <tr><td style="padding:22px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:10px;vertical-align:middle">
        <img src="${LOGO()}" width="34" height="36" alt="YourBox" style="display:block;border:0;width:34px;height:36px">
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
    ${o.interno ? rodapeInterno : rodapeCliente}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── pecas para montar o corpo ────────────────────────────────────────────────

export function paragrafo(html, margemTopo) {
  return `<p style="margin:${margemTopo || 0}px 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.texto}">${html}</p>`;
}

/** Bloco destacado. `tom` = 'neutro' (resumos) ou 'aviso' (o que precisa de atencao). */
export function cartao(html, tom) {
  const fundo = tom === 'aviso' ? COR.avisoFundo : '#fafbfb';
  const linha = tom === 'aviso' ? COR.avisoLinha : COR.linha;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">
<tr><td style="background:${fundo};border:1px solid ${linha};border-radius:10px;padding:14px 16px;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:${COR.texto}">${html}</td></tr></table>`;
}

/**
 * Botao. Uma tabela e nao um <a> com padding: o Outlook ignora o padding vertical de um
 * link e o botao fica com um risco de altura.
 *
 * `primario` e escuro, `neutro` e branco com contorno. Quando os botoes sao uma ESCOLHA
 * — e nao uma chamada a accao — todos neutros, para nao induzir a resposta.
 */
export function botao(label, url, tipo) {
  const primario = tipo !== 'neutro';
  const fundo = primario ? COR.escuro : '#ffffff';
  const cor = primario ? '#ffffff' : COR.escuro;
  const borda = primario ? COR.escuro : '#cdd4d9';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 6px 8px 0">
<tr><td style="background:${fundo};border:1px solid ${borda};border-radius:8px">
<a href="${esc(url)}" style="display:block;padding:11px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${cor};text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

/**
 * Pares rotulo/valor — o resumo de um servico. Recebe [['Rotulo', valor], ...] e ignora
 * as linhas sem valor, para nao aparecerem campos vazios. Escapa tudo.
 */
export function lista(itens) {
  const linhas = itens
    .filter((par) => String(par[1] === null || par[1] === undefined ? '' : par[1]).trim())
    .map((par, i) => `<tr><td style="padding:${i ? 9 : 0}px 0 0;border-top:${i ? `1px solid ${COR.linha}` : 'none'}">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:${COR.suave};padding-top:${i ? 9 : 0}px">${esc(par[0])}</div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:${COR.escuro};font-weight:600;padding-top:2px">${esc(par[1])}</div>
</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${linhas}</table>`;
}

/** Passos numerados com a barra lima a esquerda. Usar so quando ha mesmo uma sequencia. */
export function passos(itens) {
  return itens.map((p, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
<tr><td style="border-left:3px solid ${COR.lima};padding:2px 0 2px 12px;font-family:Helvetica,Arial,sans-serif">
<div style="font-size:13.5px;font-weight:700;color:${COR.escuro}">${i + 1}. ${esc(p.titulo)}</div>
<div style="font-size:13px;line-height:1.55;color:${COR.texto};padding-top:2px">${p.texto}</div>
</td></tr></table>`).join('');
}
```

### O símbolo

O ficheiro está na plataforma nova em `public/icons/yourbox-simbolo.png` — PNG com
transparência, 96×101 px, 3,1 KB, gerado do `logo_original_simples.png`.

Copiar para o mesmo sítio onde já vive o `logotipo2021_cor_final.png`, ou seja onde o
`Meteor.settings.urlForEmailsImages` aponta. **Não referenciar o ficheiro que está em
`leads.comgo.pt`:** estes emails têm de continuar a sair mesmo com essa plataforma em
baixo — é precisamente essa a função desta.

---

## Os 21 pontos de envio

Linhas da cópia de referência; confirmar com `grep -rn "Email.send"` antes de mexer.

### `api.js` — 12

| Linha | Assunto actual | Para | Trata-se de |
|---|---|---|---|
| 6361 | `Recebemos sua solicitação de cotação - YourBox` | cliente | cotação recebida |
| 6681 | `🔔 NOVO LEAD - <nome> (Variante <v>)` | `info@yourbox.com.pt` | **interno** |
| 6747 | `✅ Pedido Recebido - Yourbox` | cliente | confirmação de pedido |
| 7232 | `✅ Preço Garantido - YourBox \| Ref: <ts>` | cliente | preço garantido |
| 7364 | `Recebemos sua solicitação de cotação - YourBox` | cliente | cotação recebida |
| 7986 | `💼 Nova Candidatura - <área> - <nome>` | `rh@yourbox.com.pt` | **interno** |
| 7997 | `Candidatura Recebida - YourBox Carreiras` | candidato | candidatura |
| 8266 | `📅 Novo Agendamento - Apresentação Plataforma - <empresa>` | `info@yourbox.com.pt` | **interno** |
| 8276 | `Pedido de Demonstração Recebido - YourBox` | cliente | demonstração |
| 8671 | `✅ Vamos ligar-lhe em <hora>! - YourBox` | cliente | callback confirmado |
| 8751 | `🔥 CALLBACK URGENTE - <nome> - <telefone>` | `hjbdmc@gmail.com` | **interno** |
| 9430 | `<titulo> - YourBox \| Ref: <ts>` | cliente | genérico |

**Nota sobre a linha 8751:** o destinatário está escrito à mão no código
(`hjbdmc@gmail.com`), com o comentário *"Hardcoded igual ao que funciona"*. Não é do
âmbito desta tarefa, mas convém passar para `Meteor.settings` — um alerta urgente que
depende de um endereço pessoal deixa de chegar no dia em que essa pessoa sair.

**Nota sobre a linha 6747:** este é o email de confirmação ao cliente, que a plataforma
nova passou a enviar. Há uma tarefa à parte para o condicionar — ver
`PROMPT-NODECHEF-EMAIL-CLIENTE.md`. As duas tarefas não colidem: uma muda o desenho,
a outra decide se sai. Faça-se o desenho na mesma; ele continua a ser necessário para
quando a plataforma nova estiver em baixo.

### `methods/` — 9 alertas + 3

Todos com o mesmo problema estrutural: documento HTML completo, com `<style>` no `<head>`,
que o Gmail apaga.

| Ficheiro | Para | Trata-se de |
|---|---|---|
| `email_sendAlertForRequested.js` | caixa de alertas | serviço lançado |
| `email_sendAlertForRequestedAfter.js` | caixa de alertas | aguarda indexação |
| `email_sendAlertForIndexedServices.js` | caixa de alertas | serviço indexado |
| `email_sendAlertForArrivalPoint.js` | caixa de alertas | chegada ao local |
| `email_sendAlertForExecutedPointService.js` | caixa de alertas | ponto executado |
| `email_sendAlertForExecutedService.js` | caixa de alertas | serviço executado |
| `email_sendAlertHangingService.js` | caixa de alertas | não indexado |
| `email_sendInvalidatedService.js` | caixa de alertas | cancelado / invalidado |
| `email_sendAlertRecipientToPointForConfirmExecuted.js` | **cliente** | ponto executado |
| `email_sendEmailToRecipients.js` | **cliente** | rastreio do serviço |
| `email_sendEmailToProvider.js` | **parceiro** | pedido urgente de estafeta |
| `email_sendEmailPriceApi.js` | **cliente** | cotação recebida |
| `email_teste_mailjet.js` | — | teste; migrar ou apagar |

---

## Como migrar cada um

O padrão é sempre o mesmo. Antes:

```js
Email.send({
  to: email,
  from: ...,
  subject: "✅ Pedido Recebido - Yourbox",
  html: '<div style="font-family: Arial...">' + /* 80 linhas de concatenacao */ + '</div>',
});
```

Depois:

```js
import { envelope, cartao, lista, botao, paragrafo } from '/imports/emails/molde.js';

Email.send({
  to: email,
  from: ...,
  subject: 'Pedido recebido',
  html: envelope({
    resumo: 'Recebemos o seu pedido e entramos em contacto consigo em breve.',
    titulo: 'Pedido recebido, ' + primeiroNome,
    subtitulo: 'Ja o temos connosco. Entramos em contacto consigo em breve.',
    corpo: cartao(
      '<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:#7c858c;margin-bottom:10px">O seu pedido</div>'
      + lista([
        ['Recolha', origem],
        ['Entrega', destino],
        ['Urgencia', urgencia],
      ])
    ),
  }),
});
```

**Regras da migração:**

- **Para cliente ou parceiro:** `envelope({...})` sem `interno`. Rodapé com contactos e
  a nota de RGPD.
- **Para a equipa** (`info@`, `rh@`, caixas de alertas, o `hjbdmc@`): `interno: true`.
  O cabeçalho passa a dizer *BackOffice* e o rodapé perde a nota de RGPD — dizer "usamos
  os seus dados apenas para tratar o seu pedido" a quem trabalha cá não quer dizer nada,
  e a repetição gasta a frase para quando ela importa.
- **Tabelas de dados** (nº do serviço, pontos, horas, moradas) passam a `lista([...])`,
  que escapa tudo e ignora os campos vazios.
- **Ligações de acção** (rastrear, confirmar, abrir) passam a `botao(label, url)`.
- **Quando os botões são uma escolha** e não uma chamada à acção, todos `'neutro'`: o
  mesmo tamanho e o mesmo contraste, para não induzir a resposta.
- **`resumo`** é obrigatório e não é decorativo: é a linha que o Gmail e o Outlook mostram
  a seguir ao assunto na caixa de entrada. Sem ela, aparece o início do HTML.
- **Nunca passar HTML no `titulo`** — é escapado. Passar em `subtitulo` ou `corpo`.

### Os assuntos

Tirar os emojis. Todos.

| Antes | Depois |
|---|---|
| `✅ Pedido Recebido - Yourbox` | `Pedido recebido` |
| `🔔 NOVO LEAD - <nome> (Variante <v>)` | `Nova lead — <nome> (variante <v>)` |
| `💼 Nova Candidatura - <área> - <nome>` | `Nova candidatura — <área> — <nome>` |
| `📅 Novo Agendamento - Apresentação Plataforma - <empresa>` | `Nova apresentação agendada — <empresa>` |
| `🔥 CALLBACK URGENTE - <nome> - <telefone>` | `Callback urgente — <nome> — <telefone>` |
| `✅ Preço Garantido - YourBox \| Ref: <ts>` | `Preço garantido — ref. <ts>` |
| `✅ Vamos ligar-lhe em <hora>! - YourBox` | `Vamos ligar-lhe às <hora>` |

Tirar também o `- YourBox` do fim: o remetente já diz YourBox, e o assunto é espaço caro
no telemóvel. E capitalização normal, não Título A Cada Palavra.

---

## Como confirmar

Não há testes automáticos deste lado, por isso a verificação é manual e vale a pena
fazê-la a sério — um email partido só se descobre quando um cliente o recebe.

1. **Um de cada tipo, para uma caixa real.** Um para cliente, um interno, um de alerta de
   `methods/`. Abrir no Gmail (web), no Outlook (aplicação de Windows, não a web) e no
   telemóvel.
2. **Com as imagens bloqueadas.** No Gmail: Definições → Imagens → *Perguntar antes de
   mostrar*. Tem de continuar a ler-se **YourBox** no topo.
3. **Grep final**, que não pode devolver nada:
   ```sh
   grep -rn "display:flex" --include="*.js" .            # nenhum email pode ter
   grep -rn "<style>" --include="email_*.js" methods/    # nenhum
   grep -rn "✅\|🔔\|💼\|📅\|🔥\|⭐\|🚀\|📋\|🎉\|❌\|📊" --include="*.js" .
   ```
4. **Contar os envios:** `grep -rn "Email.send" --include="*.js" . | wc -l` tem de dar 21,
   e todos têm de chamar `envelope(...)`. Se algum ficou de fora, é o que vai chegar ao
   cliente com o desenho antigo.

---

## Referência

O molde original está na plataforma nova, em `lib/email/layout.ts`, com as mesmas cores e
a mesma estrutura. As páginas que os links dos emails abrem usam o mesmo cabeçalho
(`lib/pagina.ts`), para quem clica num botão aterrar numa página que se parece com a
mensagem de onde veio.
