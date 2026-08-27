# Partilha de dados de leads entre `a++-dashboad-leads-control` e `yourbox-meteor`

> Documento para levar ao projecto **leads-control**. Descreve as estruturas de
> dados das leads tal como existem hoje no backoffice YourBox, o que cada lado
> pode ler e escrever, e as armadilhas conhecidas.
>
> As estruturas abaixo **não são inventadas**: foram levantadas por consulta
> directa à base de dados e leitura do código (`server/methods/leadsMetadata.js`,
> `server/methods/messages.js`, `imports/ui/components/pages/leadsBoard.js`).
> Onde há incerteza, está dito.

---

## 1. O modelo: não há sincronização, há uma base de dados só

Isto é o mais importante e condiciona tudo o resto.

**As duas plataformas escrevem na mesma base de dados MongoDB.** Não há API entre
elas, não há fila de mensagens, não há cópia. O `leads-control` insere
directamente na colecção `messages`, e o backoffice YourBox lê de lá.

A prova está no código do YourBox, que já se defende dessas inserções:

```js
// server/methods/leadsMetadata.js:330 e server/methods/messages.js:48,69,92,114
appSource: { $ne: 'leads-control' }   // esconder entradas internas da leads-control
```

```js
// server/methods/messages.js:219
// id pode ser string OU ObjectId (mensagens inseridas fora do Meteor, ex.: leads-control)
```

Consequência prática: **não é preciso construir sincronização nenhuma.** É preciso
os dois lados concordarem no formato e respeitarem o que é de quem. O resto deste
documento é esse contrato.

---

## 2. Colecção `messages` — a lead em si

É onde a lead nasce. Uma lead é um documento de `messages` com um `messageType`
da lista de leads.

### 2.1 Documento completo (exemplo real)

```js
{
  _id: 'HYub2Na6pvaDpjop4',          // ver 5.1 — STRING vs ObjectId
  company: 'Yourbox',                 // OBRIGATÓRIO — ver 5.2
  companyProvider: 'Yourbox',
  messageType: 'callbackVariantD',    // ver 2.2
  variante: 'D',                      // 'A' | 'B' | 'C' | 'D' | 'QUIZ6B'
  appSource: 'leads-control',         // marca a origem — ver 5.3
  to: 'admin',                        // 'admin' | 'private'
  toPrivate: null,
  presentationMessage: 'stick',
  deletedAfter: 0,
  senderName: 'Lead Web D',
  message: '<div>…</div>',            // HTML já montado, mostrado no mural
  timeStamp: ISODate('…'),            // TEM de ser Date, não string — ver 5.4
  closed: false,
  closedAt: null,
  reply: [ { reply: 'ok', name: 'Helder Caldas' } ],
  leadData: { … }                     // ver 2.3
}
```

### 2.2 `messageType` — quais contam como lead

O backoffice trata estes cinco como **leads** (aparecem no CRM):

| `messageType` | O que é |
|---|---|
| `newLead` | lead normal do site |
| `directLeadVariantA` | pedido directo (o CRM mostra-a como variante **B**) |
| `hotLead` | lead qualificada |
| `newLeadVariantD` | lead da variante D |
| `callbackVariantD` | pedido de contacto da variante D |

E estes dois como **simulações** (aparecem no painel de simulações, não no CRM):

| `messageType` | O que é |
|---|---|
| `preLeadSimulation` | simulação de preço sem contacto |
| `priceRangeSimulation` | simulação com intervalo de preço |

> Há ainda `clientSimulation`, `informative` e `iAwaitAnAnswer` na colecção. Não
> são leads e o CRM ignora-os.

**Um `messageType` fora desta lista não aparece em lado nenhum do CRM.** É a
causa mais provável de "inseri e não apareceu".

### 2.3 `leadData` — o conteúdo da lead

Campos observados na base de dados, com o tipo real e em quantos dos 57
documentos aparecem:

