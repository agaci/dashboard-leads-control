# Ifthenpay — MB Way API · Documentação de Integração
## Para uso no Claude Code — YourBox Leads (Next.js / Node.js)

> Fonte: helpdesk.ifthenpay.com + ifthenpay.com/docs + GitHub oficial ifthenpay
> Data de compilação: Abril 2026

---

## 1. Visão geral

A Ifthenpay disponibiliza **duas versões** da API MB Way:

| Versão | Estado | Usar? |
|---|---|---|
| API v1 (SOAP/WSDL) | **Deprecated** | NÃO — não usar para novas integrações |
| API v2 (REST/JSON) | **Activa** | SIM — esta é a documentação abaixo |

**Taxa:** 0,7% + €0,07 por transacção (+ IVA)
**Suporte:** suporte@ifthenpay.com · 808 222 777 · +351 227 660 871

---

## 2. Credenciais necessárias

Para integrar precisas de:

```
MBWAY_KEY        = "XXX-000000"      # Chave MB Way atribuída pela Ifthenpay no contrato
BACKOFFICE_KEY   = "1111-1111-1111-1111"  # Chave de backoffice (para reembolsos e consultas)
ANTI_PHISHING_KEY = "a0a0a0a0a0a0..."    # Token que defines tu para autenticar callbacks
```

A `MBWAY_KEY` tem o formato `ITP-000000` ou `XXX-000000` — fornecida pela Ifthenpay na assinatura do contrato.
Para obter chaves de **teste**, contactar a Ifthenpay directamente.

---

## 3. Fluxo completo de pagamento

```
1. Cliente fornece número de telemóvel
        ↓
2. App envia POST para API Ifthenpay (initPayment)
        ↓
3. Ifthenpay envia notificação push para a app MB Way do cliente
        ↓
4. Cliente aceita/rejeita na app MB Way (4 minutos para responder)
        ↓
5. Ifthenpay chama o teu webhook (callback URL)
        ↓
6. App recebe confirmação e libera o serviço YourBox
```

---

## 4. Endpoint — Iniciar pagamento

### API v2 REST (USAR ESTA)

**Método:** `POST`
**Endpoint:** `https://ifthenpay.com/api/endpoint/mbway/v2`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "mbWayKey": "XXX-000000",
  "orderId": "YB-001234",
  "amount": "45.00",
  "mobileNumber": "351#912345678",
  "email": "cliente@email.com",
  "description": "YourBox Leads - Serviço YB-001234"
}
```

**Campos obrigatórios:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `mbWayKey` | string | Sim | Chave MB Way fornecida pela Ifthenpay |
| `orderId` | string | Sim | ID do pedido — máx. 15 caracteres alfanuméricos |
| `amount` | string | Sim | Valor em euros — formato "45.00" (ponto como separador decimal) |
| `mobileNumber` | string | Sim | Número com prefixo país: "351#912345678" |
| `email` | string | Não | Email do cliente |
| `description` | string | Não | Descrição — máx. 50 caracteres |

**Formato do número de telemóvel:**
```
Portugal:       "351#912345678"   ← sempre com 351# à frente
Internacional:  "44#7911123456"   ← prefixo do país + # + número
```

**Resposta de sucesso (HTTP 200):**
```json
{
  "Status": "000",
  "Message": "Success",
  "RequestId": "abc123def456",
  "ExpirationDate": "2026-04-21T18:48:00"
}
```

**Campos da resposta:**

| Campo | Descrição |
|---|---|
| `Status` | "000" = sucesso · outro código = erro |
| `Message` | Descrição do resultado |
| `RequestId` | ID único da transacção — **guardar na BD para verificação de estado** |
| `ExpirationDate` | Data/hora de expiração (por defeito 4 minutos) |

**Códigos de estado (Status):**

| Código | Descrição |
|---|---|
| `000` | Pedido enviado com sucesso ao cliente |
| `020` | Transacção cancelada pelo utilizador |
| `048` | Transacção cancelada pelo comerciante |
| `100` | Operação não concluída |
| `104` | Operação financeira não permitida |
| `111` | Formato do número de telemóvel inválido |
| `113` | Número de telemóvel não encontrado na MB Way |
| `122` | Operação recusada ao utilizador |
| `123` | Transacção financeira não encontrada |
| `125` | Operação recusada ao utilizador |

---

## 5. Verificar estado de pagamento

**Método:** `GET`
**Endpoint:** `https://ifthenpay.com/api/endpoint/mbway/v2/{mbWayKey}/{requestId}`

