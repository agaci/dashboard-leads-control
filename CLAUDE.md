@AGENTS.md

# YourBox Dashboard — Contexto de Desenvolvimento (carregado em cada sessão)

> Stack: Next.js 16 App Router · TypeScript · MongoDB nativo · Tailwind CSS 4  
> App em produção: `https://leads.comgo.pt/dashboard`  
> Branch local: `master` → push para `origin master:main` (servidor usa `main`)  
> Arquitectura inicial detalhada: `YOURBOX_CLAUDE_CODE_START.md`  
> Roadmap e estado: `ANALISE_ROADMAP.md` · Deploy: `DEPLOY.md`

---

## Convenções absolutas

- Responder **sempre em português** (PT) — sem excepções
- Para a lead é sempre **"YourBox"** — nunca mencionar parceiros, transportadoras ou fornecedores externos
- MongoDB: **sem Mongoose** — driver nativo directo
- BD: nome `weby` (não `yourbox`), `CALC_PRICE_MACHINE=calculator_1_FixCityPriceAPI`
- `companyProvider: 'Yourbox'` (Y maiúsculo, b minúsculo) na colecção `services`

---

## Arquitectura do Bot — Duas rotas em paridade obrigatória

| Rota | Propósito |
|---|---|
| `app/api/conversations/[id]/message/route.ts` | Chat web (widget / landing page) |
| `app/api/agent/message/route.ts` | WhatsApp (Evolution API) |

**Regra:** qualquer alteração ao fluxo do bot deve ser replicada em **ambas** as rotas.

---

## Máquina de Estados (ConversationStep)

**Fluxo direto (1h / 4h):**
```
INIT → COLLECTING_ORIGEM → COLLECTING_DESTINO → COLLECTING_VIATURA → COLLECTING_URGENCIA
→ CALCULATING_PRICE → PRESENTING_PRICE → HANDLING_OBJECTION
→ COLLECTING_NOME → COLLECTING_EMAIL → COLLECTING_NOTAS → LEAD_REGISTERED
```

**Fluxo arrasto (24h — parceiro logístico):**
```
COLLECTING_WEIGHT → COLLECTING_VOLUMES → CONFIRMING_FRIDAY_DELIVERY → PRESENTING_PARTNER_PRICE
→ [recolha contacto] → LEAD_REGISTERED
```

**Recolha de moradas completas (opcional, controlado por `collectFullAddresses`):**
```
COLLECTING_ORIGEM_COMPLETA → CONFIRMING_ORIGEM_COMPLETA
→ COLLECTING_DESTINO_COMPLETA → CONFIRMING_DESTINO_COMPLETA
→ COLLECTING_DETALHES_RECOLHA → COLLECTING_DETALHES_ENTREGA
```

**Pagamento:** `AWAITING_PAYMENT` (entre contacto e LEAD_REGISTERED quando `paymentActive`)

**Especiais:** `LIVE_CHAT`, `ESCALATED_TO_HUMAN`, `CLOSED`

---

## Configuração via BD — `routingConfig` (`_id: 'yourbox_main'`)

| Campo | Tipo | Descrição |
|---|---|---|
| `systemActive` | bool | Liga/desliga processamento automático |
| `alwaysBot` | bool | Força bot em todos os horários (inclui 24h) |
| `autoStartHour` / `autoEndHour` | int | Horário do bot (default 9-20) |
| `autoWeekends` | bool | Bot activo ao fim-de-semana |
| `delayMinutesBeforeBot` | int | Espera antes de o bot assumir |
| `aggregationPriceThreshold` | number | Limiar € para oferecer análise de agregação |
| `collectFullAddresses` | bool | Recolher moradas completas |
| `paymentActive` | bool | Activar fluxo de pagamento |
| `paymentProvider` | string | `'stripe'` \| `'ifthenpay_mbway'` \| `'ifthenpay_pbl'` |
| `markupGlobal` | number | Markup sobre tarifas de parceiros |
| **`urgencyPhone`** | string | Telefone de urgência (em negrito nas msgs) |
| **`assistantName`** | string | Nome do assistente (após telefone de urgência) |

`URGENCY_NOTE` é **sempre construído dinamicamente** no início de cada handler a partir destes campos — nunca hardcoded no código.

---

## Serviço 24h — Padrões Críticos

