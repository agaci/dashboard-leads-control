# Ifthenpay — Pay By Link (PBL) & PINPAY · Documentação de Integração
## Para uso no Claude Code — YourBox Leads (Next.js / Node.js)

> Fonte: ifthenpay.com/docs + helpdesk.ifthenpay.com + GitHub oficial ifthenpay
> Data de compilação: Abril 2026

---

## 1. O que é o Pay By Link

O Pay By Link (PBL) gera um **link de pagamento** que podes enviar ao cliente por qualquer canal
(WhatsApp, email, SMS, chat). O cliente abre o link numa página hosted pela Ifthenpay,
escolhe o método de pagamento preferido e paga.

**Para o YourBox Leads é o método ideal** — o bot já está no WhatsApp, basta
enviar o link no final da conversa. Não é necessário pedir o número de telemóvel
para fazer push MB Way.

```
Bot qualifica lead
     ↓
Calcula preço
     ↓
Gera link PBL via API
     ↓
Envia pelo WhatsApp: "Para confirmar o serviço, pague aqui: [link]"
     ↓
Cliente abre o link e escolhe MB Way / Multibanco / Cartão
     ↓
Ifthenpay chama webhook → YourBox liberta o serviço
```

---

## 2. Comparação PBL vs MB Way directo

| | MB Way Directo | Pay By Link |
|---|---|---|
| Como funciona | Push para app MB Way do cliente | Link que o cliente abre |
| Canal de envio | Precisa do nº de telemóvel | WhatsApp, email, SMS, chat |
| Métodos aceites | Só MB Way | MB Way + Multibanco + Cartão + Apple Pay + Google Pay + outros |
| Expiração | 4 minutos fixos | Configurável em dias |
| Experiência cliente | Notificação automática na app | Cliente escolhe o método |
| Ideal quando | Já tens o telemóvel | Estás a conversar pelo WhatsApp/chat |
| Chave necessária | `MBWAY_KEY` | `GATEWAY_KEY` |

---

## 3. Credenciais necessárias

```
GATEWAY_KEY       = "NXXX-999999"        # Gateway Key — fornecida pela Ifthenpay
ANTI_PHISHING_KEY = "chave_secreta..."   # Token que defines tu para callbacks
```

A `GATEWAY_KEY` tem o formato `NXXX-999999` ou `ITPG-000000` — diferente da MBWAY_KEY.
Pedir à Ifthenpay no momento do contrato ou separadamente.

---

## 4. Três formas de usar

### Forma A — Simple Checkout (link directo, sem chamada API)

A forma mais simples. Constróis o URL directamente com parâmetros GET.

**URL Structure:**
```
https://gateway.ifthenpay.com/?token=[GATEWAY_KEY]&id=[ORDER_ID]&amount=[AMOUNT]&description=[DESCRIPTION]&expire=[EXPIRE]&lang=[LANG]
```

**Exemplo real:**
```
https://gateway.ifthenpay.com/?token=NXXX-999999&id=YB001234&amount=45.00&description=YourBox+Serviço+YB001234&expire=20260422&lang=PT&selected_method=2
```

`selected_method=2` abre directamente no separador MB Way — recomendado para YourBox.

**Todos os parâmetros:**

| Parâmetro | Obrig. | Descrição |
|---|---|---|
| `token` | Sim | Gateway Key |
| `id` | Sim | ID do pedido — máx. 15 chars numéricos |
| `amount` | Sim | Valor — formato `45.00` |
| `description` | Não | Descrição — HTML-friendly, máx. 200 chars |
| `lang` | Não | Idioma: `PT`, `EN`, `ES` (default: `PT`) |
| `expire` | Não | Data de expiração — formato `YYYYMMDD` |
| `selected_method` | Não | Tab aberto por defeito: `1`=Multibanco, `2`=MB Way, `3`=Payshop, `4`=Cartão, `7`=Cofidis, `8`=PIX |
| `accounts` | Não* | Métodos disponíveis — ver secção 5 |
| `success_url` | Não | Redirect após pagamento bem sucedido |
| `cancel_url` | Não | Redirect se cliente cancela |
| `error_url` | Não | Redirect em caso de erro |
| `return_url` | Não | URL para voltar ao site |
| `btn_close_url` | Não | URL do botão "Fechar" |
| `btn_close_label` | Não | Texto do botão "Fechar" |
| `iframe` | Não | `true` se embutido em iframe |

