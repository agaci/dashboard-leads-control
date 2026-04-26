const API_URL = 'https://api.ifthenpay.com/gateway/pinpay';

export interface PblResult {
  success: boolean;
  redirectUrl?: string;
  pinCode?: string;
  error?: string;
}

export async function createPayByLink(params: {
  gatewayKey: string;
  orderId: string;        // máx. 15 chars numéricos
  amount: number;         // euros, ex: 45.50
  description?: string;  // máx. 200 chars
  expireHours?: number;  // default: 24h
  accounts?: string;     // ex: "MBWAY|XXX-000000;MB|BEM-700700"
}): Promise<PblResult> {
  const expireDate = new Date(Date.now() + (params.expireHours ?? 24) * 60 * 60 * 1000);
  const expireDateStr = expireDate.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  const body = {
    id:          params.orderId.replace(/\D/g, '').slice(0, 15),
    amount:      params.amount.toFixed(2),
    description: (params.description ?? 'YourBox Leads').slice(0, 200),
    lang:        'pt',
    expiredate:  expireDateStr,
    ...(params.accounts ? { accounts: params.accounts } : {}),
  };

  try {
    const res = await fetch(`${API_URL}/${params.gatewayKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return {
      success:     true,
      redirectUrl: data.RedirectUrl,
      pinCode:     data.PinCode,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Extrai 9 dígitos do número PT para usar como orderId numérico (máx 15 chars)
export function phoneToOrderId(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Remove prefixo 351 se presente
  if (digits.startsWith('351') && digits.length >= 12) return digits.slice(3);
  return digits;
}