### Horário e dia da semana (`build24hPriceHeader`)
| Condição | Cabeçalho | Nota |
|---|---|---|
| Semana, antes das 16h | "Entrega YourBox Amanhã — X kg" | Confirmar antes das 16h |
| Semana, após as 16h | "Entrega YourBox — 2 dias úteis — X kg" | ⚠️ Recolha amanhã, entrega depois |
| Sábado ou Domingo | "Entrega YourBox — 3ª feira — X kg" | Recolha 2ª-feira |
| Sexta-feira | passo `CONFIRMING_FRIDAY_DELIVERY` | Confirmar entrega 2ª-feira primeiro |

### Pré-preenchimento de carga (extraído de `observacoes` no form)
- Funções: `parseNVolumesFromText`, `parseTotalCm`, `parseWeightKgFromText` ← `lib/agent/partnerPricing.ts`
- Aplicados em `app/api/conversations/start/route.ts` → guardam `nVolumes`, `totalCm`, `weightKg` no doc da conversa
- **Bypass LLM:** se `weightKg` pré-preenchido + passo de preço + mensagem é "amanhã" → fabricar `{type:'calculate_tomorrow', weightKg, text:''}` e **saltar `getLlmResponse()`**

### Cargo recap (em toda mensagem de orçamento 24h)
```
_Carga confirmada: *N caixas* · C+L+A *X cm* · *Y kg*_
```
Função `cargoRecapLine(nVol, totalCm, kg)` definida localmente em cada route handler.

---

## Preços na lista de Leads / Clientes / Conversas

- `serviceType === 'arrasto'` → usar `partnerFinalPrice`
- `serviceType === 'direto'` → usar `priceWithDiscount`
- **NUNCA usar `??` entre os dois** — ambos podem estar preenchidos simultaneamente quando a lead mudou de serviço durante o chat. Usar discriminação explícita por `serviceType`.

---

## Ficheiros Chave

| Ficheiro | Propósito |
|---|---|
| `app/api/conversations/[id]/message/route.ts` | Handler bot web (principal) |
| `app/api/agent/message/route.ts` | Handler bot WhatsApp |
| `app/api/conversations/start/route.ts` | Cria conversa + pré-fill de carga |
| `app/api/routing-config/route.ts` | CRUD configuração do bot |
| `lib/agent/partnerPricing.ts` | Tarifas 24h + parse de carga |
| `lib/routing/decideMode.ts` | `decideMode()` + `defaultRoutingConfig` |
| `types/pricing.ts` | `LeadRoutingConfig` interface |
| `app/dashboard/page.tsx` | Painel de leads + UI config bot |
| `app/dashboard/clientes/page.tsx` | CRM de clientes |
| `app/dashboard/conversas/page.tsx` | Vista de conversas |
| `public/yourbox-chat-b.js` | Widget chat B (landing page) |
| `public/index-chat-b.html` | Landing page com form progressivo |
| `public/widget.html` | Widget para sites externos |
| `public/manual.html` | Manual de utilizador (v1.1) |

---

## MongoDB — Colecções Relevantes

| Colecção | Operação | Notas |
|---|---|---|
| `conversations` | R/W | Estado do bot, histórico de mensagens |
| `messages` | W | Leads e notificações (compatibilidade Meteor) |
| `routingConfig` | R/W | Config do bot (`_id: 'yourbox_main'`) |
| `clients` | R/W | CRM de clientes (widget clients) |
| `agentSituacoes` | R/W | 100+ situações de conhecimento do bot |
| `calculators` | R | Parâmetros de preço, polígonos, tarifas |
| `saveSimulationServices` | W | Histórico de simulações |
| `partnerPricing` | R | Tarifas de parceiros logísticos 24h |

---

## Infra Docker (servidor)

- Container: `yourbox-leads` na porta `3006`
- Rede: `yourbox-network` (nginx resolve por nome de container)
- **O nome do container é crítico** — o nginx tem `yourbox-leads` hardcoded no proxy host
- `.env.local` existe só no servidor — não está no git

---

*Actualizado: Maio 2026 — após implementação de: urgencyPhone/assistantName via BD, pré-fill de carga (nVolumes/totalCm/weightKg), cargo recap, cutoff 16h, fim-de-semana, fix preço por serviceType.*
