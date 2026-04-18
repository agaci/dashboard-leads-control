# YourBox — Dashboard Leads Control
## Documento de Arranque para Claude Code

> Versão 1.0 — Abril 2026  
> Stack: Next.js 14 (App Router) · TypeScript · MongoDB (acesso directo) · Tailwind CSS  
> Objectivo: substituir endpoints Meteor, centralizar gestão de leads, motor de preços, roteamento automático/manual e base de conhecimento do agente IA.

---

## 1. Contexto e Decisão de Arquitectura

A plataforma YourBox actual corre em **Meteor.js 1.6.2** (NodeChef). Toda a lógica de cálculo de preços, gestão de leads e notificações ao BO está dispersa nos endpoints Meteor. A decisão é **não tocar no Meteor** — a nova app acede directamente ao **MongoDB YourBox no NodeChef** e substitui progressivamente os endpoints.

```
yourbox.com.pt (landing page)
        │  GET/POST formulário
        ▼
dashboard-leads-control  (Next.js — ESTA APP)
        │  mongodb driver directo
        ▼
MongoDB YourBox (NodeChef)  ←→  Plataforma Meteor (continua intacta)
```

**Princípio:** a nova app só escreve em colecções novas ou em colecções que o Meteor já usa para receber dados (`messages`, `saveSimulationServices`, `services`). Nunca altera colecções que o Meteor gere exclusivamente.

---

## 2. Stack Técnico

| Componente | Tecnologia | Notas |
|---|---|---|
| Framework | Next.js 14 App Router | TypeScript obrigatório |
| Styling | Tailwind CSS | sem CSS modules |
| Base de dados | MongoDB driver nativo | sem Mongoose — acesso directo |
| Geocodificação | Google Maps Geocoding API | ~0.005 USD/req |
| Distâncias | Google Maps Distance Matrix API | ~0.01 USD/req |
| WhatsApp | WhatsApp Business API (Meta) | fase 2 |
| Pagamentos | MB Way / Multibanco | fase 3 |
| Deploy | NodeChef (mesma infra) | ou Vercel |

---

## 3. Variáveis de Ambiente

```env
# .env.local
MONGODB_URI=mongodb://...        # connection string BD YourBox NodeChef
GOOGLE_MAPS_API_KEY=AIza...
IVA=1.23
CALC_PRICE_MACHINE=calculator_1_FixCityPrice
NEXT_PUBLIC_APP_URL=https://...
```

---

## 4. Estrutura de Pastas

```
dashboard-leads-control/
├── app/
│   ├── api/
│   │   ├── price/route.ts              ← calcula preço (GET/POST)
│   │   ├── lead/route.ts               ← submete lead manual
│   │   ├── lead/[id]/route.ts          ← detalhe / actualização de lead
│   │   ├── routing/route.ts            ← decide MANUAL vs AUTO
│   │   └── health/route.ts             ← health check
│   ├── dashboard/
│   │   ├── page.tsx                    ← painel principal leads
│   │   ├── leads/[id]/page.tsx         ← detalhe de lead
│   │   └── knowledge/page.tsx          ← gestão base de conhecimento (SIT-100)
│   └── page.tsx                        ← redirect → /dashboard
├── lib/
│   ├── mongodb.ts                      ← conexão com pool
│   ├── pricing/
│   │   ├── geocode.ts                  ← Google Geocoding API
│   │   ├── distanceMatrix.ts           ← Google Distance Matrix API
│   │   ├── cityPolygon.ts              ← Ray casting pointInPolygon
│   │   ├── haversine.ts                ← distância directa entre coordenadas
│   │   ├── fixCityPrice.ts             ← Fases 1-3 → {LX, PT, GLX_GPT, distanciaFinal}
│   │   └── calculatePrice.ts           ← Fase 4 → {maxPrice, minPrice}
│   ├── routing/
│   │   └── decideMode.ts               ← MANUAL vs AUTOMÁTICO
│   ├── notifications/
│   │   ├── dashboard.ts                ← insere em messages collection
│   │   └── whatsapp.ts                 ← fase 2
│   └── agent/
│       ├── situacoes.ts                ← carrega base de conhecimento JSON
│       └── matcher.ts                  ← identifica situação activa
├── types/
│   └── pricing.ts                      ← interfaces TypeScript
├── data/
│   └── yourbox_situacoes_100.json      ← base de conhecimento do agente (100 SIT)
└── .env.local
```

