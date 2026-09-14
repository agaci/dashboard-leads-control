import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distritoDaLocalidade, distritoDaMorada, distritoDoCodigoPostal, TAMANHOS,
} from './codigosPostais.ts';
import { DISTRITOS } from './zonas.ts';

/**
 * A regressão que justifica este ficheiro: `zonaDeMorada` só conhece os 20 distritos, e
 * as moradas reais não os trazem. Das onze consultas em produção, nove ficaram com uma
 * zona que nenhum parceiro pode declarar — "amora", "cascais", "odivelas", e até "29",
 * de uma morada mal escrita. A lead entrava, era triada, e não casava com ninguém.
 */

// ── código postal ────────────────────────────────────────────────────────────

test('o código postal resolve o distrito', () => {
  assert.equal(distritoDoCodigoPostal('2600-535'), 'lisboa');
  assert.equal(distritoDoCodigoPostal('8100-707'), 'faro');
  assert.equal(distritoDoCodigoPostal('4050-012'), 'porto');
});

test('os quatro primeiros dígitos chegam', () => {
  assert.equal(distritoDoCodigoPostal('2600'), 'lisboa');
});

test('um código postal que não existe não inventa', () => {
  assert.equal(distritoDoCodigoPostal('0000-000'), null);
  assert.equal(distritoDoCodigoPostal(''), null);
  assert.equal(distritoDoCodigoPostal('sem código'), null);
});

// ── nomes de terra ───────────────────────────────────────────────────────────

test('as terras das leads reais resolvem', () => {
  // Estas três estavam gravadas em produção com a zona errada.
  assert.equal(distritoDaLocalidade('Amora'), 'setubal');
  assert.equal(distritoDaLocalidade('Cascais'), 'lisboa');
  assert.equal(distritoDaLocalidade('Agualva-Cacém'), 'lisboa');
});

test('acentos e maiúsculas não interessam', () => {
  assert.equal(distritoDaLocalidade('AGUALVA-CACEM'), 'lisboa');
  assert.equal(distritoDaLocalidade('  amora  '), 'setubal');
});

test('um nome que existe em vários distritos devolve null', () => {
  // "Odivelas" é em Lisboa e é também em Ferreira do Alentejo. Adivinhar dava uma zona
  // errada com ar de certa — e uma zona errada manda a lead ao parceiro errado.
  assert.equal(distritoDaLocalidade('Odivelas'), null);
});

// ── morada inteira ───────────────────────────────────────────────────────────

test('o código postal ganha ao nome', () => {
  // Mais exacto, e está lá de propósito.
  assert.equal(distritoDaMorada('Av. Miguel Torga 6A, 2675-678 Odivelas, Portugal'), 'lisboa');
});

test('sem código postal, vale a terra', () => {
  assert.equal(distritoDaMorada('Av. Central 578, Amora, Portugal'), 'setubal');
  assert.equal(distritoDaMorada('Cascais, Portugal'), 'lisboa');
});

test('lê da direita para a esquerda, como se escreve uma morada', () => {
  // A terra vem no fim e a rua no princípio. Sem esta ordem, "Rua de Lisboa, Braga"
  // dava Lisboa — o nome da rua ganhava ao sítio onde a casa está.
  assert.equal(distritoDaMorada('Rua de Lisboa, Braga'), 'braga');
  assert.equal(distritoDaMorada('Rua do Porto, Faro'), 'faro');
});

test('uma morada sem sinal nenhum devolve null', () => {
  // "Rua do Monte Norte, 29" é uma lead real: dava a zona "29".
  assert.equal(distritoDaMorada('Rua do Monte Norte, 29'), null);
  assert.equal(distritoDaMorada(''), null);
  assert.equal(distritoDaMorada('nao e uma morada'), null);
});

test('"Portugal" no fim não estraga a leitura', () => {
  assert.equal(distritoDaMorada('Setúbal, Portugal'), 'setubal');
});

// ── as tabelas e as zonas não podem divergir ─────────────────────────────────

test('todos os distritos que saem daqui são zonas conhecidas', () => {
  // Se um nome divergir, a lead fica com uma zona que nenhum parceiro declara e ninguém
  // percebe porquê. Foi o que aconteceu com o mapa dos distritos.
  const zonas = new Set<string>(DISTRITOS);
  const amostra = [
    '2600-535', '8100-707', '4050-012', '9500-000', '9000-000', '1000-001',
  ].map(distritoDoCodigoPostal).filter(Boolean) as string[];
  for (const d of amostra) assert.ok(zonas.has(d), `"${d}" não está em DISTRITOS`);
});

test('as ilhas vêm como uma zona cada, não como nove', () => {
  // Um parceiro não declara que serve a Ilha do Corvo; declara que serve os Açores.
  assert.equal(distritoDoCodigoPostal('9500-000'), 'acores');
  assert.equal(distritoDoCodigoPostal('9000-000'), 'madeira');
});

test('as tabelas não vieram vazias', () => {
  // Um gerador que falhe a meio deixa um módulo que compila e não sabe nada.
  assert.ok(TAMANHOS.codigosPostais > 700, `só ${TAMANHOS.codigosPostais} códigos postais`);
  assert.ok(TAMANHOS.localidades > 15000, `só ${TAMANHOS.localidades} localidades`);
});

// ── os prefixos que atravessam distritos ─────────────────────────────────────

test('o código completo desempata onde os quatro dígitos não chegam', () => {
  // 2495 é Leiria e é Santarém, conforme a rua. Por treze prefixos como este caíam 86
  // das 7858 empresas do IMT, sem distrito nenhum.
  assert.equal(distritoDoCodigoPostal('2495'), null);
  assert.ok(distritoDoCodigoPostal('2495-023'), '2495-023 devia resolver pelo código completo');
});

test('os treze prefixos ambíguos resolvem com o código completo', () => {
  // Codigos verdadeiros, tirados da lista do IMT: inventar um "-000" so provava que o
  // teste nao sabia do que falava.
  for (const cp of ['2100-053', '3020-084', '4620-010', '2890-042', '6250-024']) {
    assert.ok(distritoDoCodigoPostal(cp), `${cp} não resolve`);
  }
});

test('a tabela dos completos só tem o que faz falta', () => {
  // Guardar os 320 mil códigos do país seriam dez megabytes para resolver o que os
  // quatro dígitos já resolvem em 96,7% dos casos.
  assert.ok(TAMANHOS.codigosCompletos > 4000, `só ${TAMANHOS.codigosCompletos}`);
  assert.ok(TAMANHOS.codigosCompletos < 10000, `${TAMANHOS.codigosCompletos} é de mais`);
});
