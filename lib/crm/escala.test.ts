import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degrau, DEGRAUS } from './escala.ts';

test('o zero sai da escala', () => {
  // Nao e o tom mais fraco: e vazado. Um distrito sem ninguem e o que se foi la ver.
  assert.equal(degrau(0, 10), -1);
  assert.equal(degrau(-1, 10), -1);
});

test('o menor valor nao nulo fica no fundo e o maior no topo', () => {
  assert.equal(degrau(1, 10), 0);
  assert.equal(degrau(10, 10), DEGRAUS - 1);
});

test('a escala usa a gama toda mesmo com poucos valores', () => {
  // Com maximo 2 havia um formato anterior que nunca chegava ao tom mais forte: o
  // distrito com mais parceiros do pais aparecia a meio da escala.
  assert.equal(degrau(1, 2), 0);
  assert.equal(degrau(2, 2), DEGRAUS - 1);
});

test('com maximo de um, o que existe pinta-se por inteiro', () => {
  assert.equal(degrau(1, 1), DEGRAUS - 1);
});

test('os valores do meio distribuem-se', () => {
  const meio = degrau(5, 9);
  assert.ok(meio > 0 && meio < DEGRAUS - 1, `degrau ${meio} devia estar no meio`);
});

test('nunca sai fora dos limites', () => {
  for (const max of [1, 2, 3, 7, 50, 400]) {
    for (const v of [0, 1, 2, 3, max - 1, max, max + 5]) {
      const g = degrau(v, max);
      assert.ok(g >= -1 && g <= DEGRAUS - 1, `degrau(${v}, ${max}) = ${g}`);
    }
  }
});

test('um valor acima do maximo nao rebenta a escala', () => {
  // Acontece se a contagem e o maximo vierem de chamadas diferentes, com o mapa a
  // actualizar-se entre as duas.
  assert.equal(degrau(99, 10), DEGRAUS - 1);
});

test('valores nao numericos nao pintam nada', () => {
  assert.equal(degrau(NaN, 10), -1);
  assert.equal(degrau(undefined as unknown as number, 10), -1);
});
