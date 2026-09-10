# Prompt para a plataforma YourBox antiga (Meteor / nodechef)

> Para colar num agente a trabalhar no repositório do `weby-5204.nodechef.com`.
> O ficheiro a alterar é o `api.js` (a cópia de referência que temos aqui é `docs/api.js`).

---

## Contexto

O quiz do site chama duas plataformas em paralelo com a mesma lead:

| Plataforma | Endpoint | Papel |
|---|---|---|
| YourBox antiga (esta) | `POST /api/submitDirectLead` | cria a lead oficial, envia email ao backoffice **e ao cliente** |
| leads.comgo.pt | `POST /api/quiz-progress` | cria a lead do dashboard, classifica-a, e **passou a enviar o email ao cliente** |

As duas passaram a enviar a confirmação, e o cliente recebe duas mensagens quase iguais
com segundos de diferença.

O email mudou de lado por uma razão concreta e não por gosto: o `leads.comgo.pt` classifica
a lead no mesmo pedido HTTP em que o email sai, e quando o transporte é dos que a YourBox
não faz a mensagem leva lá dentro o pedido de autorização (RGPD) para o pedido seguir para
uma empresa especializada. Aqui, essa classificação ainda não existe quando o `Email.send`
corre — não há forma de a esperar.

**A chamada a este endpoint mantém-se e não deve mudar.** Ele é a redundância: se o
`leads.comgo.pt` estiver em baixo, a lead entra na mesma por aqui, e nessa altura o email
ao cliente tem de voltar a sair daqui.

---

## O que fazer

Não apagar nem comentar o bloco do email ao cliente. Envolvê-lo numa condição que
consulta um documento na base de dados partilhada.

### Porque não é um interruptor manual

A altura em que é preciso ligar este email é exactamente a altura em que o
`leads.comgo.pt` está em baixo — e aí ninguém consegue abrir esse dashboard para carregar
no botão. Um failsafe que depende de alguém o accionar durante a avaria não é um failsafe.

Por isso a decisão é tomada por um **pulso**: o `leads.comgo.pt` carimba um documento de
minuto a minuto (cron) e a cada lead que trata. Este endpoint olha para a idade desse
carimbo antes de enviar.

- pulso fresco → o outro lado está vivo e já enviou. Este cala-se.
- pulso velho → ninguém enviou. Este envia, e o cliente não fica sem confirmação.

Recupera sozinho, sem intervenção humana, nos dois sentidos.

### O contrato

Base de dados **`weby`** (a mesma que já usam), colecção **`platformStatus`**,
documento **`_id: 'emailConfirmacaoCliente'`**:

```js
{
  _id: 'emailConfirmacaoCliente',
  modo: 'auto' | 'nodechef' | 'leads',  // 'auto' e o normal
  pulsoEm: ISODate,                     // escrito so pelo leads.comgo.pt
  actor: String,                        // quem mudou o modo, quando nao e auto
  updatedAt: ISODate,
}
```

**Este lado só lê. Nunca escreve neste documento.**

Regra de decisão, com a janela em **5 minutos**:

| `modo` | Enviar o email ao cliente? |
|---|---|
| `'nodechef'` | sim, sempre (forçado — manutenção ou teste do outro lado) |
| `'leads'` | não, nunca (forçado) |
| `'auto'` (ou em falta, ou valor desconhecido) | só se `pulsoEm` faltar ou tiver mais de 5 minutos |

**A falha é sempre para o lado de enviar.** Documento em falta, colecção vazia, campo
corrompido, erro a ler a base de dados: envia. Um cliente a receber dois emails é um
incómodo; um cliente a não receber nenhum é um pedido que parece ter-se perdido.

---

## A alteração no código

### 1. Importar a colecção

No topo do `api.js` já existe:

```js
import {
  Services, /* ... */ ServerSettings, ApiCounters, Messages,
} from "../imports/api/collections.js";
```

Declarar a colecção nova em `imports/api/collections.js`, ao lado das outras:

```js
export const PlatformStatus = new Mongo.Collection("platformStatus");
```

e acrescentá-la ao import do `api.js`.

### 2. A função de decisão

Perto do topo do `api.js`, antes dos endpoints:

```js
/**
 * O leads.comgo.pt esta vivo e ja enviou a confirmacao ao cliente?
 *
 * Le o pulso que essa plataforma carimba de minuto a minuto na base de dados
 * partilhada. Enquanto o pulso for fresco, o email de confirmacao sai de la e este lado
 * cala-se; quando envelhecer, assume-se que esta em baixo e o email volta a sair daqui.
 *
 * Em caso de duvida devolve `true` (envia): um cliente com dois emails e um incomodo, um
 * cliente sem nenhum e um pedido que parece ter-se perdido.
 */
const PULSO_VALIDADE_MS = 5 * 60 * 1000;

function deveEnviarEmailAoCliente() {
  try {
    const doc = PlatformStatus.findOne({ _id: "emailConfirmacaoCliente" });
    if (!doc) return true;
    if (doc.modo === "nodechef") return true;
    if (doc.modo === "leads") return false;
    // 'auto', ou qualquer valor desconhecido: decide o pulso.
    const pulso = doc.pulsoEm ? new Date(doc.pulsoEm).getTime() : 0;
    return !pulso || Date.now() - pulso > PULSO_VALIDADE_MS;
  } catch (err) {
    console.error("Falha a ler o estado do email de confirmacao:", err);
    return true;
  }
}
```

### 3. Envolver o bloco

No endpoint `submitDirectLead`, o bloco a condicionar começa no comentário
`// EMAIL PARA CLIENTE` e acaba no `catch (emailError)` que lhe pertence — na cópia de
referência, linhas **6745 a 6820** do `docs/api.js`.

```js
          // EMAIL PARA CLIENTE
          //
          // Sai daqui apenas quando o leads.comgo.pt nao o tiver enviado — normalmente
          // porque esta em baixo. Ver deveEnviarEmailAoCliente().
          if (deveEnviarEmailAoCliente()) {
            try {
              Email.send({ /* ... tudo como esta ... */ });
            } catch (emailError) {
              console.error("Erro ao enviar email para cliente:", emailError);
            }
          } else {
            console.log("Email ao cliente: enviado pelo leads.comgo.pt, nao repetido.");
          }
```

---

## O que NÃO alterar

- **O email para o backoffice** (o bloco `// EMAIL PARA BACKOFFICE`, logo antes). Esse
  continua a sair sempre daqui, sem condição nenhuma.
- **A criação da lead** (`Messages.insert`) e a resposta do endpoint. Este lado tem de
  continuar a receber e a registar todas as leads — é isso que o torna a redundância.
- **O conteúdo do email**. Não vale a pena mexer no template: quando ele sai, sai porque
  o outro lado está em baixo, e nessa altura o que importa é chegar.

---

## Como confirmar que ficou bem

Com o `leads.comgo.pt` a funcionar normalmente (pulso a bater), na consola do Mongo:

```js
// 1. Estado normal: o pulso e fresco, este lado nao deve enviar.
db.platformStatus.findOne({ _id: "emailConfirmacaoCliente" })
// -> { modo: 'auto', pulsoEm: <ha menos de 5 min> }
//    Submeter uma lead de teste: o cliente recebe UM email, vindo do leads.comgo.pt.

// 2. Simular o outro lado em baixo, envelhecendo o pulso a mao.
db.platformStatus.updateOne(
  { _id: "emailConfirmacaoCliente" },
  { $set: { pulsoEm: new Date(Date.now() - 30 * 60 * 1000) } }
)
//    Submeter outra lead: o cliente recebe UM email, agora vindo do nodechef.
//    (O cron do outro lado repoe o pulso dentro de um minuto.)

// 3. Falha segura: sem documento nenhum, este lado envia.
db.platformStatus.deleteOne({ _id: "emailConfirmacaoCliente" })
//    Submeter uma lead: o cliente recebe o email do nodechef.
//    O documento e recriado pelo proximo pulso do leads.comgo.pt.
```

Em nenhum dos três casos o cliente pode ficar sem email, e no caso 1 não pode receber dois.

---

## Do outro lado (já feito, para referência)

- `GET /api/cron/pulso?key=<CRON_SECRET>` — carimba `pulsoEm`, chamado de minuto a minuto
  pelo crontab do servidor. Também é carimbado a cada confirmação enviada.
- O dashboard mostra o modo, a idade do pulso, e **qual das duas plataformas está a enviar
  neste momento** — em CRM de Parceiros › Configuração.
- Os modos `nodechef` e `leads` só se usam para forçar a mão durante uma manutenção, e
  ficam registados com o nome de quem os pôs assim.