*Se Gateway Key for dinâmica, `accounts` é obrigatório.

---

### Forma B — API POST (gera link programaticamente)

Gera o link via chamada API e recebe o `RedirectUrl` para enviar ao cliente.

**Endpoint:** `POST https://api.ifthenpay.com/gateway/pinpay/[GATEWAY_KEY]`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "id": "YB001234",
  "amount": "45.00",
  "description": "YourBox Serviço #YB001234",
  "lang": "pt",
  "expiredate": "20260422",
  "accounts": "MBWAY|XXX-000000;MB|BEM-700700",
  "success_url": "https://leads.yourbox.com.pt/payment/success",
  "error_url": "https://leads.yourbox.com.pt/payment/error",
  "cancel_url": "https://leads.yourbox.com.pt/payment/cancel"
}
```

**Campos do body:**

| Campo | Obrig. | Descrição |
|---|---|---|
| `id` | Sim | ID do pedido — máx. 15 chars numéricos |
| `amount` | Sim | Valor — formato `"45.00"` (string, ponto decimal) |
| `description` | Não | Descrição — máx. 200 chars |
| `lang` | Não | `pt`, `en`, `es`, `fr` (default: `pt`) |
| `expiredate` | Não | Expiração — formato `YYYYMMDD` |
| `accounts` | Não* | Métodos — ver secção 5 |
| `btnCloseUrl` | Não | URL botão fechar |
| `btnCloseLabel` | Não | Texto botão fechar |
| `success_url` | Não | Redirect sucesso |
| `error_url` | Não | Redirect erro |
| `cancel_url` | Não | Redirect cancelamento |

**Resposta (HTTP 200):**
```json
{
  "PinCode": "1234567890",
  "RedirectUrl": "https://gateway.ifthenpay.com/url/r54aiUE1dX"
}
```

| Campo | Descrição |
|---|---|
| `RedirectUrl` | **O link a enviar ao cliente** pelo WhatsApp |
| `PinCode` | Código alternativo — cliente digita em pinpay.pt |

---

### Forma C — PINPAY (código PIN)

O PINPAY usa o mesmo endpoint que a Forma B mas o cliente paga digitando o
`PinCode` em `https://pinpay.pt` em vez de clicar num link.
Útil para SMS ou mensagens onde links ficam pouco visíveis.

---

## 5. Campo `accounts` — controlar métodos disponíveis

O campo `accounts` define quais os métodos de pagamento que aparecem na página.
Formato: `TIPO|CHAVE;TIPO|CHAVE;...`

| Código | Método |
|---|---|
| `MB\|MB-KEY` | Multibanco dinâmico |
| `ENTITY\|SUBENTITY` | Multibanco offline |
| `MBWAY\|MBWAY-KEY` | MB Way |
| `PAYSHOP\|PAYSHOP-KEY` | Payshop |
| `CCARD\|CCARD-KEY` | Cartão Visa/Mastercard |
| `COFIDIS\|COFIDIS-KEY` | Cofidis Pay |
| `GOOGLE\|GOOGLE-KEY` | Google Pay |
| `APPLE\|APPLE-KEY` | Apple Pay |
| `PIX\|PIX-KEY` | PIX (Brasil) |

**Exemplo — só MB Way e Multibanco:**
```
"accounts": "MBWAY|XXX-000000;MB|BEM-700700"
```

**Exemplo — MB Way, Multibanco e Cartão:**
```
"accounts": "MBWAY|XXX-000000;MB|BEM-700700;CCARD|CRD-000000"
```

---

## 6. Webhook (Callback) — receber confirmação de pagamento

Funciona da mesma forma que no MB Way — a Ifthenpay faz GET para a tua URL
quando o pagamento é confirmado.