| Campo | Tipo | Presença | Notas |
|---|---|---|---|
| `origem` | string | 57/57 | morada de recolha |
| `destino` | string | 57/57 | morada de entrega |
| `urgencia` | string | 57/57 | `'1 Hora'` \| `'4 Horas'` \| `'24 Horas'` |
| `viatura` | string | 57/57 | `'Moto'` \| `'Furgão'` \| `'Furgão Classe 1'` \| `'Carrinha'` |
| `timeStamp` | Date | 57/57 | duplica o do topo |
| `converted` | boolean | 57/57 | |
| `source` | string | 57/57 | `'website'` \| `'website_form'` \| `'website_variant_b'` |
| `convertedAt` | Date | 55/57 | |
| `priceCalculated` | number | 50/57 | preço base |
| `priceWithDiscount` | number | 50/57 | **é este que o CRM mostra como preço final** |
| `discount` | number | 50/57 | |
| `extraUrbano` | boolean | 50/57 | |
| `urbano` | **number** | 50/57 | ⚠️ ver 5.5 |
| `distance` | number | 43/57 | km |
| `nome` | string | 23/57 | |
| `email` | string | 23/57 | |
| `telefone` | string | 23/57 | |
| `variant` | string | 12/57 | duplica `variante` do topo |
| `engajamento` | string | 5/57 | `'MEDIO'` \| `'ALTO'` |
| `flowType` | string | 5/57 | `'falar'` \| `'pedido'` |
| `priceRange` | string | 5/57 | ex.: `'100€ - 160€'` |
| `observacoes` | string | 5/57 | |
| `callbackRequested` | boolean | 2/57 | |
| `callbackRequestedAt` | Date | 2/57 | |
| `callback_time` | string | 2/57 | ⚠️ snake_case, ver 5.6 |
| `preco_final` | number | 2/57 | ⚠️ snake_case, ver 5.6 |
| `preco_original` | number | 2/57 | ⚠️ snake_case, ver 5.6 |
| `desconto` | string | 2/57 | ⚠️ snake_case, ver 5.6 |
| `flow` | string | 2/57 | ⚠️ duplica `flowType` |
| `priority` | string | 2/57 | ⚠️ ver 5.7 |
| `simulationId` | string | 2/57 | liga a uma simulação |

**Nenhum destes campos é obrigatório do ponto de vista da base de dados.** O
backoffice mostra o que existe e deixa em branco o que falta — o que aparece na
interface como `€0.00` ou `km` sem número.

Para uma lead ficar completa no CRM, convém trazer no mínimo:
`origem`, `destino`, `urgencia`, `viatura`, `nome`, `telefone`, `email`,
`distance`, `priceCalculated` e `priceWithDiscount`.

---

## 3. Colecção `leadsMetadata` — a gestão da lead

Separada de propósito: `messages` é o que o site enviou (imutável), `leadsMetadata`
é o que o operador decidiu depois. **É esta a colecção que o leads-control tem de
ler e escrever para haver partilha real da gestão.**

```js
{
  _id: 'dZWsJYjQy2pZDrtQX',
  leadId: 'HYub2Na6pvaDpjop4',   // = messages._id — ver 5.8
  status: 'contactado',           // 'novo' | 'contactado' | 'fechado' | 'perdido'
  priority: 'urgente',            // 'baixa' | 'normal' | 'alta' | 'urgente'
  notes: 'texto livre',
  followUpDate: ISODate('…'),
  tags: ['teste'],
  assignedTo: 'userId',           // opcional, pouco usado
  updatedAt: ISODate('…'),
  updatedBy: 'Helder Caldas',     // NOME, não id
  comments: [
    { id: 'NYyv2eS7z', timestamp: ISODate('…'), user: 'Helder Caldas',
      userId: 'qCSyhbHn4', text: '…' }
  ],
  history: [
    { timestamp: ISODate('…'), user: 'Helder Caldas', userId: '…',
      changes: { status: { from: 'novo', to: 'contactado' } } }
  ]
}
```

**Vocabulários fechados** — o backoffice só oferece estes valores nos seus menus;
um valor fora da lista fica guardado mas não aparece seleccionado:

- `status`: `novo`, `contactado`, `fechado`, `perdido`
- `priority`: `baixa`, `normal`, `alta`, `urgente`

Um documento sem `status` é tratado como `novo`.

---

## 4. Como o leads-control deve escrever

### 4.1 Criar uma lead

Inserir em `messages` com a forma da secção 2.1. Obrigatório:

- `company: 'Yourbox'` (senão fica invisível — ver 5.2)
- `messageType` de 2.2
- `timeStamp` como **Date** (ver 5.4)
- `leadData` com os campos de 2.3

### 4.2 Ler / escrever a gestão

Ler e escrever directamente em `leadsMetadata`, casando por `leadId`. **Usar
sempre `upsert` por `{ leadId }`**, nunca `insert` — o backoffice faz o mesmo, e
dois `insert` produziriam dois documentos para a mesma lead sem que nada o
impedisse (não há índice único em `leadId`).

Ao escrever, convém preencher `updatedAt` e `updatedBy` para o histórico não
ficar cego sobre quem mexeu.

### 4.3 O que o backoffice YourBox faz com estes dados

Métodos disponíveis do lado do Meteor (só a título informativo — o leads-control
não lhes chama, escreve directamente no Mongo):

| Método | Efeito em `leadsMetadata` |
|---|---|
| `leadsMetadata.update(leadId, data)` | upsert de `status`, `notes`, `priority`, `assignedTo`, `followUpDate`, `tags` + entrada em `history` |
| `leadsMetadata.get(leadId)` | devolve o documento inteiro |
| `leadsMetadata.addComment(leadId, texto)` | `$push` em `comments` |
| `leadsMetadata.addTag(leadId, tag)` | `$addToSet` em `tags` |
| `leadsMetadata.removeTag(leadId, tag)` | `$pull` em `tags` |
| `leadsMetadata.bulkUpdatePriority(ids, p)` | prioridade em massa |
| `leadsMetadata.getStatusStats()` | contagens por estado |
| `leadsMetadata.getFollowUpNeeded()` | follow-ups vencidos, excluindo fechados e perdidos |

---

## 5. Armadilhas conhecidas

Estas são reais e estão documentadas com a evidência que as sustenta.

### 5.1 `_id`: string do Meteor vs ObjectId ⚠️ **o mais grave**

O Meteor gera `_id` como **string aleatória de 17 caracteres** (`'HYub2Na6pvaDpjop4'`).
Um cliente Mongo normal (Node, Python, PHP) gera **ObjectId**.

A colecção está declarada sem `idGeneration`, portanto assume strings:

```js
// imports/api/collections.js:60
export const Messages = new Mongo.Collection('messages');
```

Já houve um erro por causa disto, e está corrigido só num sítio:

```js
// server/methods/messages.js:219
// O '=== String' estrito rebentava com 'Match error: Expected string, got object'
check(id, Match.OneOf(String, Object));
```

**Mas o método que grava a gestão da lead continua a exigir string:**

```js
// server/methods/leadsMetadata.js:29
'leadsMetadata.update': function(leadId, data) {
    check(leadId, String);      // ← rejeita ObjectId
```

Ou seja: **uma lead inserida pelo leads-control com `_id` do tipo ObjectId não
consegue ter a gestão gravada a partir do backoffice YourBox** — o método rejeita
o identificador antes de fazer o que quer que seja.

**Isto não foi verificado em produção** — no dump de desenvolvimento não há
nenhum documento com `appSource: 'leads-control'`, portanto não há como reproduzir
aqui. Mas o risco é concreto e vale a pena confirmá-lo cedo.

**Recomendação:** o leads-control deve inserir com `_id` **string**, no formato do
Meteor (17 caracteres alfanuméricos), em vez de deixar o driver gerar ObjectId.
Resolve o problema na origem e evita mexer no Meteor.

### 5.2 `company` em falta torna a lead invisível

Todas as consultas do CRM filtram por `company: 'Yourbox'`. Há documentos na base
com `company: null` — esses não aparecem em lado nenhum e não há aviso.

### 5.3 `appSource: 'leads-control'` esconde a lead do backoffice

O YourBox exclui explicitamente `appSource: 'leads-control'` em cinco consultas,
para não duplicar entradas. **Uma lead marcada assim não aparece no CRM do
YourBox.** Se a intenção é que apareça, não usar essa marca — ou combinar uma
marca diferente.

### 5.4 `timeStamp` tem de ser `Date`

