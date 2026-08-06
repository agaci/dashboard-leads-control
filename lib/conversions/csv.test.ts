// Testes da formatação do CSV de conversões offline.
//
//   npm test
//
// O Google rejeita o ficheiro inteiro por um cabeçalho trocado ou uma data mal
// formatada, e só dá o erro horas depois. Estes testes são a única rede.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConversionsCsv,
  csvCell,
  ensureAfterClick,
  formatConversionTime,
} from './csv.ts';

const LEAD_TIME = new Date('2026-08-06T13:22:31.000Z'); // Verão em Lisboa: UTC+1

test('as duas primeiras linhas são literais e exactas', () => {
  const csv = buildConversionsCsv([]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Parameters:TimeZone=Europe/Lisbon');
  assert.equal(lines[1], 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency');
});

test('um ficheiro sem linhas mantém o cabeçalho', () => {
  const csv = buildConversionsCsv([]);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
});

test('a coluna do identificador muda conforme o tipo', () => {
  assert.match(buildConversionsCsv([], { kind: 'wbraid' }).split('\r\n')[1], /^WBRAID,/);
  assert.match(buildConversionsCsv([], { kind: 'gbraid' }).split('\r\n')[1], /^GBRAID,/);
  assert.match(buildConversionsCsv([], { kind: 'gclid' }).split('\r\n')[1], /^Google Click ID,/);
});

test('hora de Verão em Lisboa: UTC+1', () => {
  assert.equal(formatConversionTime(new Date('2026-08-06T13:22:31.000Z')), '2026-08-06 14:22:31');
});

test('hora de Inverno em Lisboa: UTC+0', () => {
  assert.equal(formatConversionTime(new Date('2026-01-15T13:22:31.000Z')), '2026-01-15 13:22:31');
});

test('meia-noite sai como 00, nunca como 24', () => {
  // 00:30 em Lisboa no Inverno.
  assert.equal(formatConversionTime(new Date('2026-01-15T00:30:00.000Z')), '2026-01-15 00:30:00');
});

test('data inválida rebenta em vez de escrever lixo no ficheiro', () => {
  assert.throws(() => formatConversionTime(new Date('nada')));
});

test('a conversão é empurrada para depois do clique', () => {
  const click = new Date('2026-08-06T13:30:00.000Z');
  const lead = new Date('2026-08-06T13:20:00.000Z'); // relógio do browser adiantado
  const ajustada = ensureAfterClick(lead, click);
  assert.ok(ajustada.getTime() > click.getTime(), 'tem de ficar depois do clique');
  assert.equal(ajustada.getTime(), click.getTime() + 60_000);
});

test('uma conversão já posterior ao clique fica intacta', () => {
  const click = new Date('2026-08-06T13:00:00.000Z');
  const lead = new Date('2026-08-06T13:20:00.000Z');
  assert.equal(ensureAfterClick(lead, click).getTime(), lead.getTime());
});

test('sem data de clique não há ajuste', () => {
  const lead = new Date('2026-08-06T13:20:00.000Z');
  assert.equal(ensureAfterClick(lead, null).getTime(), lead.getTime());
});

test('escape de vírgulas e aspas', () => {
  assert.equal(csvCell('Lead Yourbox'), 'Lead Yourbox');
  assert.equal(csvCell('Lead, Yourbox'), '"Lead, Yourbox"');
  assert.equal(csvCell('Lead "Y"'), '"Lead ""Y"""');
  assert.equal(csvCell('linha\nnova'), '"linha\nnova"');
});

test('linha completa no formato que o Google espera', () => {
  const csv = buildConversionsCsv([{
    clickId: 'Cj0KCQjw_TESTE123',
    conversionName: 'Lead Yourbox',
    conversionTime: LEAD_TIME,
    value: 0,
    currency: 'EUR',
  }]);
  const linha = csv.split('\r\n')[2];
  assert.equal(linha, 'Cj0KCQjw_TESTE123,Lead Yourbox,2026-08-06 14:22:31,0.00,EUR');
});

test('valor monetário sai sempre com duas casas', () => {
  const csv = buildConversionsCsv([{
    clickId: 'X', conversionName: 'Lead Yourbox', conversionTime: LEAD_TIME,
    value: 47.5, currency: 'EUR',
  }]);
  assert.match(csv.split('\r\n')[2], /,47\.50,EUR$/);
});

test('um nome de conversão com vírgula não parte as colunas', () => {
  const csv = buildConversionsCsv([{
    clickId: 'X', conversionName: 'Lead, Yourbox', conversionTime: LEAD_TIME,
    value: 0, currency: 'EUR',
  }]);
  assert.equal(csv.split('\r\n')[2], 'X,"Lead, Yourbox",2026-08-06 14:22:31,0.00,EUR');
});