**Formato do callback:**
```
GET https://yourapp.com/api/payments/pbl/callback
  ?key=SEU_ANTI_PHISHING_KEY
  &id=YB001234
  &amount=45.00
  &payment_datetime=21-04-2026 18:46:12
  &payment_method=MBWAY
```

**Parâmetros recebidos:**

| Parâmetro | Descrição |
|---|---|
| `key` | Anti-phishing key — **validar sempre** |
| `id` | Order ID que passaste no pedido |
| `amount` | Valor pago |
| `payment_datetime` | Data/hora formato `dd-MM-yyyy HH:mm:ss` |
| `payment_method` | Método usado: `MBWAY`, `MB`, `CCARD`, `PAYSHOP`, etc. |

**Regras de retry idênticas ao MB Way:**
- Retornar `HTTP 200` para confirmar recepção
- Em caso de falha: 8 tentativas a cada 5 min + 5 tentativas a cada 1h (13 total)

---

## 7. Implementação TypeScript completa

### Service PBL

```typescript
// lib/payments/paybylink.ts

interface PblPaymentRequest {
  orderId: string;
  amount: number;
  description?: string;
  expireDate?: Date;
  lang?: 'pt' | 'en' | 'es' | 'fr';
  accounts?: string;
  successUrl?: string;
  cancelUrl?: string;
  errorUrl?: string;
}

interface PblPaymentResponse {
  success: boolean;
  redirectUrl?: string;
  pinCode?: string;
  error?: string;
}

interface PblCallbackPayload {
  key: string;
  id: string;
  amount: string;
  payment_datetime: string;
  payment_method: string;
}

export class PayByLinkService {
  private readonly gatewayKey: string;
  private readonly antiPhishingKey: string;
  private readonly baseUrl = 'https://api.ifthenpay.com/gateway/pinpay';
  private readonly gatewayBaseUrl = 'https://gateway.ifthenpay.com';

  constructor() {
    this.gatewayKey      = process.env.PBL_GATEWAY_KEY!;
    this.antiPhishingKey = process.env.PBL_ANTI_PHISHING_KEY!;
  }

  // Gerar link via API POST
  async createPaymentLink(req: PblPaymentRequest): Promise<PblPaymentResponse> {
    // Formatar data de expiração
    const expireDate = req.expireDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000); // default: 24h
    const expireDateStr = expireDate.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const body = {
      id:          req.orderId.slice(0, 15),
      amount:      req.amount.toFixed(2),
      description: (req.description ?? `YourBox #${req.orderId}`).slice(0, 200),
      lang:        req.lang ?? 'pt',
      expiredate:  expireDateStr,
      accounts:    req.accounts ?? `MBWAY|${process.env.MBWAY_KEY};MB|${process.env.MB_KEY}`,
      success_url: req.successUrl ?? process.env.PBL_SUCCESS_URL,
      error_url:   req.errorUrl  ?? process.env.PBL_ERROR_URL,
      cancel_url:  req.cancelUrl ?? process.env.PBL_CANCEL_URL,
    };

    try {
      const response = await fetch(`${this.baseUrl}/${this.gatewayKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        success:     true,
        redirectUrl: data.RedirectUrl,
        pinCode:     data.PinCode,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // Gerar link simples sem chamada API (Simple Checkout)
  createSimpleLink(req: PblPaymentRequest): string {
    const expireDate = req.expireDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expireDateStr = expireDate.toISOString().slice(0, 10).replace(/-/g, '');

    const params = new URLSearchParams({
      token:           this.gatewayKey,
      id:              req.orderId.slice(0, 15),
      amount:          req.amount.toFixed(2),
      description:     (req.description ?? `YourBox #${req.orderId}`).slice(0, 200),
      lang:            req.lang ?? 'PT',
      expire:          expireDateStr,
      selected_method: '2', // MB Way por defeito
    });

    if (req.successUrl) params.set('success_url', req.successUrl);
    if (req.cancelUrl)  params.set('cancel_url', req.cancelUrl);

    return `${this.gatewayBaseUrl}/?${params.toString()}`;
  }

  // Validar callback
  validateCallback(payload: PblCallbackPayload): boolean {
    return payload.key === this.antiPhishingKey;
  }
}