```
GET https://ifthenpay.com/api/endpoint/mbway/v2/XXX-000000/abc123def456
```

**Resposta:**
```json
{
  "Status": "000",
  "Message": "Success"
}
```

> ⚠️ **Rate limiting** — este endpoint está sujeito a rate limiting. Não usar em cron jobs de baixo intervalo. Para produção, usar o webhook (secção 6) como método principal.

**Expiração padrão:** 4 minutos. Configurável na conta Ifthenpay (`minutesToExpire`).

---

## 6. Webhook (Callback) — Receber confirmação de pagamento

A Ifthenpay chama o teu endpoint quando o pagamento é confirmado ou rejeitado.

### Activação
Tens de pedir à Ifthenpay para activar o callback com a tua URL e a tua `ANTI_PHISHING_KEY`.
Fazê-lo via email ou helpdesk antes de ir para produção.

### Formato da chamada (GET para a tua URL)

A Ifthenpay faz um GET para o URL que configuraste, com estes parâmetros:

```
https://yourapp.com/api/payments/mbway/callback
  ?chave=SEU_ANTI_PHISHING_KEY
  &referencia=REFERENCIA_MB_WAY
  &idpedido=ID_TRANSACAO
  &valor=45.00
  &datahorapag=21-04-2026 18:46:12
  &estado=PAGO
```

**Parâmetros recebidos:**

| Parâmetro | Descrição |
|---|---|
| `chave` | A tua `ANTI_PHISHING_KEY` — validar sempre antes de processar |
| `referencia` | Referência MB Way da transacção |
| `idpedido` | `RequestId` retornado no initPayment |
| `valor` | Valor pago em euros |
| `datahorapag` | Data/hora do pagamento (formato: `dd-MM-yyyy HH:mm:ss`) |
| `estado` | `"PAGO"` quando pago com sucesso |

### Resposta esperada pelo servidor Ifthenpay

O teu endpoint **deve retornar HTTP 200** para confirmar que recebeu.

- `HTTP 200` → Ifthenpay considera sucesso, não tenta de novo
- `HTTP 400/500/outro` → Ifthenpay considera falha, retenta:
  - 8 tentativas de 5 em 5 minutos
  - Depois mais 5 tentativas de hora em hora
  - Total: **13 tentativas** — se nenhuma devolver 200, desiste

### Implementação do webhook em Next.js (App Router)

```typescript
// app/api/payments/mbway/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const chave         = searchParams.get('chave');
  const referencia    = searchParams.get('referencia');
  const idpedido      = searchParams.get('idpedido');
  const valor         = searchParams.get('valor');
  const datahorapag   = searchParams.get('datahorapag');
  const estado        = searchParams.get('estado');

  // 1. Validar anti-phishing key
  if (chave !== process.env.MBWAY_ANTI_PHISHING_KEY) {
    console.error('Callback MB Way: chave anti-phishing inválida');
    return new NextResponse('Unauthorized', { status: 401 });
    // NOTA: retornar 401 faz com que Ifthenpay retente — usar só para chave errada
    // Para erros internos retornar 200 e tratar depois
  }

  // 2. Verificar se pagamento foi aceite
  if (estado !== 'PAGO') {
    console.log(`Callback MB Way: estado ${estado} para pedido ${idpedido}`);
    // Actualizar estado do pedido na BD conforme necessário
    return new NextResponse('OK', { status: 200 });
  }

  // 3. Processar pagamento confirmado
  try {
    const db = await getDb();

    // Actualizar lead na BD — marcar como paga
    await db.collection('leads').updateOne(
      { mbwayRequestId: idpedido },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          paidAmount: parseFloat(valor || '0'),
          mbwayReferencia: referencia,
        }
      }
    );

    // Aqui: disparar lógica YourBox — lançar serviço, notificar BO, etc.
    console.log(`Pagamento confirmado: pedido ${idpedido}, valor ${valor}€`);

    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error('Erro ao processar callback MB Way:', error);
    // IMPORTANTE: retornar 200 mesmo em erro interno
    // para não causar retentativas desnecessárias da Ifthenpay
    return new NextResponse('OK', { status: 200 });
  }
}
```

---

## 7. Reembolso

