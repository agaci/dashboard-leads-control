# Captura de GCLID e Conversões Offline — Google Ads

> Estado: em produção desde 07-08-2026, a acumular dados · primeira exportação prevista ~14-08-2026
> Auditoria e desenho original: `prompt-gclid-conversoes-offline.md`

## Acção de conversão no Google Ads

Criada a 07-08-2026 na conta `244-927-7323 Yourbox Lda`:

| Definição | Valor |
|---|---|
| Nome | `Lead Yourbox` (bate com o default de `GOOGLE_ADS_CONVERSION_NAME`) |
| Fonte | Importar de cliques |
| Categoria | Enviar formulários de leads · Ação principal |
| Contagem | Uma conversão |
| Período de conversão por clique | 90 dias |
| Valor | valores diferentes, 1 € por omissão |

O aviso *"não está a receber dados porque não existem associações relacionadas"* é
esperado e desaparece ao primeiro carregamento — o botão "Associar origem de dados"
é para CRMs e Data Manager, caminho que não usamos.

As outras 9 acções da conta são todas de browser/tag e estão a 0. As duas Principais
(`Lead no site NOVO (2026)` e `Call clicks from ads`) também. Quando a importação
offline estiver a produzir, vale a pena desligar as inactivas — e atenção à dupla
contagem se alguma das de website voltar a disparar.

## O problema

O Google Ads reportava **0 conversões** com 371 leads em 30 dias. O tag de conversão
vive dentro do GTM (`GTM-5M3HLRXR`) e o site tem Consent Mode v2 com
`ad_storage: denied` por omissão — quem fecha o banner sem aceitar é invisível para
o Google. Sem conversões, a estratégia "Maximizar Conversões" gere lances às cegas.

A solução não depende do browser: captura-se o `gclid` **no servidor**, guarda-se
até à criação da lead, e exporta-se um CSV para importação de conversões offline.

## Arquitectura

Duas plataformas em domínios diferentes — é a chave para perceber o resto:

```
yourbox.com.pt (PHP, FTP)                     leads.comgo.pt (Next.js, Docker)
        |                                              |
   index.php                                           |
     |-- yb-attr.php ......... escreve cookie yb_attr (90d, server-side)
     |-- index-quiz-6c.html                            |
          |-- yb-attr.js ..... plano B em JS           |
          |-- yourbox-visit.js --- beacon + attr ----> /api/visit
          |-- yourbox-quiz.js ---- beacon + attr ----> /api/quiz-progress
          |                                            |   (cria a lead com attribution)
          |-- yb-attr.sendLead(telefone) ------------> /api/attribution
          |                                            |   (para reconciliar depois)
          '-- POST submitDirectLead --> plataforma antiga (Meteor, mesma BD `weby`)
```

A plataforma antiga cria a maior parte das leads e não conhece o `gclid`. Por isso
existe `/api/attribution`: o site regista a atribuição indexada pelo telemóvel, e a
exportação casa-a com a lead por telemóvel + janela temporal.

## Ficheiros

### Site (vai por FTP — `site_YB/` está no .gitignore)

| Ficheiro | Estado |
|---|---|
| `site_YB/yb-attr.php` | **novo** — captura server-side |
| `site_YB/assets/js/yb-attr.js` | **novo** — captura em JS + API `window.YB_ATTR` |
| `site_YB/index.php` | +1 linha de include, protegida por `file_exists` |
| `site_YB/assets/js/yourbox-visit.js` | campo `attr` no payload |
| `site_YB/assets/js/yourbox-quiz.js` | campo `attr` no payload + `sendLead` no submit |
| `site_YB/assets/js/yourbox-form-{a,b,c,d}.js` | +1 linha `sendLead`, guardada por `if` |
| `site_YB/index-{a,b,c,d}.html` | +1 `<script>` |
| `site_YB/index-quiz{,-b,-3,-4,-5,-6,-6b,-6c}.html` | +1 `<script>` |

### App (vai por git + `docker compose build`)

