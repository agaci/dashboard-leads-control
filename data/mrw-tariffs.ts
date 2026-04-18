import type { PartnerTariff } from '@/types/partner';

// Dados extraídos de: MRW 2026 (a partir de fevereiro) e MRW 3ª Cidade
// Zona: Nacional (Urbano/Distrital/Limítrofe/Nacional têm mesmo preço base)
// Suplemento acima 25km: €6.16 — aplicado sempre em rotas nacionais
// Suplemento sábado: €9.80

const CONDITIONS_STANDARD = {
  minWeightPerVolume: 2,
  maxWeightPerExpedition: 250,
  maxWeightPerVolume: 80,
  surchargeAt40kg: 17.39,
  surchargeAt60kg: 23.76,
  maxDimensionCm: 300,
};

export const MRW_TARIFFS: Omit<PartnerTariff, '_id' | 'updatedAt'>[] = [

  // ── MRW AMANHÃ 19h ────────────────────────────────────────────────────────
  {
    partner: 'MRW',
    serviceLabel: 'Entrega Amanhã até às 19h',
    serviceLabelShort: 'Amanhã 19h',
    deliveryWindow: '19h',
    deliveryDescription: 'Recolha hoje · Entrega garantida até às 19h do dia seguinte (dias úteis)',
    zone: 'Nacional',
    active: true,
    sortOrder: 1,
    validFrom: new Date('2026-02-01'),
    weightTiers: [
      { maxKg: 2,  price: 3.29 },
      { maxKg: 5,  price: 3.39 },
      { maxKg: 10, price: 4.08 },
      { additionalPerKg: 0.28, price: 0.28 },
    ],
    dimensionalSurcharges: [
      { minCm: 151, maxCm: 200, surcharge: 4.12 },
      { minCm: 201, maxCm: 250, surcharge: 9.67 },
      { minCm: 251, maxCm: 300, surcharge: 18.97 },
    ],
    supplements: { saturday: 9.80, above25km: 6.16 },
    conditions: CONDITIONS_STANDARD,
  },

  // ── MRW AMANHÃ 13h ────────────────────────────────────────────────────────
  {
    partner: 'MRW',
    serviceLabel: 'Entrega Amanhã até às 13h',
    serviceLabelShort: 'Amanhã 13h',
    deliveryWindow: '13h',
    deliveryDescription: 'Recolha hoje · Entrega garantida até às 13h do dia seguinte (dias úteis)',
    zone: 'Nacional',
    active: true,
    sortOrder: 2,
    validFrom: new Date('2026-02-01'),
    weightTiers: [
      { maxKg: 2,  price: 4.63 },
      { maxKg: 5,  price: 5.10 },
      { maxKg: 10, price: 7.66 },
      { additionalPerKg: 0.55, price: 0.55 },
    ],
    dimensionalSurcharges: [
      { minCm: 151, maxCm: 200, surcharge: 5.58 },
      { minCm: 201, maxCm: 250, surcharge: 15.38 },
      { minCm: 251, maxCm: 300, surcharge: 29.16 },
    ],
    supplements: { saturday: 9.80, above25km: 6.16 },
    conditions: CONDITIONS_STANDARD,
  },

  // ── MRW AMANHÃ 10h ────────────────────────────────────────────────────────
  {
    partner: 'MRW',
    serviceLabel: 'Entrega Amanhã até às 10h',
    serviceLabelShort: 'Amanhã 10h',
    deliveryWindow: '10h',
    deliveryDescription: 'Recolha hoje · Entrega prioritária até às 10h do dia seguinte (dias úteis)',
    zone: 'Nacional',
    active: true,
    sortOrder: 3,
    validFrom: new Date('2026-02-01'),
    weightTiers: [
      { maxKg: 2,  price: 8.76 },
      { maxKg: 5,  price: 8.84 },
      { maxKg: 10, price: 15.67 },
      { additionalPerKg: 1.00, price: 1.00 },
    ],
    dimensionalSurcharges: [
      { minCm: 151, maxCm: 200, surcharge: 7.86 },
      { minCm: 201, maxCm: 250, surcharge: 22.34 },
      { minCm: 251, maxCm: 300, surcharge: 38.28 },
    ],
    supplements: { saturday: 9.80, above25km: 6.16 },
    conditions: CONDITIONS_STANDARD,
  },

  // ── MRW 3ª CIDADE — AMANHÃ 19h ────────────────────────────────────────────
  // Para destinos fora de Lisboa e Porto (3ª cidade continental)
  // Estrutura diferente: base até 2kg + incrementos de 5kg e 50cm
  {
    partner: 'MRW',
    serviceLabel: 'Entrega Amanhã 19h — Interior',
    serviceLabelShort: 'Amanhã 19h Interior',
    deliveryWindow: '19h',
    deliveryDescription: 'Recolha hoje · Entrega até às 19h do dia seguinte · Interior do país',
    zone: 'Nacional-Interior',
    active: false, // activar quando necessário
    sortOrder: 4,
    validFrom: new Date('2026-02-01'),
    weightTiers: [
      { maxKg: 2,  price: 8.25 },
      { maxKg: 5,  price: 10.13 },
      { additionalPerKg: 6.33 / 5, price: 6.33 / 5 }, // €6.33 per 5kg = €1.27/kg
    ],
    dimensionalSurcharges: [
      // +€12.99 per 50cm above 100cm (3ª cidade structure)
      { minCm: 101, maxCm: 150, surcharge: 12.99 },
      { minCm: 151, maxCm: 200, surcharge: 25.98 },
      { minCm: 201, maxCm: 250, surcharge: 38.97 },
      { minCm: 251, maxCm: 300, surcharge: 51.96 },
    ],
    supplements: { saturday: 9.80, above25km: 0 }, // already included in 3ª cidade rates
    conditions: CONDITIONS_STANDARD,
    notes: 'Tabela MRW 3ª Cidade — para destinos que não Lisboa ou Porto',
  },

  // ── MRW 3ª CIDADE — AMANHÃ 13h ────────────────────────────────────────────
  {
    partner: 'MRW',
    serviceLabel: 'Entrega Amanhã 13h — Interior',
    serviceLabelShort: 'Amanhã 13h Interior',
    deliveryWindow: '13h',
    deliveryDescription: 'Recolha hoje · Entrega até às 13h do dia seguinte · Interior do país',
    zone: 'Nacional-Interior',
    active: false,
    sortOrder: 5,
    validFrom: new Date('2026-02-01'),
    weightTiers: [
      { maxKg: 2,  price: 11.03 },
      { maxKg: 5,  price: 10.00 },
      { additionalPerKg: 10.00 / 5, price: 10.00 / 5 }, // €2.00/kg
    ],
    dimensionalSurcharges: [
      { minCm: 101, maxCm: 150, surcharge: 18.39 },
      { minCm: 151, maxCm: 200, surcharge: 36.78 },
      { minCm: 201, maxCm: 250, surcharge: 55.17 },
      { minCm: 251, maxCm: 300, surcharge: 73.56 },
    ],
    supplements: { saturday: 9.80, above25km: 0 },
    conditions: CONDITIONS_STANDARD,
    notes: 'Tabela MRW 3ª Cidade — para destinos que não Lisboa ou Porto',
  },
];
