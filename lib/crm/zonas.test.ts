import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zonaDeMorada, zonasEfectivas, limparZona, zonaConhecida,
  DISTRITOS, NOME_ZONA, nomeZona, nomesZonas, ZONA_NACIONAL, zonasDeCapacidade,
} from './zonas.ts';

/**
 * A regressão que justifica este ficheiro: a zona era o PRIMEIRO segmento da morada, e o
 * primeiro segmento é a rua. Ficava gravado "rua das flores 12" como zona da lead, e
 * nenhum parceiro com zona declarada podia casar com isso. Passou despercebido porque o
 * único parceiro existente cobria o país inteiro.
 */

test('a zona é o distrito, não a rua', () => {
  assert.equal(zonaDeMorada('Rua das Flores 12, Lisboa, Portugal'), 'lisboa');
  assert.equal(zonaDeMorada('Avenida da Liberdade 200, 1250-147 Lisboa'), 'lisboa');
  assert.equal(zonaDeMorada('Braga'), 'braga');
});

test('distritos compostos não são cortados por um mais curto', () => {
  // "viana" sozinho não é distrito, mas se a procura fosse por prefixo apanhava aqui.
  assert.equal(zonaDeMorada('Rua do Porto 5, Viana do Castelo, Portugal'), 'viana do castelo');
  assert.equal(zonaDeMorada('Quinta Nova, Castelo Branco'), 'castelo branco');
});

test('acentos não separam zonas', () => {
  assert.equal(zonaDeMorada('Praça 1, Évora, Portugal'), 'evora');
  assert.equal(zonaDeMorada('Rua A, Setúbal'), 'setubal');
  assert.equal(zonaDeMorada('Largo B, Bragança'), 'braganca');
});

test('o distrito aparece em qualquer posição, não só na última', () => {
  // As moradas do Google alternam entre "..., Distrito, Portugal" e "..., Distrito".
  assert.equal(zonaDeMorada('5070-272 Favaios, Vila Real'), 'vila real');
  assert.equal(zonaDeMorada('Porto, Rua de Cedofeita 100'), 'porto');
});

test('sem distrito reconhecível fica a localidade, nunca a rua', () => {
  // Ramalhal é do distrito de Lisboa, mas isso não se sabe sem tabela de códigos
  // postais. A localidade é uma zona utilizável e corrigível; a rua não é nada.
  assert.equal(zonaDeMorada('N8 27, 2565-647 Ramalhal, Portugal'), 'ramalhal');
  assert.equal(zonaDeMorada('Av. Central 578, Amora, Portugal'), 'amora');
});

test('morada vazia não inventa zona', () => {
  // undefined faz a distribuição cair nos parceiros nacionais, que é o lado seguro:
  // uma zona inventada excluiria toda a gente sem deixar rasto.
  assert.equal(zonaDeMorada(''), undefined);
  assert.equal(zonaDeMorada(undefined), undefined);
  assert.equal(zonaDeMorada('   '), undefined);
  assert.equal(zonaDeMorada('Portugal'), undefined);
});

test('a capacidade sem zonas herda as do parceiro', () => {
  assert.deepEqual(zonasEfectivas([], ['porto', 'braga']), ['porto', 'braga']);
  assert.deepEqual(zonasEfectivas(undefined, ['porto']), ['porto']);
});

test('a capacidade com zonas próprias ganha ao parceiro', () => {
  // O caso que justifica a herança ser só um default: mudanças no país todo, ADR só no
  // Porto. Se a capacidade não pudesse restringir, a herança seria uma armadilha.
  assert.deepEqual(zonasEfectivas(['porto'], ['lisboa', 'porto', 'braga']), ['porto']);
});

test('sem zonas em lado nenhum é nacional', () => {
  assert.deepEqual(zonasEfectivas([], []), ['nacional']);
  assert.deepEqual(zonasEfectivas(undefined, undefined), ['nacional']);
});

test('as zonas herdadas são normalizadas na mesma', () => {
  // O parceiro pode ter zonas escritas antes de existir validação.
  assert.deepEqual(zonasEfectivas(undefined, ['Évora', ' SETÚBAL ']), ['evora', 'setubal']);
});