Os filtros de período (`hoje`, `ontem`, `últimos 2 dias`, intervalo) comparam com
`$gte`/`$lte` sobre datas. Uma string ISO **não** é comparada como data e a lead
desaparece de todos os filtros excepto "todos".

### 5.5 `urbano` é `number`, não `boolean`

Em 50 documentos, `leadData.urbano` está gravado como número, enquanto
`extraUrbano` é booleano. Não sei se é intencional; convém não assumir booleano.

### 5.6 Dois dialectos de nomes no mesmo campo

`leadData` tem campos em camelCase (`priceCalculated`, `priceWithDiscount`,
`flowType`) e, em 2 documentos, os mesmos conceitos em snake_case português
(`preco_final`, `preco_original`, `desconto`, `callback_time`, `flow`).

**O backoffice só lê os camelCase.** Uma lead que traga só `preco_final` mostra
preço zero. Usar sempre os camelCase da tabela em 2.3.

### 5.7 `priority` existe em dois sítios

Há `leadData.priority` (2 documentos) e `leadsMetadata.priority`. **O CRM só usa o
de `leadsMetadata`.** O de `leadData` é ignorado.

### 5.8 `leadId` órfão

`leadsMetadata.leadId` é uma string livre, sem chave estrangeira e sem índice
único. Na base de desenvolvimento, **6 dos 14 documentos de `leadsMetadata` não
têm nenhuma lead correspondente em `messages`** — ficaram para trás quando as
mensagens foram apagadas ou o `_id` mudou.

Não é fatal (ninguém os lê), mas quem escrever de fora deve saber que nada impede
o desalinhamento.

### 5.9 Índices existentes

```js
// server/methods/leadsMetadata.js:18-21
LeadsMetadata._ensureIndex({ leadId: 1 });     // NÃO é único
LeadsMetadata._ensureIndex({ status: 1 });
LeadsMetadata._ensureIndex({ updatedAt: -1 });
```

---

## 6. Simulações

Mesma colecção `messages`, `messageType` `preLeadSimulation` ou
`priceRangeSimulation`, e o conteúdo também em `leadData` (nunca em
`simulationData`, apesar de o código do YourBox aceitar ambos:
`sim.leadData || sim.simulationData`).

Uma simulação distingue-se de uma lead por não trazer `nome`, `email` nem
`telefone`. O YourBox tem métodos para as ligar a leads:
`leads.linkSimulationToLead`, `leads.autoLinkAll`, `leads.findRelatedSimulation`.
A ligação grava `leadData.simulationId`.

---

## 7. Checklist para o leads-control

Ao **criar** uma lead:

- [ ] `company: 'Yourbox'`
- [ ] `messageType` da lista de 2.2
- [ ] `timeStamp` como `Date`
- [ ] `_id` como string de 17 caracteres (ver 5.1)
- [ ] `leadData` em camelCase (ver 5.6)
- [ ] não marcar `appSource: 'leads-control'` se quiser que apareça no CRM

Ao **ler ou escrever** a gestão:

- [ ] colecção `leadsMetadata`, casar por `leadId`
- [ ] sempre `upsert`, nunca `insert`
- [ ] `status` e `priority` só com os valores dos vocabulários fechados
- [ ] `followUpDate` como `Date`
- [ ] preencher `updatedAt` e `updatedBy`

---

## 8. O que este documento não cobre

- **Autenticação e permissões.** No YourBox só `Administrator`, `Operator` e
  `commissionOperator` vêem o CRM. O leads-control escreve directamente no Mongo,
  portanto não passa por nenhuma dessas verificações — o que também quer dizer que
  nada o impede de escrever o que quiser.
- **Concorrência.** Os dois lados podem escrever o mesmo documento de
  `leadsMetadata` ao mesmo tempo. Não há bloqueio nem versão; ganha o último. Se
  isso vier a incomodar, o passo seguinte é um campo de versão e uma escrita
  condicional — mas hoje não existe.
- **Produção.** Tudo o que está aqui foi levantado do dump de desenvolvimento e do
  código. Os documentos com `appSource: 'leads-control'` **não existem neste dump**,
  portanto a forma exacta do que o leads-control insere hoje não pôde ser
  verificada — só inferida a partir das defesas que o código do YourBox tem contra
  ela.