---

## 5. Colecções MongoDB — Referência

| Colecção | Operação | Descrição |
|---|---|---|
| `calculators` | READ | Parâmetros de preço, polígonos, tarifas, comissões |
| `serverSettings` | READ | Flags do sistema, nome da calculadora, toggles |
| `messages` | WRITE | Leads e notificações no dashboard Meteor |
| `saveSimulationServices` | WRITE | Histórico de simulações de preço |
| `services` | WRITE | Criação de serviços automáticos |
| `pCodes` | READ | Cache de códigos postais → coordenadas |
| `leads` | READ/WRITE | **Nova colecção** — gestão de leads nesta app |
| `agentSituacoes` | READ/WRITE | **Nova colecção** — situações do agente editáveis pelo BO |

**Conexão MongoDB com pool (não reconectar por request):**

```typescript
// lib/mongodb.ts
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI!;
let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!(global as any)._mongoClientPromise) {
    client = new MongoClient(uri);
    (global as any)._mongoClientPromise = client.connect();
  }
  clientPromise = (global as any)._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export default clientPromise;

export async function getDb(dbName = 'yourbox') {
  const client = await clientPromise;
  return client.db(dbName);
}
```

---

## 6. Interfaces TypeScript Principais

```typescript
// types/pricing.ts

interface PriceRequest {
  local_recolha: string;
  local_entrega: string;
  peso_total?: string;       // "2" | "50" | "150" | "300"
  viatura?: string;          // "Moto" | "Furgão Classe 1" | "Furgão Classe 2"
  urgencia: string;          // "1 Hora" | "4 Horas" | "24 Horas"
  nome?: string;
  email?: string;
  telemovel?: string;
  variante?: string;
  numero_volumes?: string;
  comprimento?: string;
  largura?: string;
  altura?: string;
}

interface FixCityPriceResult {
  LX: number;
  PT: number;
  GLX_GPT: number;
  milestone: 'Lisboa' | 'Porto';
  distanciaFinal: number;    // km
  duracaoTotal: number;      // horas
}

interface PriceResult {
  maxPrice: number;
  minPrice: number;
  totalDistance: number;
  totalDuration: number;
  type: string;
  precedence: string;
  LX_PT: number;
  GLX_GPT: number;
}

type RoutingDecision = 'AUTO' | 'MANUAL';

interface LeadDocument {
  _id?: string;
  createdAt: Date;
  origem: string;
  destino: string;
  viatura: string;
  urgencia: string;
  nome?: string;
  email?: string;
  telemovel?: string;
  peso?: string;
  dimensoes?: { comprimento?: number; largura?: number; altura?: number };
  preco?: { min: number; max: number; distancia: number };
  routing: RoutingDecision;
  status: 'pending' | 'contacted' | 'converted' | 'lost';
  variante?: string;
  agentSituacaoId?: string;  // SIT que foi activada
  botAssigned: boolean;
  botAssignedAt?: Date;
}
```

---

## 7. Motor de Preços — Fases de Cálculo

O motor replica exactamente a lógica do `calculator_1_FixCityPrice` do Meteor. **Os resultados têm de ser idênticos.**

### Fase 1 — Geocodificação

```typescript
// lib/pricing/geocode.ts
export async function geocode(address: string): Promise<{lat: number; lng: number}> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}&region=pt&language=pt`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Geocode failed: ${data.status}`);
  return data.results[0].geometry.location; // { lat, lng }
}
```

**Optimização de custo:** verificar `pCodes` collection antes de chamar a API. Se o endereço contém código postal já mapeado, usar as coordenadas em cache.

### Fase 2 — Classificação por Polígono (Ray Casting)

```typescript
// lib/pricing/cityPolygon.ts
// Os polígonos de Lisboa e Porto estão guardados na colecção calculators
// calculators.poligonos.Lisboa = [[lat,lng], [lat,lng], ...]
// calculators.poligonos.Porto  = [[lat,lng], [lat,lng], ...]

export function pointInPolygon(lat: number, lng: number, polygon: [number,number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Classifica todos os pontos → {LX, PT, GLX_GPT}
export function classifyPoints(points: {lat:number;lng:number}[], poligonos: any) {
  let LX = 0, PT = 0, GLX_GPT = 0;
  for (const p of points) {
    if (pointInPolygon(p.lat, p.lng, poligonos.Lisboa)) LX++;
    else if (pointInPolygon(p.lat, p.lng, poligonos.Porto)) PT++;
    else GLX_GPT++;
  }
  return { LX, PT, GLX_GPT };
}
```

