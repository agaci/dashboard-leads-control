const BASE_URL = 'https://ifthenpay.com/api/endpoint/mbway/v2';

export interface IfthenpayMbwayResult {
  success: boolean;
  requestId: string;
  expirationDate?: string;
  status: string;   // '000' = sucesso
  message: string;
}

export async function createIfthenpayMbway(params: {
  mbwayKey: string;
  orderId: string;    // máx. 15 caracteres
  amount: number;     // euros, ex: 15.50
  phone: string;      // qualquer formato — normalizado internamente
  email?: string;
  description?: string;
}): Promise<IfthenpayMbwayResult> {
  const body = {
    mbWayKey: params.mbwayKey,
    orderId: params.orderId.slice(0, 15),
    amount: params.amount.toFixed(2),
    mobileNumber: normalizePhoneIfthenpay(params.phone),
    email: params.email ?? '',
    description: (params.description ?? 'YourBox Leads').slice(0, 50),
  };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return {
    success: data.Status === '000',
    requestId: data.RequestId ?? '',
    expirationDate: data.ExpirationDate,
    status: data.Status ?? 'error',
    message: data.Message ?? '',
  };
}

// Normaliza para formato Ifthenpay: "351#912345678"
export function normalizePhoneIfthenpay(raw: string): string {
  const clean = raw.replace(/[\s\-+]/g, '');
  if (clean.includes('#')) return clean;
  if (clean.startsWith('351') && clean.length === 12) return `351#${clean.slice(3)}`;
  if (clean.startsWith('9') && clean.length === 9) return `351#${clean}`;
  return `351#${clean}`;
}
