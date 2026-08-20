# Atribuição de leads a clientes de widget (comissões)

Como saber que uma lead foi angariada pelo widget white-label de um parceiro, para lhe
pagar comissão.

## O carimbo

Toda a lead angariada por widget leva três campos, na raiz do documento `messages` **e**
dentro de `leadData`:

| Campo | Exemplo | Nota |
|---|---|---|
| `widgetClientId` | `yi2cnns6j46v` | `clientId` da colecção `widgetClients` |
| `widgetClientName` | `Carrega Portugal` | nome à data do registo (histórico estável) |
| `widgetRef` | `carregaportugal.pt` | hostname do site que embebeu o widget |

Não confundir com o campo `clientId` já existente nas leads — esse é o **cliente do CRM**
(colecção `clients`), preenchido quando a lead é convertida.

## Percurso do identificador

```
embed.js (site do parceiro)          data-ybw-client -> ?clientId=...&ref=<hostname>
   └─> widget.html / widget-quiz.html          lê a query string
        ├─ modo assistente: /api/conversations/start  -> conversations.data.widgetClientId
        │                                             -> lead (registerLead / message route)
        └─ modo formulário: /api/quiz-progress        -> conversations.widgetClientId
                                                      -> lead (no evento `submit`)
```

O carimbo viaja em **todos** os eventos de progresso, por isso sobrevive a recarregamentos
da página a meio do quiz.

## Validação (lib/widget/attribution.ts)

O `clientId` chega do browser, por isso é validado no servidor antes de ser gravado:

1. tem de existir em `widgetClients` e ter `active: true`;
2. se o cliente tiver domínios em `allowedOrigins`, o `ref` tem de bater certo
   (subdomínios contam; `www.` e porta são ignorados).

Se falhar, a lead regista-se na mesma — apenas sem atribuição. O resultado fica em cache
60 s; editar um widget no dashboard limpa a cache.

**Com `allowedOrigins: ['*']` qualquer site pode reclamar leads para aquele `clientId`.**
Para comissões, configurar sempre os domínios reais do parceiro. A página de widgets
mostra um aviso enquanto as origens estiverem a `*`.

## Onde consultar

| Fim | Endpoint / vista |
|---|---|
| Apuramento mensal por parceiro | `GET /api/admin/widget-clients/stats?month=MM&year=YYYY` |
| Resumo no gestor de widgets | `/dashboard/widgets` — linha "N leads em MM/AAAA" por cartão |
| Leads de um parceiro | `GET /api/leads?widgetClientId=<id>` (`none` = leads próprias) |
| Vista do próprio parceiro | `GET /api/v1/stats` com o token dele (inalterada para ele) |

Nas vistas, o parceiro aparece sempre pelo **nome** (badge verde-lima), nunca pelo id: na
lista e no detalhe de Leads, e na lista e no cabeçalho da Inbox. O id fica no tooltip e no
gestor de widgets. O nome é gravado no momento do registo (`widgetClientName`), por isso o
histórico não muda se o parceiro for renomeado — já o apuramento mensal usa sempre o nome
actual da colecção `widgetClients`.

**Visitas não são registadas para widgets.** O tracker de visitas (`yourbox-visit.js`) vive
no site próprio e não é carregado dentro do iframe; nenhuma página do widget chama
`/api/visit`. O mapa de Visitas mostra só tráfego próprio — para o widget, a primeira coisa
que se vê é a conversa na Inbox.

O valor apurado usa a regra habitual: `arrasto` -> `partnerFinalPrice`,
`direto` -> `priceWithDiscount`, nunca `??` entre os dois.

## Histórico

Leads anteriores a esta alteração não têm carimbo. A API `/api/v1/stats` mantém o
fallback por domínio (`leadData.source ∈ allowedOrigins`) para as apanhar, mas isso só
funciona nos parceiros que tenham domínios específicos configurados. O apuramento em
`/api/admin/widget-clients/stats` conta apenas leads carimbadas.

## Rotação A/B no widget

Um parceiro em "Rotação A/B" sorteia a ordem dos passos por `pickByWeight`, usando a
distribuição de `/api/variant-config`, com sticky por sessão. Duas notas:

- o widget só conhece `quiz5`, `quiz6`, `quiz6b` e `quiz6c` — pesos noutras variantes são
  ignorados; e `QUIZ6`, `QUIZ6B`, `QUIZ6C` partilham a **mesma** ordem de passos (`C6`), pelo
  que hoje só `QUIZ5` produz um fluxo diferente no widget. As diferenças reais entre 6b/6c/7b/7c
  vivem nas landings, que o widget não usa;
- as conversas de widget são **excluídas** do conselheiro de autobalance
  (`lib/autobalance/advisor.ts`): entram na colecção com a mesma `quizVariante` mas sem
  visita correspondente, e contá-las inflacionaria a taxa leads/visitas dessa variante.

## Por fazer

Ligação a serviços executados — adiada por decisão de 20/08/2026: para já basta a lead vir
identificada. Quando for altura: quando a lead vira cliente em
`/api/conversations/[id]/confirm-client`, o `widgetClientId` já é copiado para a ficha do
cliente (`clients`). Falta ligar isso aos `services` reconciliados em
`lib/reconcile/matchClients.ts` e definir a regra de comissão (percentagem, recorrência,
janela temporal).