### Fase 3 — Distância Final

```typescript
// lib/pricing/fixCityPrice.ts
// 1. Escolher milestone: Lisboa se LX >= PT, Porto caso contrário
// 2. Calcular haversine de cada ponto ao milestone
// 3. Construir array [milestone, ...pontos_ordenados, milestone]
// 4. Chamar Distance Matrix API com esse array
// 5. Somar diagonal da matriz de resultados → distanciaFinal (km)

export async function fixCityPrice(
  local_recolha: string,
  local_entrega: string,
  poligonos: any
): Promise<FixCityPriceResult> {
  const [origem, destino] = await Promise.all([
    geocode(local_recolha),
    geocode(local_entrega)
  ]);
  
  const { LX, PT, GLX_GPT } = classifyPoints([origem, destino], poligonos);
  const milestone = LX >= PT ? 'Lisboa' : 'Porto';
  
  const { distanciaFinal, duracaoTotal } = await getDistanceMatrix(
    milestone, [local_recolha, local_entrega]
  );
  
  return { LX, PT, GLX_GPT, milestone, distanciaFinal, duracaoTotal };
}
```

### Fase 4 — Fórmula de Preço

```typescript
// lib/pricing/calculatePrice.ts
// Usa a fórmula simplificada da API (não a completa da calculadora interna)
// Diferença chave: sumFlatRate aplicado UMA vez (não duas) + IVA explícito

export function calculatePrice(
  result: FixCityPriceResult,
  params: { type: string; precedence: string },
  settings: any  // documento da colecção calculators
): PriceResult {
  const IVA = parseFloat(process.env.IVA || '1.23');
  const GLX_GPT = result.GLX_GPT > 0 ? 1 : 0;
  const LX_PT = Math.max(0, result.LX + result.PT - 1);
  const totalDistance = result.distanciaFinal;

  const typeSettings = settings[`type${params.type}`][`precedence${params.precedence}`];
  const { priceKm, priceMin, discount4To1 } = typeSettings;
  const percentPlusMax = settings.percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox;
  const percentPlusMin = settings.percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox;

  // Calcular sumFlatRate (fator hora + dia semana)
  const sumFlatRate = calcSumFlatRate(settings, new Date());
  const sumAdditionalKms = calcSumAdditionalKms(settings, new Date());

  let maxPrice = totalDistance * priceKm * sumAdditionalKms
               + priceMin * (LX_PT + GLX_GPT) * sumFlatRate;

  // Desconto 4h
  if (params.precedence === '4' && params.type !== '300') {
    maxPrice *= (1 - discount4To1);
  }

  const finalMax = Math.round(percentPlusMax * maxPrice * 10 * IVA) / 10;
  const finalMin = Math.round(percentPlusMin * priceMin * 10 * IVA) / 10;

  return {
    maxPrice: finalMax,
    minPrice: finalMin,
    totalDistance,
    totalDuration: result.duracaoTotal,
    type: params.type,
    precedence: params.precedence,
    LX_PT,
    GLX_GPT
  };
}
```

---

## 8. Mapeamentos Importantes

### viatura / peso → type

```typescript
function pesoParaType(peso: string): string {
  const p = parseInt(peso);
  if (p <= 2)   return '2';    // Moto
  if (p <= 50)  return '50';   // Carro
  if (p <= 150) return '150';  // Furgão Classe 1
  return '300';                 // Furgão Classe 2
}

const viaturaParaPeso: Record<string, string> = {
  'Moto': '2',
  'Furgão Classe 1': '150',
  'Furgão Classe 2': '300'
};
```

### urgencia → precedence

```typescript
const precedence = urgencia === '1 Hora' ? '1' : '4';
// '24 Horas' → não calcula — modo MANUAL directo
```

### Overrides automáticos

```typescript
// Moto em distância longa → passa a Carro
if (distanciaFinal > settings.globalParameters.distance2To50 && type === '2') {
  type = '50';
}
// Hora > 13h → força urgência 1h
if (new Date().getHours() > 13 && precedence === '4') {
  precedence = '1';
}
// Distância longa → força urgência 1h
if (distanciaFinal > settings.globalParameters.distance4To1) {
  precedence = '1';
}
```

---

## 9. Lógica de Roteamento MANUAL vs AUTOMÁTICO