**Endpoint:** `POST https://ifthenpay.com/api/endpoint/payments/refund`

**Body (JSON):**
```json
{
  "backofficekey": "1111-1111-1111-1111",
  "requestId": "abc123def456",
  "amount": "45.00"
}
```

**Resposta:**
```json
{
  "Code": 1,
  "Message": "Successful refunded"
}
```

**Códigos de resposta:**

| Code | Message | Descrição |
|---|---|---|
| `1` | `Successful refunded` | Reembolso efectuado com sucesso |
| `-1` | `Insufficient funds` | Saldo insuficiente* |
| `0` | (mensagem de erro) | Verificar mensagem |

> *O saldo é a soma de todos os fundos ainda não transferidos para a conta — apenas pagamentos desde as 20h do dia anterior até ao momento do reembolso.

---

## 8. Implementação completa — service em TypeScript

```typescript
// lib/payments/mbway.ts

interface MbwayPaymentRequest {
  orderId: string;
  amount: number;
  mobileNumber: string;
  email?: string;
  description?: string;
}

interface MbwayPaymentResponse {
  success: boolean;
  requestId?: string;
  expirationDate?: string;
  status: string;
  message: string;
}

interface MbwayCallbackPayload {
  chave: string;
  referencia: string;
  idpedido: string;
  valor: string;
  datahorapag: string;
  estado: string;
}

export class MbwayService {
  private readonly mbwayKey: string;
  private readonly backofficeKey: string;
  private readonly antiPhishingKey: string;
  private readonly baseUrl = 'https://ifthenpay.com/api/endpoint/mbway/v2';

  constructor() {
    this.mbwayKey        = process.env.MBWAY_KEY!;
    this.backofficeKey   = process.env.MBWAY_BACKOFFICE_KEY!;
    this.antiPhishingKey = process.env.MBWAY_ANTI_PHISHING_KEY!;
  }

  // Formatar número de telemóvel português
  formatPhone(phone: string): string {
    // Remove espaços, hífens, +
    const clean = phone.replace(/[\s\-+]/g, '');
    // Se começa com 351, adicionar # se não tiver
    if (clean.startsWith('351')) return `351#${clean.slice(3)}`;
    // Se começa com 9 (número português sem indicativo)
    if (clean.startsWith('9') && clean.length === 9) return `351#${clean}`;
    // Assumir que já tem indicativo
    return clean.includes('#') ? clean : `351#${clean}`;
  }

  // Iniciar pagamento MB Way
  async initPayment(req: MbwayPaymentRequest): Promise<MbwayPaymentResponse> {
    const body = {
      mbWayKey: this.mbwayKey,
      orderId: req.orderId.slice(0, 15), // máx 15 chars
      amount: req.amount.toFixed(2),
      mobileNumber: this.formatPhone(req.mobileNumber),
      email: req.email ?? '',
      description: (req.description ?? `YourBox #${req.orderId}`).slice(0, 50),
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return {
      success: data.Status === '000',
      requestId: data.RequestId,
      expirationDate: data.ExpirationDate,
      status: data.Status,
      message: data.Message,
    };
  }

  // Verificar estado de pagamento (usar com moderação — rate limited)
  async checkStatus(requestId: string): Promise<{ status: string; message: string }> {
    const url = `${this.baseUrl}/${this.mbwayKey}/${requestId}`;
    const response = await fetch(url);
    const data = await response.json();
    return { status: data.Status, message: data.Message };
  }

  // Validar callback recebido
  validateCallback(payload: MbwayCallbackPayload): boolean {
    return payload.chave === this.antiPhishingKey;
  }

  // Reembolso
  async refund(requestId: string, amount: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch('https://ifthenpay.com/api/endpoint/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backofficekey: this.backofficeKey,
        requestId,
        amount: amount.toFixed(2),
      }),
    });

    const data = await response.json();
    return {
      success: data.Code === 1,
      message: data.Message,
    };
  }
}