export const pblService = new PayByLinkService();
```

---

### Endpoint API — gerar link

```typescript
// app/api/payments/pbl/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { pblService } from '@/lib/payments/paybylink';
import { getDb } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, orderId, amount, description } = body;

  if (!orderId || !amount) {
    return NextResponse.json(
      { error: 'orderId e amount são obrigatórios' },
      { status: 400 }
    );
  }

  // Expiração: 24 horas
  const expireDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const result = await pblService.createPaymentLink({
    orderId,
    amount,
    description: description ?? `YourBox Serviço #${orderId}`,
    expireDate,
    lang: 'pt',
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
    cancelUrl:  `${process.env.NEXT_PUBLIC_APP_URL}/payment/cancel`,
    errorUrl:   `${process.env.NEXT_PUBLIC_APP_URL}/payment/error`,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Erro ao gerar link de pagamento' },
      { status: 500 }
    );
  }

  // Guardar na BD
  const db = await getDb();
  await db.collection('leads').updateOne(
    { _id: leadId },
    {
      $set: {
        pblOrderId:    orderId,
        pblRedirectUrl: result.redirectUrl,
        pblPinCode:    result.pinCode,
        pblStatus:     'pending',
        pblCreatedAt:  new Date(),
        pblExpiresAt:  expireDate,
      }
    }
  );

  return NextResponse.json({
    success:     true,
    redirectUrl: result.redirectUrl,
    pinCode:     result.pinCode,
    // Mensagem pronta para enviar pelo WhatsApp
    whatsappMessage: `Para confirmar o seu serviço YourBox, pague aqui:\n${result.redirectUrl}\n\nDisponível por 24 horas.`,
  });
}
```

---

### Webhook — receber confirmação

```typescript
// app/api/payments/pbl/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { pblService } from '@/lib/payments/paybylink';
import { getDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const payload = {
    key:              searchParams.get('key') ?? '',
    id:               searchParams.get('id') ?? '',
    amount:           searchParams.get('amount') ?? '',
    payment_datetime: searchParams.get('payment_datetime') ?? '',
    payment_method:   searchParams.get('payment_method') ?? '',
  };

  // 1. Validar anti-phishing
  if (!pblService.validateCallback(payload)) {
    console.error('PBL callback: chave anti-phishing inválida');
    // Retornar 200 para não causar retentativas com chave errada
    return new NextResponse('OK', { status: 200 });
  }

  try {
    const db = await getDb();

    // 2. Actualizar lead como paga
    await db.collection('leads').updateOne(
      { pblOrderId: payload.id },
      {
        $set: {
          pblStatus:       'paid',
          paidAt:          new Date(),
          paidAmount:      parseFloat(payload.amount),
          paymentMethod:   payload.payment_method, // MBWAY, MB, CCARD, etc.
          paidDatetime:    payload.payment_datetime,
        }
      }
    );

    // 3. Lógica YourBox — lançar serviço, notificar BO, notificar cliente
    console.log(`PBL pago: ordem ${payload.id}, ${payload.amount}€ via ${payload.payment_method}`);

    // Retornar 200 — obrigatório para a Ifthenpay não retentar
    return new NextResponse('OK', { status: 200 });

  } catch (error) {
    console.error('Erro ao processar PBL callback:', error);
    // Retornar 200 mesmo em erro interno — evitar retentativas
    return new NextResponse('OK', { status: 200 });
  }
}
```

---

## 8. Mensagem WhatsApp — exemplos prontos

```typescript
// lib/payments/whatsapp-messages.ts

export function buildPaymentMessage(params: {
  clientName: string;
  orderId: string;
  amount: number;
  origin: string;
  destination: string;
  paymentUrl: string;
  pinCode?: string;
}): string {
  const { clientName, orderId, amount, origin, destination, paymentUrl, pinCode } = params;

  let msg = `Olá ${clientName}! ✓\n\n`;
  msg += `O seu serviço YourBox está confirmado:\n`;
  msg += `📦 ${origin} → ${destination}\n`;
  msg += `💶 Valor: ${amount.toFixed(2)}€\n\n`;
  msg += `Para activar o serviço, efectue o pagamento:\n`;
  msg += `👉 ${paymentUrl}\n\n`;

  if (pinCode) {
    msg += `Ou use o código PIN em pinpay.pt: ${pinCode}\n\n`;
  }

  msg += `O link expira em 24 horas. Após pagamento confirmado, enviamos os detalhes do motorista.`;

  return msg;
}
```

---

## 9. Variáveis de ambiente

```env
# .env.local