```typescript
// lib/routing/decideMode.ts

export interface RoutingConfig {
  // Lidos de serverSettings na BD
  systemActive: boolean;           // createNewLeadMessageSimulatePrice
  sendEmail: boolean;              // createAndSendEmailSimulatorPrice
  // Configuráveis no dashboard desta app (nova colecção leadRoutingConfig)
  autoStartHour: number;           // default: 9
  autoEndHour: number;             // default: 20
  autoWeekends: boolean;           // default: false
  delayMinutesBeforeBot: number;   // minutos antes de passar ao bot (0 = imediato)
  alwaysBot: boolean;              // passa sempre ao bot sem esperar BO
  botSchedule?: {                  // horário específico para bot
    startHour: number;
    endHour: number;
  };
}

export function decideMode(config: RoutingConfig, urgencia: string, now: Date): RoutingDecision {
  if (!config.systemActive) return 'MANUAL';
  if (urgencia === '24 Horas') return 'MANUAL';
  
  const hour = now.getHours();
  const day = now.getDay(); // 0=Dom, 6=Sáb
  const isWeekend = day === 0 || day === 6;
  
  if (isWeekend && !config.autoWeekends) return 'MANUAL';
  if (hour < config.autoStartHour || hour >= config.autoEndHour) return 'MANUAL';
  
  return 'AUTO';
}

export function getResponseTimeText(now: Date): string {
  const h = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  
  if (!isWeekend && h >= 8 && h < 20)  return '5 minutos';
  if (!isWeekend && h >= 20 && h < 23) return '5 a 20 minutos';
  if (!isWeekend && (h >= 23 || h < 4))return '20 min a 4 horas';
  if (!isWeekend && h >= 4 && h < 8)   return '10 a 60 minutos';
  if (isWeekend && h >= 8 && h < 20)   return '10 a 30 minutos';
  return 'próximo dia útil';
}
```

---

## 10. Endpoint Principal — `/api/price`

```typescript
// app/api/price/route.ts
// Compatível com freeGetServicePriceAPI e freeGetServicePriceAPI2026

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const params: PriceRequest = {
    local_recolha: searchParams.get('local_recolha') || '',
    local_entrega:  searchParams.get('local_entrega') || '',
    viatura:        searchParams.get('viatura') || undefined,
    peso_total:     searchParams.get('peso_total') || undefined,
    urgencia:       searchParams.get('urgencia') || '1 Hora',
    nome:           searchParams.get('nome') || undefined,
    email:          searchParams.get('email') || undefined,
    telemovel:      searchParams.get('telemovel') || undefined,
    variante:       searchParams.get('variante') || undefined,
  };

  // Validação mínima
  if (!params.local_recolha || !params.local_entrega) {
    return Response.json({ error: 'local_recolha e local_entrega são obrigatórios' }, { status: 400 });
  }

  // 24h → MANUAL directo, sem cálculo
  if (params.urgencia === '24 Horas') {
    await insertLead({ ...params, routing: 'MANUAL', preco: null });
    return Response.json({ success: true, routing: 'MANUAL', message: 'Pedido recebido — será contactado em breve' });
  }

  // Ler configurações da BD
  const db = await getDb();
  const settings = await db.collection('calculators').findOne({ name: process.env.CALC_PRICE_MACHINE });
  const serverSettings = await db.collection('serverSettings').findOne({ companyProvider: 'Yourbox' });

  // Determinar type e precedence
  const peso = params.viatura ? viaturaParaPeso[params.viatura] : (params.peso_total || '2');
  let type = pesoParaType(peso);
  let precedence = params.urgencia === '1 Hora' ? '1' : '4';

  // Calcular preço
  const fixResult = await fixCityPrice(params.local_recolha, params.local_entrega, settings.poligonos);
  
  // Overrides
  if (fixResult.distanciaFinal > settings.globalParameters.distance2To50 && type === '2') type = '50';
  if (fixResult.distanciaFinal > settings.globalParameters.distance4To1 || new Date().getHours() > 13) precedence = '1';

  const priceResult = calculatePrice(fixResult, { type, precedence }, settings);

  // Decidir roteamento
  const routingConfig = await db.collection('leadRoutingConfig').findOne({}) || defaultRoutingConfig;
  const routing = decideMode(routingConfig, params.urgencia, new Date());

  // Guardar lead + notificar dashboard
  await insertLead({ ...params, routing, preco: { min: priceResult.minPrice, max: priceResult.maxPrice, distancia: fixResult.distanciaFinal } });
  
  if (routing === 'AUTO' || params.email) {
    await notifyDashboard({ params, priceResult, routing });
  }

  return Response.json({
    success: true,
    routing,
    maxPrice: priceResult.maxPrice,
    minPrice: priceResult.minPrice,
    totalDistance: fixResult.distanciaFinal,
    totalDuration: fixResult.duracaoTotal,
    responseTime: getResponseTimeText(new Date()),
    // Stats (compatibilidade com freeGetServicePriceAPI2026)
    stats: {
      simulationsToday: await countSimulationsToday(db),
      rating: 4.8,
      totalReviews: 1247
    }
  });
}
```

