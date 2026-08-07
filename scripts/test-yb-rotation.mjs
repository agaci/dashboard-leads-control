// Valida o algoritmo de rotação circular de site_YB/yb-rotation.php.
//
//   node --test scripts/test-yb-rotation.mjs
//
// Não há PHP nesta máquina, por isso o que se testa aqui é o ALGORITMO, portado
// linha a linha a partir do ficheiro PHP. Não substitui um teste do código PHP
// real — serve para garantir que a matemática da intercalação está certa, que é
// a parte onde é fácil enganarmo-nos. O resto do ficheiro PHP (locks, ficheiro
// de estado) está escrito para devolver null a qualquer falha, e o index.php
// trata null como "usa o sorteio aleatório de sempre".

import test from 'node:test';
import assert from 'node:assert/strict';

/** Porto fiel de yb_rotation_sequence(). Qualquer alteração no PHP tem de vir aqui. */
function sequence(weights) {
  let total = 0;
  for (const w of Object.values(weights)) total += w | 0;
  if (total < 1 || total > 1000) return null;

  const acc = {};
  for (const k of Object.keys(weights)) acc[k] = 0;

  const seq = [];
  for (let i = 0; i < total; i++) {
    let bestKey = null, bestVal = -Infinity;
    for (const k of Object.keys(weights)) {
      acc[k] += (weights[k] | 0) / total;
      if (acc[k] > bestVal) { bestVal = acc[k]; bestKey = k; }
    }
    if (bestKey === null) return null;
    seq.push(bestKey);
    acc[bestKey] -= 1;
  }
  return seq;
}

const contar = (seq) => seq.reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});

/** Maior número de posições consecutivas com a mesma variante. */
function maiorBloco(seq) {
  let max = 1, cur = 1;
  for (let i = 1; i < seq.length; i++) {
    cur = seq[i] === seq[i - 1] ? cur + 1 : 1;
    if (cur > max) max = cur;
  }
  return max;
}

test('pesos iguais dão contagem exacta', () => {
  const seq = sequence({ quiz6: 34, quiz6b: 33, quiz6c: 33 });
  assert.equal(seq.length, 100);
  assert.deepEqual(contar(seq), { quiz6: 34, quiz6b: 33, quiz6c: 33 });
});

test('a sequência fica intercalada, não em blocos', () => {
  // Este é o ponto todo do algoritmo. Um round-robin ingénuo daria 34 seguidas
  // da mesma variante, e essa variante ficaria com as manhãs todas.
  const seq = sequence({ quiz6: 34, quiz6b: 33, quiz6c: 33 });
  assert.ok(maiorBloco(seq) <= 2, `blocos de ${maiorBloco(seq)} seguidos — devia intercalar`);
});

test('cada terço da sequência já está equilibrado', () => {
  // Garante que não há deriva ao longo do ciclo: quem entra às 9h e quem entra
  // às 18h vê a mesma mistura.
  const seq = sequence({ quiz6: 34, quiz6b: 33, quiz6c: 33 });
  for (let t = 0; t < 3; t++) {
    const fatia = seq.slice(t * 33, (t + 1) * 33);
    for (const n of Object.values(contar(fatia))) {
      assert.ok(n >= 10 && n <= 12, `fatia ${t} desequilibrada: ${JSON.stringify(contar(fatia))}`);
    }
  }
});

test('pesos desiguais são respeitados exactamente', () => {
  assert.deepEqual(contar(sequence({ a: 50, b: 25, c: 25 })), { a: 50, b: 25, c: 25 });
  assert.deepEqual(contar(sequence({ a: 70, b: 30 })), { a: 70, b: 30 });
});

test('duas variantes alternam perfeitamente', () => {
  const seq = sequence({ a: 50, b: 50 });
  assert.equal(maiorBloco(seq), 1, 'com 50/50 devia ser a,b,a,b,...');
});

test('uma variante só devolve sempre a mesma', () => {
  const seq = sequence({ a: 100 });
  assert.equal(new Set(seq).size, 1);
});

test('pesos inválidos devolvem null — o PHP cai no aleatório', () => {
  assert.equal(sequence({}), null);
  assert.equal(sequence({ a: 0, b: 0 }), null);
  assert.equal(sequence({ a: 5000 }), null); // acima do tecto de 1000
});

test('o ciclo repete-se sem se desalinhar', () => {
  // O contador faz `n % length`, por isso 250 visitantes têm de dar 2,5 ciclos
  // com as proporções mantidas.
  const seq = sequence({ quiz6: 34, quiz6b: 33, quiz6c: 33 });
  const escolhidas = Array.from({ length: 250 }, (_, n) => seq[n % seq.length]);
  const c = contar(escolhidas);
  for (const n of Object.values(c)) {
    assert.ok(Math.abs(n - 250 / 3) <= 2, `desvio grande em 250 visitas: ${JSON.stringify(c)}`);
  }
});
