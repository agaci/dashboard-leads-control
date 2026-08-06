// Testes da captura de gclid no site (site_YB/assets/js/yb-attr.js).
//
//   node scripts/test-yb-attr.mjs
//
// O ficheiro corre no browser, por isso é carregado aqui num sandbox com o mínimo
// de DOM que ele toca. Testa-se a regra de precedência, que é onde está a lógica:
// quando é que um clique novo substitui o guardado e quando é que não mexe.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../site_YB/assets/js/yb-attr.js'), 'utf8');

/** Executa o script com um cookie inicial e um querystring, devolve o cookie final. */
function run({ search = '', cookie = '', pathname = '/' } = {}) {
  const jar = new Map();
  if (cookie) {
    for (const part of cookie.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }

  const doc = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(v) {
      const [pair] = v.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    },
  };

  const win = {};
  const sandbox = {
    window: win,
    document: doc,
    location: { search, pathname, protocol: 'https:', href: 'https://yourbox.com.pt' + pathname + search },
    navigator: { sendBeacon: () => true },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    Blob: class { constructor() {} },
    fetch: () => Promise.resolve(),
    Date,
    JSON,
    Math,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    console,
  };
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(SRC, sandbox);

  const raw = jar.get('yb_attr');
  return {
    cookie: raw ? JSON.parse(decodeURIComponent(raw)) : null,
    api: win.YB_ATTR,
  };
}

/** Serializa uma atribuição no formato em que ela vive no cookie. */
function asCookie(o) {
  return 'yb_attr=' + encodeURIComponent(JSON.stringify(o));
}

test('captura o gclid da query string', () => {
  const { cookie } = run({ search: '?gclid=TESTE123&utm_source=google&utm_medium=cpc' });
  assert.equal(cookie.gclid, 'TESTE123');
  assert.equal(cookie.utm.source, 'google');
  assert.equal(cookie.utm.medium, 'cpc');
  assert.ok(cookie.capturedAt, 'tem de registar o momento da captura');
});

test('captura wbraid e gbraid, nao so gclid', () => {
  assert.equal(run({ search: '?wbraid=W123' }).cookie.wbraid, 'W123');
  assert.equal(run({ search: '?gbraid=G123' }).cookie.gbraid, 'G123');
});

test('trafego directo nao cria cookie nenhum', () => {
  assert.equal(run({ search: '' }).cookie, null);
  assert.equal(run({ search: '?goto=form' }).cookie, null);
});

test('o mesmo clique repetido nao mexe no que esta guardado', () => {
  const original = { gclid: 'A1', wbraid: null, gbraid: null, capturedAt: '2026-08-01T10:00:00.000Z', landingPage: '/', utm: null, src: 'php' };
  const { cookie } = run({ search: '?gclid=A1', cookie: asCookie(original) });
  assert.equal(cookie.capturedAt, original.capturedAt, 'a data original tem de aguentar-se');
  assert.equal(cookie.src, 'php');
});

test('um clique NOVO substitui e preserva o primeiro toque', () => {
  const original = { gclid: 'A1', wbraid: null, gbraid: null, capturedAt: '2026-08-01T10:00:00.000Z', landingPage: '/', utm: null, src: 'php' };
  const { cookie } = run({ search: '?gclid=B2', cookie: asCookie(original) });
  assert.equal(cookie.gclid, 'B2', 'o Google atribui ao ultimo clique');
  assert.equal(cookie.first.gclid, 'A1', 'o primeiro toque nao se perde');
});

test('utm sozinho nao apaga um gclid ja guardado', () => {
  const original = { gclid: 'A1', wbraid: null, gbraid: null, capturedAt: '2026-08-01T10:00:00.000Z', landingPage: '/', utm: null, src: 'php' };
  const { cookie } = run({ search: '?utm_source=newsletter', cookie: asCookie(original) });
  assert.equal(cookie.gclid, 'A1', 'trafego de email a seguir ao anuncio nao rouba a conversao');
});

test('nao sobrepoe o que o PHP escreveu no mesmo pedido', () => {
  // Cenario real: o PHP ja tratou ?gclid=X e o JS corre logo a seguir na mesma pagina.
  const doPhp = { gclid: 'X', wbraid: null, gbraid: null, capturedAt: '2026-08-06T09:00:00.000Z', landingPage: '/?gclid=X', utm: null, src: 'php' };
  const { cookie } = run({ search: '?gclid=X', cookie: asCookie(doPhp) });
  assert.equal(cookie.src, 'php', 'o servidor manda; o JS e so plano B');
});

test('a API publica fica exposta', () => {
  const { api } = run({ search: '?gclid=Z9' });
  assert.equal(typeof api.get, 'function');
  assert.equal(typeof api.sendLead, 'function');
  assert.equal(api.hasClickId(), true);
  assert.equal(api.get().gclid, 'Z9');
});

test('hasClickId e falso quando so ha utm', () => {
  const { api } = run({ search: '?utm_source=facebook' });
  assert.equal(api.hasClickId(), false);
});

test('um cookie corrompido nao rebenta nem bloqueia nova captura', () => {
  const { cookie } = run({ search: '?gclid=OK1', cookie: 'yb_attr=lixo-nao-json' });
  assert.equal(cookie.gclid, 'OK1');
});