| Ficheiro | Estado |
|---|---|
| `lib/attribution.ts` | **novo** — normalização e validação do payload |
| `lib/conversions/csv.ts` | **novo** — formatação do CSV (testada) |
| `lib/conversions/selectLeads.ts` | **novo** — selecção directa + reconciliada |
| `app/api/attribution/route.ts` | **novo** — recebe atribuição por telemóvel |
| `app/api/conversions/export/route.ts` | **novo** — CSV protegido |
| `app/api/conversions/stats/route.ts` | **novo** — números do painel |
| `app/dashboard/atribuicao/page.tsx` | **novo** — painel de verificação |
| `app/api/visit/route.ts` | guarda `attribution` na visita |
| `app/api/quiz-progress/route.ts` | guarda `attribution` na conversa e na lead |
| `components/layout/NavSidebar.tsx` | +1 link para o painel |
| `scripts/migrate-attribution.mjs` | **novo** — índices |

## Envio automático — Programação do Google Ads

Não é preciso Google Ads API, nem developer token, nem OAuth. O Google Ads vai
buscar o CSV a um URL HTTPS, sozinho, todos os dias.

**URL a configurar** em Objetivos > Carregamentos > Programações:

```
https://leads.comgo.pt/api/conversions/export?token=<CONVERSIONS_TOKEN>&mark=uploaded
```

`mark=uploaded` é **obrigatório** aqui. Sem ele as conversões ficam em `exported`,
voltam a sair no dia seguinte, e o Google conta as mesmas conversões todos os dias.

O token viaja na query string porque o Google Ads não envia cabeçalhos HTTP. É a
única razão — no uso manual continua a valer o `Authorization: Bearer`.

Sobre tempo real: não existe, nem pela API. As conversões offline são processadas
em lote e a estratégia de lances reavalia poucas vezes por dia. Entre enviar de
hora a hora ou uma vez por dia o algoritmo comporta-se igual.

## Leads efectivas

Visitantes que não concluíram o quiz mas deixaram nome e contacto. São contactados
pela equipa como qualquer outra lead e fecham na mesma proporção — o Google é que
nunca soube delas. Vivem em `conversations` (sem `leadId`), não em `messages`.

São ~80 por mês sobre ~376 completas: **mais 21% de sinal**.

Valores reportados (`lib/conversions/values.ts`) — escala de qualidade, não receita:

| Tipo | Valor |
|---|---|
| Lead completa | 1,00 € |
| Quiz abandonado com telefone | 0,50 € |
| Quiz abandonado só com email | 0,30 € |

O preço cotado à lead **não** é usado como valor de conversão: é uma cotação, não
uma venda, e enviá-lo ensinaria o algoritmo a perseguir orçamentos grandes em vez
de negócio fechado.

Com "Maximizar Conversões" o Google ignora o valor hoje. Fica registado para que,
com histórico suficiente, se possa passar a "Maximizar valor de conversões" sem
reenviar nada.

`?efetivas=0` exclui-as, para comparar o efeito.

## Instalação

### 1. FTP para yourbox.com.pt

Carregar, por esta ordem (os JS antes dos HTML, para nenhuma página pedir um
ficheiro que ainda não existe):

```
assets/js/yb-attr.js            <- novo
assets/js/yourbox-visit.js
assets/js/yourbox-quiz.js
assets/js/yourbox-form-a.js
assets/js/yourbox-form-b.js
assets/js/yourbox-form-c.js
assets/js/yourbox-form-d.js
yb-attr.php                     <- novo
index.php
index-a.html  index-b.html  index-c.html  index-d.html
index-quiz.html  index-quiz-b.html  index-quiz-3.html  index-quiz-4.html
index-quiz-5.html  index-quiz-6.html  index-quiz-6b.html  index-quiz-6c.html
```

O `index.php` só inclui o `yb-attr.php` se ele existir, portanto uma ordem trocada
não parte o site — no pior caso a captura fica inactiva até o ficheiro subir.

### 2. Deploy da app

```
git pull && docker compose build --no-cache app && docker compose up -d app
```

### 3. Índices na base de dados

```
node scripts/migrate-attribution.mjs           # simula
node scripts/migrate-attribution.mjs --apply   # cria
```

Não escreve campos nos documentos existentes — só índices, todos `background` e
`sparse`. A colecção `messages` é partilhada com a plataforma antiga, e um
`updateMany` sobre ela seria risco sem retorno. As leads antigas comportam-se
como 'pending' porque `{ $ne: 'uploaded' }` também corresponde a campo ausente.