---

## 11. Dashboard de Leads — Funcionalidades Fase 1

O dashboard é a interface do BO para gerir leads. Construído em Next.js com Tailwind.

### Funcionalidades obrigatórias na Fase 1

- Lista de leads em tempo real (polling 30s ou SSE)
- Filtros: status, routing (AUTO/MANUAL), data, urgência
- Detalhe de lead: dados de contacto, preço calculado, distância, situação do agente activada
- Acções por lead: marcar como contactada, convertida, perdida
- Configuração do roteamento (os toggles e horários do `leadRoutingConfig`)
- Indicador visual: leads que passaram ao bot vs pendentes para BO

### Variáveis de controlo do roteamento (configuráveis no dashboard)

```typescript
interface LeadRoutingConfig {
  systemActive: boolean;           // on/off geral
  alwaysBot: boolean;              // todas as leads vão ao bot imediatamente
  delayMinutesBeforeBot: number;   // esperar X min antes de passar ao bot (0-60)
  autoStartHour: number;           // hora inicio modo auto (default 9)
  autoEndHour: number;             // hora fim modo auto (default 20)
  autoWeekends: boolean;           // activo ao fim-de-semana?
  botScheduleOverride?: {          // horário específico para o bot
    startHour: number;
    endHour: number;
  };
}
```

---

## 12. Base de Conhecimento do Agente — Integração

O ficheiro `data/yourbox_situacoes_100.json` é a base de conhecimento inicial. Na Fase 1 é lido do ficheiro. Na Fase 2 é gerido pela colecção `agentSituacoes` no MongoDB (editável pelo BO no dashboard).

```typescript
// lib/agent/matcher.ts
import situacoes from '@/data/yourbox_situacoes_100.json';

export function matchSituacao(
  mensagem: string,
  contexto: { urgencia?: string; peso?: string; destino?: string }
): string | null {
  // Procura a primeira situação cujos sinais_deteccao fazem match
  for (const sit of situacoes.situacoes) {
    const match = sit.sinais_deteccao?.some(sinal =>
      mensagem.toLowerCase().includes(sinal.toLowerCase())
    );
    if (match) return sit.id;
  }
  return null;
}
```

---

## 13. Casos Especiais e Regras de Negócio Críticas

| Regra | Comportamento |
|---|---|
| `urgencia = "24 Horas"` | Sempre MANUAL — nunca calcula preço |
| `hora > 13h` | Força precedence "1" (urgência 1h) |
| `type "2" + distância > distance2To50` | Passa automaticamente a type "50" |
| `createNewLeadMessageSimulatePrice = false` | Sistema bloqueado — retorna 503 |
| Todos os pontos na mesma cidade | `distanciaFinal = 0` — preço baseado só em flat rate |
| `LX_PT = 0` e `GLX_GPT = 0` | Trajecto intra-cidade — preço mínimo |
| Nome de parceiro | **Nunca exposto** ao cliente — apenas IDs internos |
| Peso e dimensões | **Primeiras perguntas sempre** — validar antes de qualquer cálculo |

---

## 14. Landing Page → Nova App — Alteração Mínima

A landing page `yourbox.com.pt` só precisa de mudar **uma linha** — o URL da API:

```javascript
// Antes (Meteor):
const API_URL = 'https://plataforma.yourbox.com.pt/api/freeGetServicePriceAPI2026';

// Depois (nova app):
const API_URL = 'https://leads.yourbox.com.pt/api/price';
```

A nova API é retrocompatível — aceita os mesmos parâmetros GET que o Meteor recebia.

---

## 15. WhatsApp — Fluxo de Passagem (Fase 2)