export const mbwayService = new MbwayService();
```

---

## 9. Endpoint de pagamento no Next.js

```typescript
// app/api/payments/mbway/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mbwayService } from '@/lib/payments/mbway';
import { getDb } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, mobileNumber, amount, orderId } = body;

  // Validação básica
  if (!mobileNumber || !amount || !orderId) {
    return NextResponse.json({ error: 'Campos obrigatórios em falta' }, { status: 400 });
  }

  // Valor mínimo €0.50, máximo €5.000
  if (amount < 0.50 || amount > 5000) {
    return NextResponse.json({ error: 'Valor fora dos limites MB Way (€0,50 – €5.000)' }, { status: 400 });
  }

  const result = await mbwayService.initPayment({
    orderId,
    amount,
    mobileNumber,
    description: `YourBox Serviço #${orderId}`,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.message, code: result.status },
      { status: 422 }
    );
  }

  // Guardar requestId na BD para relacionar com o callback
  const db = await getDb();
  await db.collection('leads').updateOne(
    { _id: leadId },
    {
      $set: {
        mbwayRequestId: result.requestId,
        mbwayStatus: 'pending',
        mbwayInitiatedAt: new Date(),
        mbwayExpiresAt: new Date(result.expirationDate!),
      }
    }
  );

  return NextResponse.json({
    success: true,
    requestId: result.requestId,
    expiresAt: result.expirationDate,
    message: 'Notificação MB Way enviada. O cliente tem 4 minutos para aceitar.'
  });
}
```

---

## 10. Variáveis de ambiente necessárias

```env
# .env.local

MBWAY_KEY=XXX-000000
MBWAY_BACKOFFICE_KEY=1111-1111-1111-1111
MBWAY_ANTI_PHISHING_KEY=chave_secreta_que_defines_tu

# URL do callback (registar na Ifthenpay)
MBWAY_CALLBACK_URL=https://leads.yourbox.com.pt/api/payments/mbway/callback
```

---

## 11. Schema MongoDB para pagamentos

```typescript
// Campos a adicionar à colecção 'leads'

interface LeadPayment {
  // Campos MB Way
  mbwayRequestId?:    string;    // RequestId retornado pela Ifthenpay
  mbwayReferencia?:   string;    // Referência MB Way (vem no callback)
  mbwayStatus?:       'pending' | 'paid' | 'expired' | 'rejected' | 'refunded';
  mbwayInitiatedAt?:  Date;
  mbwayExpiresAt?:    Date;
  paidAt?:            Date;
  paidAmount?:        number;
}
```

---

## 12. Limites e restrições importantes

| Parâmetro | Valor |
|---|---|
| Valor mínimo por transacção | €0,50 |
| Valor máximo por transacção | €5.000 |
| Limite diário por utilizador (default) | €1.000 |
| Limite diário por utilizador (máximo configurável na app MB Way) | €10.000 |
| Tempo de expiração padrão | 4 minutos |
| Máx. caracteres orderId | 15 |
| Máx. caracteres description | 50 |
| Tentativas de callback em caso de falha | 13 (8 × 5min + 5 × 1h) |
| Reembolso — prazo máximo | Dia corrente (saldo disponível desde as 20h do dia anterior) |

---

## 13. Notas para o Claude Code

- **Não usar SDK PHP** — integração directa via `fetch` em TypeScript é mais limpa para Next.js
- **IMPORTANTE:** guardar sempre o `RequestId` na BD para relacionar com o callback
- **Callback é assíncrono** — o pagamento não é confirmado no momento do `initPayment`, só quando o cliente aceita na app e o callback chega
- **Mostrar countdown de 4 minutos** ao cliente após iniciar pagamento — é boa prática (como o módulo WHMCS faz)
- **Rate limiting no checkStatus** — usar apenas para polling ocasional, nunca em loop
- **Anti-phishing key** — validar SEMPRE antes de processar qualquer callback
- **Retornar HTTP 200** no callback mesmo em erros internos — para não causar retentativas desnecessárias
- **Para testes** — pedir chaves de teste à Ifthenpay; criar conta MB Way de teste e não confirmar os pagamentos

---

## 14. Suporte Ifthenpay

- Email: suporte@ifthenpay.com
- Telefone: 808 222 777 | +351 227 660 871
- Helpdesk: helpdesk.ifthenpay.com
- Novo ticket: helpdesk.ifthenpay.com/support/tickets/new
- Documentação nova: ifthenpay.com/docs (requer JavaScript)
- GitHub oficial: github.com/ifthenpay

---

*Compilado a partir de: helpdesk.ifthenpay.com (API v1 deprecated + API Refunds), ifthenpay.com/docs (v2 REST), GitHub ifthenpay/ifthenpay-sdk-php, GitHub ifthenpay/WHMCS — Abril 2026*
