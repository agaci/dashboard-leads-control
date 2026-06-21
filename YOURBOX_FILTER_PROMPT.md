# Prompt — filtrar entradas do dashboard de leads na plataforma YourBox antiga

> Aplicar **no projecto YourBox antigo** (a plataforma Meteor / backoffice que mostra a inbox e as leads a partir da colecção `messages`). Não tem nada a ver com a app `leads-control` (Next.js).

## Contexto

A nova app de controlo de leads (`leads-control`) escreve as leads do funil **Quiz** na **mesma** colecção MongoDB `messages` (BD `weby`) que esta plataforma YourBox usa. Isto é intencional: a `leads-control` precisa dessas entradas para a sua própria lista de Leads e para os alertas sonoros.

A lead "oficial" que deve aparecer na YourBox continua a ser enviada pela API de sempre (`submitDirectLead`). A entrada escrita pela `leads-control` é **só para uso interno da nova app** e **não deve aparecer** na inbox/lista de mensagens da YourBox (senão fica uma linha duplicada — a tal que não abre detalhe).

Essas entradas internas estão marcadas com o campo de topo:

```
appSource: "leads-control"
```

(As entradas normais/oficiais **não** têm este campo.)

Nota: o **contador de leads** da YourBox já só conta 1 (não conta estas entradas) — falta apenas escondê-las da **lista de mensagens**.

## Objectivo

Esconder da inbox / lista de mensagens da YourBox todos os documentos de `messages` em que `appSource === "leads-control"`, mantendo tudo o resto igual.

## O que fazer

1. Localiza onde a inbox / lista de mensagens é obtida a partir da colecção `messages`. Tipicamente é:
   - uma **publication** Meteor (ex.: `Meteor.publish('messages', ...)` ou semelhante), e/ou
   - um `Messages.find(selector, ...)` no servidor ou cliente que alimenta a lista.

2. Adiciona ao **selector** dessa query a condição que exclui as entradas internas:

   ```js
   appSource: { $ne: 'leads-control' }
   ```

   Exemplo (publication):
   ```js
   Meteor.publish('messages', function (/* ... */) {
     return Messages.find(
       {
         // ... os filtros que já existem (company, messageType, etc.) ...
         appSource: { $ne: 'leads-control' },   // <-- ADICIONAR
       },
       { /* sort/limit já existentes */ }
     );
   });
   ```

   > `$ne: 'leads-control'` também inclui os documentos **sem** o campo `appSource` (comportamento do Mongo), por isso todas as mensagens normais continuam a aparecer; só as marcadas é que ficam escondidas.

3. Se houver **mais do que um sítio** a ler `messages` para listas visíveis (inbox, leads, pesquisa, exportações para o utilizador), aplica a mesma condição em todos. **Não** alteres o contador de leads (já está correcto).

## Não alterar

- A escrita/recepção das leads via `submitDirectLead` (a lead oficial) — fica igual.
- O contador de leads — já exclui estas entradas.
- Qualquer email enviado ao cliente — fica igual.

## Verificação

1. Submete um orçamento pela página do quiz (`index-quiz-3.html`).
2. Na YourBox, a inbox/lista deve passar a mostrar **apenas uma** entrada para essa lead (a oficial, que abre detalhe). A entrada com `CONTACTAR AGORA [canal: QUIZ]` / `senderName: "Quiz Web"` deixa de aparecer.
3. Confirma que as restantes mensagens (não-quiz) continuam todas visíveis.