### Como a lead passa do formulário para o WhatsApp

1. Ao submeter o formulário, além do email de confirmação, incluir:
   ```html
   <a href="https://wa.me/351XXXXXXXXX?text=PSERV">
     Acompanhe o seu pedido no WhatsApp
   </a>
   ```
2. A lead clica → abre WhatsApp com código `PSERV` pré-preenchido
3. A lead envia → o agente reconhece o código e inicia o diálogo
4. Para leads que não clicam: enviar template HSM aprovado pela Meta após X minutos (configurável no dashboard)

### Código de activação do agente

```
PSERV  → inicia qualificação de novo serviço
ESTADO → consulta estado de serviço existente
AJUDA  → lista de opções disponíveis
```

---

## 16. Checklist de Implementação — Fase 1

### Setup
- [ ] `npx create-next-app@latest dashboard-leads-control --typescript --tailwind --app`
- [ ] Instalar dependências: `mongodb`, `@types/mongodb`
- [ ] Configurar `.env.local` com `MONGODB_URI`, `GOOGLE_MAPS_API_KEY`, `IVA`
- [ ] Testar conexão MongoDB e leitura de `calculators` e `serverSettings`

### Motor de preços
- [ ] `geocode(address)` → `{lat, lng}` — testar com moradas Lisboa/Porto
- [ ] `pointInPolygon(lat, lng, polygon)` — Ray Casting — testar com pontos conhecidos
- [ ] `classifyPoints` → `{LX, PT, GLX_GPT}` — validar contra resultados Meteor
- [ ] `haversine(p1, p2)` → km
- [ ] `chooseMilestone(LX, PT)` → 'Lisboa' | 'Porto'
- [ ] `getDistanceMatrix(addresses[])` → `{distanciaFinal, duracaoTotal}`
- [ ] `fixCityPrice(recolha, entrega)` → `FixCityPriceResult`
- [ ] `calculatePrice(result, params, settings)` → `{maxPrice, minPrice}`
- [ ] **Validação crítica:** comparar 10 trajectorias com resultados actuais do Meteor — têm de coincidir

### Roteamento
- [ ] `decideMode(config, urgencia, now)` → 'AUTO' | 'MANUAL'
- [ ] `getResponseTimeText(now)` → string
- [ ] Ler/escrever `leadRoutingConfig` na BD

### API endpoint `/api/price`
- [ ] GET com params da landing page v1 e v2026
- [ ] Retorno compatível com o que a landing page espera
- [ ] Inserir lead na colecção `leads`
- [ ] Notificar colecção `messages` (dashboard Meteor)

### Dashboard
- [ ] Lista de leads com filtros básicos
- [ ] Painel de configuração do roteamento (toggles e horários)
- [ ] Detalhe de lead com acções (contactada, convertida, perdida)

### Testes de regressão obrigatórios
- [ ] Lisboa → Porto, Moto, 1h: preço = X€
- [ ] Lisboa → Lisboa, Carro, 4h: preço = Y€ (distância 0 → flat rate)
- [ ] urgencia "24 Horas" → MANUAL, sem preço
- [ ] Hora 14h + precedence "4" → forçar precedence "1"
- [ ] type "2" + 80km → forçar type "50"

---

## 17. Notas para o Claude Code

- **Não usar Mongoose** — MongoDB driver nativo para máximo controlo e performance
- **Pool de conexões** — implementar conforme `lib/mongodb.ts` acima — nunca reconectar por request
- **Fórmula de preço** — usar a versão simplificada da API (secção 7, Fase 4) — não a versão completa da calculadora interna
- **IVA** — sempre aplicar no final (`* parseFloat(process.env.IVA)`)
- **Nomes de parceiros** — nunca expor ao cliente, nem em logs acessíveis externamente
- **Peso e dimensões** — validar sempre antes de qualquer cálculo de preço
- **`percentPlusMax/Min`** — campos com nomes longos na BD: `percentPlusMaxForcalcPriceMachineForAPIFromSiteYourbox` e `percentPlusMinForcalcPriceMachineForAPIFromSiteYourbox`
- **Base de conhecimento** — `data/yourbox_situacoes_100.json` já existe — incluir no projecto desde o arranque

---

*Gerado a partir de: `Princing-engine-calculator_1_FixCityPrice.md`, `form-lead.md`, base de conhecimento YourBox 100 situações, e sessão de arquitectura com Hélder — Abril 2026.*
