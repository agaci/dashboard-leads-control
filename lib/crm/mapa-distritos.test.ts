import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRITOS_MAPA, MAPA_LARGURA, MAPA_ALTURA } from './mapa-distritos.ts';
import { DISTRITOS } from './zonas.ts';

/**
 * O mapa cruza-se com as zonas dos parceiros pelo `id`. Se as duas listas divergirem —
 * alguém acrescenta um distrito a uma e esquece a outra, ou muda um acento — o mapa
 * pinta-se todo a cinzento e não diz porquê. Estes testes travam isso.
 */

test('todos os distritos do mapa existem na lista de zonas', () => {
  for (const d of DISTRITOS_MAPA) {
    assert.ok((DISTRITOS as readonly string[]).includes(d.id), `"${d.id}" não está em DISTRITOS`);
  }
});

test('o continente está todo desenhado', () => {
  // 18 distritos no continente. Açores e Madeira não vêm na CAOP continental e
  // desenham-se em caixa à parte — por isso são 18 e não 20.
  assert.equal(DISTRITOS_MAPA.length, 18);
  const ilhas = DISTRITOS.filter((d) => !DISTRITOS_MAPA.some((m) => m.id === d));
  assert.deepEqual(ilhas, ['acores', 'madeira']);
});

test('não há distritos repetidos', () => {
  const ids = DISTRITOS_MAPA.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada distrito tem geometria fechada e utilizável', () => {
  for (const d of DISTRITOS_MAPA) {
    assert.match(d.d, /^M[\d.]/, `${d.id}: o path não começa num M`);
    assert.match(d.d, /Z$/, `${d.id}: o path não fecha`);
    // Um distrito com quatro pontos seria um quadrado — sinal de simplificação a mais.
    assert.ok(d.d.split('L').length > 12, `${d.id}: poucos pontos, a forma perdeu-se`);
  }
});

test('nada fica fora da moldura', () => {
  // Um ponto fora do viewBox seria um erro de projecção, e o distrito desaparecia do
  // ecrã sem aviso.
  for (const d of DISTRITOS_MAPA) {
    for (const par of d.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
      const x = Number(par[1]), y = Number(par[2]);
      assert.ok(x >= -1 && x <= MAPA_LARGURA + 1, `${d.id}: x=${x} fora de 0..${MAPA_LARGURA}`);
      assert.ok(y >= -1 && y <= MAPA_ALTURA + 1, `${d.id}: y=${y} fora de 0..${MAPA_ALTURA}`);
    }
  }
});

test('a proporção é a de Portugal, não um quadrado', () => {
  // Portugal continental tem cerca de metade da largura da altura. Se isto mudar muito,
  // a projecção partiu-se — foi o que aconteceu à primeira, ao tratar metros como graus.
  const proporcao = MAPA_LARGURA / MAPA_ALTURA;
  assert.ok(proporcao > 0.4 && proporcao < 0.6, `proporção ${proporcao.toFixed(2)} suspeita`);
});

test('o desenho é leve o suficiente para ir no browser', () => {
  const total = DISTRITOS_MAPA.reduce((s, d) => s + d.d.length, 0);
  assert.ok(total < 120_000, `${total} caracteres de geometria é demasiado`);
});

test('os nomes estão escritos como se lêem', () => {
  const porId = Object.fromEntries(DISTRITOS_MAPA.map((d) => [d.id, d.nome]));
  assert.equal(porId['braganca'], 'Bragança');
  assert.equal(porId['evora'], 'Évora');
  assert.equal(porId['setubal'], 'Setúbal');
  // as preposições ficam em minúsculas, como em português se escreve
  assert.equal(porId['viana do castelo'], 'Viana do Castelo');
});