### 4. Variáveis de ambiente (opcionais)

```
GOOGLE_ADS_CONVERSION_NAME=Lead Yourbox   # tem de ser o nome EXACTO no Google Ads
CONVERSIONS_TOKEN=<segredo>               # obrigatório para a Programação do Google
```

O `CONVERSIONS_TOKEN` é obrigatório se quiseres o envio automático — sem ele o
endpoint só responde a sessões do dashboard. Gerar um novo:

```
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Verificação

Depois do FTP, abrir:

```
https://yourbox.com.pt/?gclid=TESTE123&utm_source=google&utm_medium=cpc
```

e confirmar nas ferramentas do browser que existe o cookie `yb_attr` com
`"src":"php"` — se disser `"js"`, o PHP não está a correr e a captura ficou
dependente do JavaScript.

Depois, no dashboard: **Atribuição Google Ads** (ícone de alvo no fundo da barra
lateral, ou `/dashboard/atribuicao`).

O número a vigiar não é a cobertura global — leads orgânicas nunca terão `gclid`.
É a linha **utm_source = google** na tabela de origens: se essas visitas tiverem
poucos click ids, aí sim há um problema de captura.

## Importar no Google Ads

1. `/dashboard/atribuicao` > descarregar CSV (um por tipo: gclid, wbraid, gbraid —
   o Google não aceita tipos misturados no mesmo ficheiro; em iOS o tráfego vem
   quase todo como `wbraid`)
2. Google Ads > Ferramentas > Conversões > Importações > Carregar ficheiro
3. Confirmar o número de linhas aceites
4. Marcar as leads como `uploaded` (ver abaixo)

O CSV sai já no formato exigido:

```
Parameters:TimeZone=Europe/Lisbon
Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
Cj0KCQ...,Lead Yourbox,2026-08-06 14:22:31,0.00,EUR
```

Descarregar marca as leads como `exported`. Só `uploaded` as exclui de exportações
futuras — essa marcação é manual, porque o Google não nos diz o que aceitou:

```js
db.messages.updateMany(
  { 'conversionSync.status': 'exported' },
  { $set: { 'conversionSync.status': 'uploaded' } }
)
```

## Testes

```
npm test
```

24 testes: formatação do CSV (`lib/conversions/csv.test.ts`) e regra de precedência
da captura (`scripts/test-yb-attr.mjs`, corre o ficheiro do site num sandbox).

## Decisões tomadas

**Último clique ganha, primeiro toque preservado.** O prompt pedia first-touch, mas
o Google Ads atribui a conversão ao último clique — reportar um `gclid` antigo
quando houve um clique mais recente credita a campanha errada. O primeiro toque
fica em `first` dentro do cookie. Tráfego de email a seguir a um anúncio nunca
rouba a conversão: `utm` sozinho não substitui um click id guardado.

**Cookie escrito sempre, sem esperar consentimento de marketing.** O `yb_attr` é
first-party, não é partilhado com terceiros no browser e serve medição sob
interesse legítimo. Condicioná-lo ao banner reduziria a cobertura ao mesmo nível
que já falha hoje — seria reproduzir o problema que estamos a resolver. A política
de cookies já menciona medição, publicidade e Google Ads; vale a pena rever o texto
para a descrever explicitamente.

**Sem escrita em massa na colecção `messages`.** Ver secção dos índices.

**Deduplicação por click id.** Um mesmo clique nunca gera duas conversões, mesmo
que a pessoa submeta o formulário duas vezes.

## Por fazer

- **Índices** — `node scripts/migrate-attribution.mjs --apply` ainda por correr.
  Não bloqueia nada; só acelera as consultas do painel.
- **Chat widget** (`public/yourbox-chat-b.js`, `/api/conversations/start`): fora do
  âmbito por não estar em rotação. Requer propagar `attribution` da conversa para a
  lead em `app/api/conversations/[id]/message/route.ts` — ficheiro central do bot,
  deliberadamente não tocado.
- **Fase 6 — Google Ads API.** Automatizar com `UploadClickConversionsRequest` e
  `ClickConversion`, eliminando o CSV manual. Só depois de 2-3 semanas a validar o
  fluxo manual. TODO já marcado em `app/api/conversions/export/route.ts`.