test('limparZona iguala o que a lead e o parceiro escrevem', () => {
  assert.equal(limparZona('Vila  Real'), zonaDeMorada('Rua X, Vila Real'));
  assert.equal(limparZona(' Faro '), 'faro');
});

test('zonaConhecida distingue distrito de escrita livre', () => {
  assert.equal(zonaConhecida('Lisboa'), true);
  assert.equal(zonaConhecida('nacional'), true);
  assert.equal(zonaConhecida('amora'), false);
});

// ── nomes para mostrar ───────────────────────────────────────────────────────

test('todo o distrito tem nome escrito como se le', () => {
  // Um distrito sem entrada aparecia como slug — "braganca" — no meio dos outros.
  for (const d of DISTRITOS) {
    assert.ok(NOME_ZONA[d], `falta o nome de "${d}"`);
  }
});

test('os acentos estao la', () => {
  assert.equal(nomeZona('braganca'), 'Bragança');
  assert.equal(nomeZona('evora'), 'Évora');
  assert.equal(nomeZona('santarem'), 'Santarém');
  assert.equal(nomeZona('setubal'), 'Setúbal');
  assert.equal(nomeZona('acores'), 'Açores');
});

test('as preposicoes ficam em minusculas', () => {
  // `capitalize` dava "Viana Do Castelo", que ninguem escreve.
  assert.equal(nomeZona('viana do castelo'), 'Viana do Castelo');
  assert.equal(nomeZona('castelo branco'), 'Castelo Branco');
});

test('nacional le-se em portugues corrente', () => {
  assert.equal(nomeZona(ZONA_NACIONAL), 'todo o país');
});

test('uma zona escrita a mao devolve-se como esta', () => {
  // Vale mais mostrar "amora" do que inventar um nome.
  assert.equal(nomeZona('amora'), 'amora');
  assert.equal(nomesZonas(['porto', 'amora']), 'Porto, amora');
});

test('o nome nunca entra numa comparacao de zonas', () => {
  // Se alguem usasse o nome para cruzar, "Évora" nunca casava com "evora". Esta e a
  // razao de a tabela existir a parte e de limparZona continuar a mandar.
  assert.equal(limparZona(nomeZona('evora')), 'evora');
  assert.equal(limparZona(nomeZona('viana do castelo')), 'viana do castelo');
});

// ── o que uma capacidade grava ───────────────────────────────────────────────

test('vazio quer dizer "as da ficha", e continua vazio', () => {
  // A regressao que isto trava: o PUT convertia [] em ['nacional'], e a capacidade
  // ficava presa a "todo o pais" para sempre. A partir dai as zonas da ficha do
  // parceiro nao tinham efeito nenhum, e quem as editasse via-as gravadas e via a
  // lista continuar a dizer outra coisa, sem explicacao.
  assert.deepEqual(zonasDeCapacidade([]), []);
  assert.deepEqual(zonasDeCapacidade(undefined), []);
  assert.deepEqual(zonasDeCapacidade(['', '  ']), []);
});

test('nacional so aparece se for mesmo pedido', () => {
  assert.deepEqual(zonasDeCapacidade([ZONA_NACIONAL]), [ZONA_NACIONAL]);
});

test('normaliza como o lado da lead', () => {
  // Se os dois lados nao normalizarem igual, "Evora" nunca casa com "evora".
  assert.deepEqual(zonasDeCapacidade(['Évora', ' PORTO ']), ['evora', 'porto']);
});

test('vazio herda mesmo, ponta a ponta', () => {
  // O que a interface promete: gravar sem zonas na capacidade faz valer a ficha.
  const gravado = zonasDeCapacidade([]);
  assert.deepEqual(zonasEfectivas(gravado, ['porto', 'lisboa']), ['porto', 'lisboa']);
  // E com ['nacional'] a ficha deixa de contar — que e a outra afirmacao, a serio.
  assert.deepEqual(zonasEfectivas(zonasDeCapacidade([ZONA_NACIONAL]), ['porto']), [ZONA_NACIONAL]);
});
