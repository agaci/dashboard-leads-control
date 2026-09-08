// Testes das máquinas de estado.
//
// A regra inviolável nº1 da spec é "nada muda de estado sem registo". O que se testa
// aqui é que isso é estrutural e não disciplina: não há forma de obter uma transição
// válida sem a entrada de histórico que a explica.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { transicao, podeTransitar, podeTransitarDispatch, ESTADOS_FINAIS } from './estados.ts';

test('o caminho feliz da venda de lead é o da spec', () => {
  const caminho = ['nova', 'triada', 'qualificada', 'distribuída', 'entregue', 'em_reporte', 'fechada'] as const;
  for (let i = 0; i < caminho.length - 1; i++) {
    assert.ok(
      podeTransitar('lead_sale', caminho[i], caminho[i + 1]),
      `${caminho[i]} -> ${caminho[i + 1]} devia ser possível`,
    );
  }
});

test('o caminho feliz da subcontratação é o da spec', () => {
  const caminho = ['nova', 'triada', 'em_cotação', 'proposta_enviada', 'adjudicada', 'em_execução', 'concluída'] as const;
  for (let i = 0; i < caminho.length - 1; i++) {
    assert.ok(podeTransitar('subcontract', caminho[i], caminho[i + 1]));
  }
});

test('não se salta passos', () => {
  assert.ok(!podeTransitar('lead_sale', 'triada', 'entregue'));
  assert.ok(!podeTransitar('subcontract', 'triada', 'adjudicada'));
});

test('os estados de uma rota não existem na outra', () => {
  const t = transicao('subcontract', 'triada', 'distribuída' as any, 'helder', 'engano');
  assert.equal(t.ok, false);
  assert.match(t.erro ?? '', /não existe na rota/);
});

test('uma transição válida traz sempre o registo', () => {
  const t = transicao('lead_sale', 'triada', 'qualificada', 'helder', 'CPL definido');
  assert.equal(t.ok, true);
  assert.equal(t.entrada?.estado, 'qualificada');
  assert.equal(t.entrada?.actor, 'helder');
  assert.equal(t.entrada?.motivo, 'CPL definido');
  assert.ok(t.entrada?.timestamp instanceof Date);
});

test('sem motivo não há transição — o histórico ficaria cego', () => {
  const t = transicao('lead_sale', 'triada', 'qualificada', 'helder', '   ');
  assert.equal(t.ok, false);
  assert.match(t.erro ?? '', /motivo obrigatório/);
});

test('não se transita para o mesmo estado', () => {
  const t = transicao('lead_sale', 'entregue', 'entregue', 'helder', 'de novo');
  assert.equal(t.ok, false);
});

test('estados finais são finais', () => {
  for (const final of ESTADOS_FINAIS) {
    const rota = final === 'concluída' ? 'subcontract' : 'lead_sale';
    const t = transicao(rota, final, 'triada', 'helder', 'reabrir');
    assert.equal(t.ok, false, `${final} não devia reabrir`);
  }
});

test('uma recusa válida devolve a lead ao mercado', () => {
  assert.ok(podeTransitar('lead_sale', 'recusada', 'qualificada'));
});

test('o dispatch não anda para trás', () => {
  assert.ok(podeTransitarDispatch('enviado', 'visto'));
  assert.ok(podeTransitarDispatch('visto', 'recusado'));
  // Um webhook de leitura atrasado não pode desfazer uma recusa.
  assert.ok(!podeTransitarDispatch('recusado', 'visto'));
  assert.ok(!podeTransitarDispatch('entregue', 'enviado'));
});

test('a janela de recusa abre depois de aceitar', () => {
  assert.ok(podeTransitarDispatch('aceite', 'recusado'));
});