# Pay By Link
PBL_GATEWAY_KEY=NXXX-999999
PBL_ANTI_PHISHING_KEY=chave_secreta_pbl
PBL_SUCCESS_URL=https://leads.yourbox.com.pt/payment/success
PBL_CANCEL_URL=https://leads.yourbox.com.pt/payment/cancel
PBL_ERROR_URL=https://leads.yourbox.com.pt/payment/error

# Chaves dos métodos de pagamento (para o campo accounts)
MBWAY_KEY=XXX-000000
MB_KEY=BEM-700700
CCARD_KEY=CRD-000000

# MB Way directo (mantido para compatibilidade)
MBWAY_BACKOFFICE_KEY=1111-1111-1111-1111
MBWAY_ANTI_PHISHING_KEY=chave_secreta_mbway
```

---

## 10. Schema MongoDB — campos PBL

```typescript
interface LeadPaymentPbl {
  pblOrderId?:     string;    // ID passado à Ifthenpay (= orderId do serviço)
  pblRedirectUrl?: string;    // Link de pagamento gerado
  pblPinCode?:     string;    // Código PIN alternativo
  pblStatus?:      'pending' | 'paid' | 'expired' | 'cancelled';
  pblCreatedAt?:   Date;
  pblExpiresAt?:   Date;
  paidAt?:         Date;
  paidAmount?:     number;
  paymentMethod?:  'MBWAY' | 'MB' | 'CCARD' | 'PAYSHOP' | 'GOOGLE' | 'APPLE';
  paidDatetime?:   string;    // String da Ifthenpay: "dd-MM-yyyy HH:mm:ss"
}
```

---

## 11. Estratégia recomendada para YourBox Leads

```
Serviço urgente (lead deu telemóvel, quer pagar agora)
  → usar MB Way directo (4 min, push imediato)

Serviço normal (bot no WhatsApp, link mais conveniente)
  → usar Pay By Link com selected_method=2 (MB Way aberto por defeito)
  → se cliente não pagar em 30 min → enviar PBL com todos os métodos
  → se não pagar em 24h → follow-up SIT-009

Serviço via email
  → Simple Checkout link embutido no email
```

---

## 12. Limites e restrições

| Parâmetro | Valor |
|---|---|
| Máx. chars `id` | 15 (numérico) |
| Máx. chars `description` | 200 |
| Expiração configurável | Por dias (YYYYMMDD) |
| Tentativas callback em falha | 13 (8×5min + 5×1h) |
| `selected_method` para MB Way | `2` |
| Idiomas suportados | pt, en, es, fr |

---

## 13. Notas para o Claude Code

- **PBL é preferível ao MB Way directo** para o contexto WhatsApp/chat — não precisa do telemóvel, o cliente escolhe o método
- **Simple Checkout** (Forma A) é suficiente para maioria dos casos — não precisa de chamada API, só construir o URL
- **Forma B (API POST)** usar quando precisas de registar o `PinCode` na BD ou quando queres URLs mais curtos
- **`selected_method=2`** abre o separador MB Way por defeito — deixar assim para YourBox
- **`expiredate`** — recomenda-se 24h para dar tempo ao cliente sem deixar em aberto demasiado tempo
- **Callback `payment_method`** diz o método usado (MBWAY, MB, CCARD) — útil para analytics
- **Retornar sempre HTTP 200** no webhook, mesmo em erro interno

---

*Compilado a partir de: ifthenpay.com/docs/en/guides/simple-checkout, helpdesk.ifthenpay.com (API PayByLink & PINPAY, API deprecated), GitHub ifthenpay/ifthenpay-sdk-php — Abril 2026*
