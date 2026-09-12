import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  camposUsados, proximaVersao, renderizar, validarTexto, CAMPOS_CARTA,
} from './textosCarta.ts';

const VALORES = { categoria: 'mudanças', zona: 'Setúbal', pedidos: 4, pessoa: 'Ana', quemIndicou: 'o Sr. Costa' };

// ── substituicao ─────────────────────────────────────────────────────────────

test('as variaveis sao substituidas', () => {
  assert.equal(
    renderizar('Pedidos de {categoria} na zona de {zona}.', VALORES),
    'Pedidos de mudanças na zona de Setúbal.',
  );
});

test('o negrito sai em <strong>', () => {
  assert.equal(renderizar('Pedidos de **{categoria}**.', VALORES), 'Pedidos de <strong>mudanças</strong>.');
});

test('um bloco opcional desaparece quando falta o valor', () => {
  // A unica optativa real: "cerca de 4 por mes" nao se escreve quando nao ha numero.
  const t = 'Pedidos de {categoria}[ — cerca de {pedidos} por mês]. Fim.';
  assert.equal(renderizar(t, VALORES), 'Pedidos de mudanças — cerca de 4 por mês. Fim.');
  assert.equal(renderizar(t, { ...VALORES, pedidos: null }), 'Pedidos de mudanças. Fim.');
});

test('zero conta como vazio num bloco opcional', () => {
  // "cerca de 0 por mes" e pior do que nao dizer nada.
  const t = 'Trabalho[ — cerca de {pedidos} por mês].';
  assert.equal(renderizar(t, { pedidos: 0 }), 'Trabalho.');
});

test('o texto do molde e escapado antes de virar marcacao', () => {
  // Um <b> escrito no editor e texto, nao marcacao: senao o editor passava a ser HTML.
  assert.equal(renderizar('a <b>b</b> c', {}), 'a &lt;b&gt;b&lt;/b&gt; c');
});

test('um valor com HTML nao parte a carta', () => {
  // "Silva & Filhos <Lda>" e um nome de empresa possivel.
  assert.equal(
    renderizar('Somos {categoria}.', { categoria: 'Silva & Filhos <Lda>' }),
    'Somos Silva &amp; Filhos &lt;Lda&gt;.',
  );
});

test('um valor com ** nao fica a negrito', () => {
  // A marcacao e de quem escreve a carta, nao de quem preenche o formulario. Se os
  // valores entrassem antes da conversao, o formulario decidia o negrito.
  assert.equal(renderizar('x {categoria} y', { categoria: '**mudanças**' }), 'x **mudanças** y');
});

test('uma variavel desconhecida desaparece em vez de ir escrita', () => {
  assert.equal(renderizar('a {inventado} b', {}), 'a b');
});

test('os espacos a mais do bloco caido sao limpos', () => {
  assert.equal(renderizar('a[ {pedidos} ]b c', { pedidos: null }), 'ab c');
});

// ── campos que o texto exige ─────────────────────────────────────────────────

test('o texto declara os campos que precisa', () => {
  const r = camposUsados('Pedidos de {categoria} em {zona}[ — {pedidos} por mês].');
  assert.deepEqual(r.obrigatorios.sort(), ['categoria', 'zona']);
  assert.deepEqual(r.opcionais, ['pedidos']);
});

test('obrigatorio numa frase manda sobre opcional noutra', () => {
  // Se a segunda frase nao pode passar sem a zona, a zona e pedida.
  const r = camposUsados('[em {zona}]', 'a zona de {zona}');
  assert.deepEqual(r.obrigatorios, ['zona']);
  assert.deepEqual(r.opcionais, []);
});

test('sem variaveis, nao ha campos a pedir', () => {
  assert.deepEqual(camposUsados('Texto simples.'), { obrigatorios: [], opcionais: [] });
});

test('variaveis desconhecidas nao entram na lista de campos', () => {
  assert.deepEqual(camposUsados('{inventado}').obrigatorios, []);
});

// ── validacao na gravacao ────────────────────────────────────────────────────

test('recusa uma variavel que nao existe', () => {
  const r = validarTexto({ assunto: 'a', abertura: 'Olá {patrao}', oQueE: [] });
  assert.equal(r.ok, false);
  assert.match(r.erro!, /\{patrao\}/);
});

test('recusa um bloco por fechar', () => {
  // Um "[" por fechar ia escrito para o email.
  assert.equal(validarTexto({ assunto: 'a', abertura: 'x [ {zona}', oQueE: [] }).ok, false);
});

test('recusa negrito por fechar', () => {
  assert.equal(validarTexto({ assunto: 'a', abertura: 'x **y', oQueE: [] }).ok, false);
});

test('recusa blocos dentro de blocos', () => {
  assert.equal(validarTexto({ assunto: 'a', abertura: '[a [b] c]', oQueE: [] }).ok, false);
});

test('recusa assunto vazio ou com negrito', () => {
  assert.equal(validarTexto({ assunto: '', abertura: 'x', oQueE: [] }).ok, false);
  // O assunto vai no cabecalho do email, onde nao ha marcacao nenhuma.
  assert.equal(validarTexto({ assunto: '**x**', abertura: 'y', oQueE: [] }).ok, false);
});

test('valida tambem os paragrafos do meio', () => {
  const r = validarTexto({ assunto: 'a', abertura: 'b', oQueE: ['ok', 'mau {patrao}'] });
  assert.equal(r.ok, false);
});

test('aceita um texto bem escrito', () => {
  const r = validarTexto({
    assunto: 'Temos pedidos que não conseguimos servir',
    abertura: 'Recebemos pedidos de **{categoria}** em **{zona}**[ — cerca de {pedidos} por mês].',
    oQueE: ['Somos a YourBox.'],
  });
  assert.equal(r.ok, true, r.erro);
});

test('todas as variaveis anunciadas passam na validacao', () => {
  // Se a lista e o validador divergirem, o editor oferece uma variavel que nao grava.
  for (const c of CAMPOS_CARTA) {
    assert.equal(validarTexto({ assunto: 'a', abertura: `x {${c}}`, oQueE: [] }).ok, true, c);
  }
});

// ── versoes ──────────────────────────────────────────────────────────────────

test('a versao sobe, nunca se reescreve', () => {
  assert.equal(proximaVersao('contexto-v1', 'contexto'), 'contexto-v2');
  assert.equal(proximaVersao('contexto-v9', 'contexto'), 'contexto-v10');
});

test('um rotulo estranho nao faz perder a conta', () => {
  assert.equal(proximaVersao('', 'generica'), 'generica-v2');
  assert.equal(proximaVersao('seja-o-que-for', 'generica'), 'generica-v2');
});
