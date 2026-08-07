// Testes da escala de valor das conversões.
//
// A ordem entre os valores é a única coisa que o Google acaba por ler quando se
// optimiza por valor. Se ela se inverter por descuido numa edição futura, o
// algoritmo passa a preferir quem abandona o quiz — exactamente ao contrário.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONVERSION_VALUE, CONVERSION_CURRENCY } from './values.ts';
import { buildConversionsCsv } from './csv.ts';

test('uma lead completa vale mais do que qualquer parcial', () => {
  assert.ok(CONVERSION_VALUE.lead > CONVERSION_VALUE.parcial_telefone);
  assert.ok(CONVERSION_VALUE.lead > CONVERSION_VALUE.parcial_email);
});

test('telefone vale mais do que email', () => {
  // Em transporte urgente, quem deixa número quer resposta hoje.
  assert.ok(CONVERSION_VALUE.parcial_telefone > CONVERSION_VALUE.parcial_email);
});

test('nenhum valor é zero — o Google aceita 0 mas perde-se a escala', () => {
  for (const [k, v] of Object.entries(CONVERSION_VALUE)) {
    assert.ok(v > 0, `${k} tem de ser positivo`);
  }
});

test('a escala sobrevive à formatação de duas casas do CSV', () => {
  const linhas = (['lead', 'parcial_telefone', 'parcial_email'] as const).map((k) => ({
    clickId: 'X' + k,
    conversionName: 'Lead Yourbox',
    conversionTime: new Date('2026-08-07T10:00:00.000Z'),
    value: CONVERSION_VALUE[k],
    currency: CONVERSION_CURRENCY,
  }));
  const body = buildConversionsCsv(linhas).split('\r\n').slice(2).filter(Boolean);
  const valores = body.map((l) => Number(l.split(',')[3]));

  assert.deepEqual(valores, [1, 0.5, 0.3]);
  assert.ok(valores[0] > valores[1] && valores[1] > valores[2], 'a ordem tem de aguentar o arredondamento');
});

test('a moeda é a que o Google Ads espera para Portugal', () => {
  assert.equal(CONVERSION_CURRENCY, 'EUR');
});
