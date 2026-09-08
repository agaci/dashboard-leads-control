// Testes do cruzamento capacidade x pedido.
//
// A spec chama a esta a peça mais crítica do sistema. O erro que interessa evitar é
// sempre o mesmo: dizer que sim quando é não. Uma carga ADR entregue a quem não tem
// certificação não é um bug de software.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capacidadeServe, ordenar } from './capacidades.ts';
import type { CrmCapability, CrmPartner } from '../../types/crm.ts';

function cap(over: Partial<CrmCapability> = {}): CrmCapability {
  return {
    _id: 'c1', partnerId: 'p1', categoria: 'sobrepeso', zonas: ['nacional'],
    prioridade: 0, active: true, ...over,
  };
}

test('um limite ausente é "sem limite", não "zero"', () => {
  // Uma capacidade acabada de criar tem de aceitar tudo até alguém a restringir.
  const r = capacidadeServe(cap(), { categoria: 'sobrepeso', weightKg: 5000, totalCm: 900 });
  assert.equal(r.serve, true);
});

test('peso acima do máximo do parceiro exclui', () => {
  const r = capacidadeServe(cap({ maxWeightKg: 500 }), { categoria: 'sobrepeso', weightKg: 900 });
  assert.equal(r.serve, false);
  assert.match(r.motivo, /900 kg/);
});

test('peso dentro do máximo passa', () => {
  assert.equal(capacidadeServe(cap({ maxWeightKg: 500 }), { categoria: 'sobrepeso', weightKg: 500 }).serve, true);
});

test('categoria diferente nunca serve', () => {
  assert.equal(capacidadeServe(cap({ categoria: 'adr' }), { categoria: 'mudancas' }).serve, false);
});

test('capacidade inactiva não entra', () => {
  assert.equal(capacidadeServe(cap({ active: false }), { categoria: 'sobrepeso' }).serve, false);
});

test('parceiro nacional cobre qualquer zona', () => {
  assert.equal(capacidadeServe(cap({ zonas: ['nacional'] }), { categoria: 'sobrepeso', zona: 'faro' }).serve, true);
});

test('parceiro regional só cobre as suas zonas', () => {
  const c = cap({ zonas: ['lisboa', 'setubal'] });
  assert.equal(capacidadeServe(c, { categoria: 'sobrepeso', zona: 'lisboa' }).serve, true);
  assert.equal(capacidadeServe(c, { categoria: 'sobrepeso', zona: 'braga' }).serve, false);
});

test('zona desconhecida não passa por um parceiro regional', () => {
  // Sem saber onde é a recolha, dizer que sim é adivinhar.
  const r = capacidadeServe(cap({ zonas: ['lisboa'] }), { categoria: 'sobrepeso' });
  assert.equal(r.serve, false);
});

test('ADR exige certificação declarada', () => {
  assert.equal(capacidadeServe(cap({ categoria: 'adr' }), { categoria: 'adr', adr: true }).serve, false);
  assert.equal(capacidadeServe(cap({ categoria: 'adr', adr: true }), { categoria: 'adr', adr: true }).serve, true);
});

test('cadeia de frio exige capacidade declarada', () => {
  assert.equal(capacidadeServe(cap({ categoria: 'temperatura' }), { categoria: 'temperatura', temperatura: true }).serve, false);
  assert.equal(capacidadeServe(cap({ categoria: 'temperatura', temperatura: true }), { categoria: 'temperatura', temperatura: true }).serve, true);
});

// ── Ordem de entrada ─────────────────────────────────────────────────────────

function parceiro(over: Partial<CrmPartner> = {}): CrmPartner {
  return {
    _id: 'p1', nome: 'Parceiro', canaisPreferidos: [], deviceTokens: [],
    estado: 'ativo', score: 50, leadsGratisRestantes: 0, ...over,
  };
}

test('o score abre e fecha a torneira de leads', () => {
  const ordenados = ordenar([
    { parceiro: parceiro({ _id: 'fraco', score: 20 }), capacidade: cap(), rank: 0 },
    { parceiro: parceiro({ _id: 'forte', score: 90 }), capacidade: cap(), rank: 0 },
  ]);
  assert.equal(ordenados[0].parceiro._id, 'forte');
});

test('parceiro activo entra antes de um em trial, mesmo com score pior', () => {
  const ordenados = ordenar([
    { parceiro: parceiro({ _id: 'trial', estado: 'trial', score: 99 }), capacidade: cap(), rank: 0 },
    { parceiro: parceiro({ _id: 'ativo', estado: 'ativo', score: 30 }), capacidade: cap(), rank: 0 },
  ]);
  assert.equal(ordenados[0].parceiro._id, 'ativo');
});

test('com tudo igual desempata a prioridade manual', () => {
  const ordenados = ordenar([
    { parceiro: parceiro({ _id: 'b' }), capacidade: cap({ prioridade: 5 }), rank: 0 },
    { parceiro: parceiro({ _id: 'a' }), capacidade: cap({ prioridade: 1 }), rank: 0 },
  ]);
  assert.equal(ordenados[0].parceiro._id, 'a');
});
