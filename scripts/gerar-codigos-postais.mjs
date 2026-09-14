import fs from 'fs';

/**
 * Gera lib/crm/codigosPostais.ts a partir dos dados abertos dos códigos postais.
 *
 *   curl -sL https://raw.githubusercontent.com/centraldedados/codigos_postais/master/data/codigos_postais.csv -o cp.csv
 *   curl -sL .../distritos.csv -o distritos.csv
 *   node scripts/gerar-codigos-postais.mjs cp.csv distritos.csv lib/crm/codigosPostais.ts
 *
 * Origem: Central de Dados (dados abertos), a partir da tabela dos CTT. 326 mil linhas,
 * uma por artéria — o que se guarda é muito menos do que isso.
 *
 * **Duas tabelas, para dois problemas diferentes:**
 *
 *   CP4 -> distrito       para moradas com código postal. É o caso da lista do IMT, onde
 *                         o código postal vem sempre e é exacto.
 *
 *   localidade -> distrito  para moradas escritas por pessoas, que raramente trazem
 *                         código postal. "Av. Central 578, Amora, Portugal" é uma lead
 *                         real: sem esta tabela, `zonaDeMorada` devolvia "amora", que
 *                         não casa com nenhum parceiro.
 *
 * **As localidades ambíguas ficam de fora.** Há nomes que existem em vários distritos —
 * "Vila Nova", "São Pedro". Adivinhar qual é dá uma zona errada com ar de certa, e uma
 * zona errada manda a lead ao parceiro errado. Melhor não saber do que saber mal.
 */

const [fCp, fDistritos, saida] = process.argv.slice(2);
if (!fCp || !fDistritos) {
  console.error('uso: node scripts/gerar-codigos-postais.mjs <cp.csv> <distritos.csv> [saida.ts]');
  process.exit(1);
}

/** Minúsculas sem acentos — a mesma normalização de lib/crm/zonas.ts. */
function normalizar(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

// ── os distritos, pelo código ────────────────────────────────────────────────
//
// Os códigos 01-18 são os distritos do continente e batem com lib/crm/zonas.ts. Os das
// ilhas não: a fonte traz uma entrada por ILHA — "Ilha de São Miguel", "Ilha Terceira" —
// e nós tratamos os Açores e a Madeira como uma zona cada. Um parceiro não declara que
// serve a Ilha do Corvo; declara que serve os Açores.
const ZONA_DA_ILHA = (nome) => (
  /madeira|porto santo/.test(nome) ? 'madeira'
    : /^ilha/.test(nome) ? 'acores'
      : null
);

const distritoPorCodigo = new Map();
for (const l of fs.readFileSync(fDistritos, 'utf8').split(/\r?\n/).slice(1)) {
  const [cod, nome] = l.split(',');
  if (!cod || !nome) continue;
  const n = normalizar(nome);
  distritoPorCodigo.set(cod.trim(), ZONA_DA_ILHA(n) ?? n);
}

// ── varrer os códigos postais ────────────────────────────────────────────────
const cp4 = new Map();                 // '2600' -> Set de distritos
const localidade = new Map();          // 'amora' -> Set de distritos
const concelho = new Map();            // idem, pelo par distrito+concelho

const linhas = fs.readFileSync(fCp, 'utf8').split(/\r?\n/);
const cab = linhas[0].split(',');
const iDistrito = cab.indexOf('cod_distrito');
const iLocalidade = cab.indexOf('nome_localidade');
const iCp4 = cab.indexOf('num_cod_postal');
const iDesig = cab.indexOf('desig_postal');
if (iDistrito < 0 || iLocalidade < 0 || iCp4 < 0) {
  console.error('o CSV não tem as colunas esperadas');
  process.exit(1);
}

const juntar = (mapa, chave, valor) => {
  if (!chave || !valor) return;
  if (!mapa.has(chave)) mapa.set(chave, new Set());
  mapa.get(chave).add(valor);
};

for (let i = 1; i < linhas.length; i++) {
  const c = linhas[i].split(',');
  if (c.length < cab.length) continue;
  const d = distritoPorCodigo.get(String(c[iDistrito]).trim());
  if (!d) continue;

  juntar(cp4, String(c[iCp4]).trim(), d);
  juntar(localidade, normalizar(c[iLocalidade]), d);
  if (iDesig >= 0) juntar(localidade, normalizar(c[iDesig]), d);
}

// ── ficar só com o que é inequívoco ──────────────────────────────────────────
const semDuvida = (mapa) => {
  const out = {};
  let ambiguos = 0;
  for (const [k, v] of mapa) {
    if (!k || k.length < 2) continue;
    if (v.size === 1) out[k] = [...v][0];
    else ambiguos++;
  }
  return { out, ambiguos };
};

const r4 = semDuvida(cp4);
const rLoc = semDuvida(localidade);

// A guarda que importa: se um distrito sair daqui com um nome que lib/crm/zonas.ts nao
// conhece, o cruzamento falha em silencio — a lead fica com uma zona que nenhum parceiro
// declara, e ninguem percebe porque. Foi o que aconteceu com o mapa dos distritos, e a
// licao ficou.
const ZONAS = new Set([
  'aveiro', 'beja', 'braga', 'braganca', 'castelo branco', 'coimbra', 'evora', 'faro',
  'guarda', 'leiria', 'lisboa', 'portalegre', 'porto', 'santarem', 'setubal',
  'viana do castelo', 'vila real', 'viseu', 'acores', 'madeira',
]);
const desconhecidos = new Set(
  [...Object.values(r4.out), ...Object.values(rLoc.out)].filter((d) => !ZONAS.has(d)),
);
if (desconhecidos.size) {
  console.error('\nZONAS QUE lib/crm/zonas.ts NAO CONHECE:', [...desconhecidos].join(', '));
  console.error('corrija o mapeamento antes de gerar — senao o cruzamento falha em silencio');
  process.exit(1);
}

// As localidades com nome de distrito FICAM. Cheguei a tira-las, por o zonaDeMorada ja as
// apanhar — e "Setubal, Portugal" deixou de resolver. Um resolvedor que so funciona se
// outro correr primeiro nao e um resolvedor: sao vinte entradas, e com elas este modulo
// responde sozinho.
for (const d of new Set(distritoPorCodigo.values())) rLoc.out[d] = d;

console.log(`distritos                 ${distritoPorCodigo.size}`);
console.log(`CP4 -> distrito           ${Object.keys(r4.out).length}  (${r4.ambiguos} em mais de um distrito, fora)`);
console.log(`localidade -> distrito    ${Object.keys(rLoc.out).length}  (${rLoc.ambiguos} ambíguas, fora)`);

for (const teste of ['amora', 'cascais', 'odivelas', 'agualva-cacem', 'alverca do ribatejo']) {
  console.log(`   ${teste.padEnd(22)} -> ${rLoc.out[teste] ?? '(nao resolve)'}`);
}
console.log(`   CP 2600                -> ${r4.out['2600'] ?? '(nao resolve)'}`);
console.log(`   CP 8100                -> ${r4.out['8100'] ?? '(nao resolve)'}`);

if (!saida) process.exit(0);

// ── escrever o módulo ────────────────────────────────────────────────────────
// Em texto compacto e não em objecto literal: 4 mil entradas como objecto são 200 KB de
// codigo para o TypeScript percorrer a cada build. Assim é uma linha, e o Map monta-se
// uma vez ao carregar.
//
// As chaves que trouxerem um dos separadores ficam de fora, e diz-se quantas: um nome com
// "|" ou ":" lá dentro partia a tabela ao carregar, e partia-a em silêncio — as entradas
// a seguir passavam a ler-se deslocadas.
let descartadas = 0;
const compacto = (obj) => Object.entries(obj)
  .filter(([k, v]) => {
    const mau = /[|:]/.test(k) || /[|:]/.test(v);
    if (mau) descartadas++;
    return !mau;
  })
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([k, v]) => `${k}:${v}`).join('|');

const ts = `/**
 * Códigos postais e localidades de Portugal, para resolver o distrito.
 *
 * GERADO por scripts/gerar-codigos-postais.mjs. Não editar à mão.
 *
 * Origem: Central de Dados (dados abertos), a partir da tabela dos CTT.
 *
 * Existe para o mesmo problema visto de dois lados. \`zonaDeMorada\` (lib/crm/zonas.ts)
 * só conhece os 20 distritos, e as moradas reais não os trazem: "Av. Central 578, Amora,
 * Portugal" é uma lead verdadeira, e dava a zona "amora", que não casa com parceiro
 * nenhum. Do outro lado, a lista do IMT traz sempre o código postal, que é exacto.
 *
 * **Só entram nomes que pertencem a um único distrito.** Os que existem em vários ficaram
 * de fora: adivinhar dá uma zona errada com ar de certa, e uma zona errada manda a lead
 * ao parceiro errado. Melhor não saber do que saber mal.
 *
 * As tabelas são texto e não objectos literais: ${Object.keys(r4.out).length + Object.keys(rLoc.out).length} entradas como objecto seriam
 * centenas de KB de código para o compilador percorrer a cada build. O Map monta-se uma
 * vez, ao carregar.
 */

const CP4 = ${JSON.stringify(compacto(r4.out))};

const LOCALIDADES = ${JSON.stringify(compacto(rLoc.out))};

function montar(texto: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const par of texto.split('|')) {
    const i = par.indexOf(':');
    if (i > 0) m.set(par.slice(0, i), par.slice(i + 1));
  }
  return m;
}

const porCp4 = montar(CP4);
const porLocalidade = montar(LOCALIDADES);

/** Minúsculas sem acentos — a mesma normalização de lib/crm/zonas.ts. */
function normalizar(t: string): string {
  return String(t ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
    .replace(/\\s+/g, ' ').trim();
}

/** O distrito de um código postal ("2600-535" ou "2600"), ou null. */
export function distritoDoCodigoPostal(cp: string): string | null {
  const m = /(\\d{4})/.exec(String(cp ?? ''));
  return m ? porCp4.get(m[1]) ?? null : null;
}

/**
 * O distrito de um nome de terra, ou null.
 *
 * Devolve null tanto para o desconhecido como para o ambíguo, e é de propósito: quem
 * chama isto deve continuar a procurar noutro sítio, não ficar com um palpite.
 */
export function distritoDaLocalidade(nome: string): string | null {
  return porLocalidade.get(normalizar(nome)) ?? null;
}

/**
 * O distrito de uma morada, pelo que ela tiver.
 *
 * Tenta o código postal primeiro, que é exacto; se não houver ou se esse código
 * atravessar dois distritos, tenta os nomes de terra que a morada traga. É a ordem certa:
 * dos 7858 endereços da lista do IMT, o código postal resolve 96,7% sozinho, e os 258 que
 * sobram caem em 18 códigos que atravessam fronteiras — para esses vale o nome.
 *
 * Devolve null quando não sabe. Quem chama deve continuar a procurar, não ficar com um
 * palpite: uma zona errada manda a lead ao parceiro errado, e parece certa.
 */
export function distritoDaMorada(morada: string): string | null {
  const texto = String(morada ?? '');

  const porCodigo = distritoDoCodigoPostal(texto);
  if (porCodigo) return porCodigo;

  // Da direita para a esquerda: numa morada portuguesa a terra vem no fim, e a rua no
  // princípio. "Rua de Lisboa, Braga" é em Braga.
  const pedacos = texto.split(/[,\\n]/).map((p) => normalizar(p)).filter(Boolean).reverse();
  for (const p of pedacos) {
    const limpo = p.replace(/^\\d{4}-?\\d{0,3}\\s*/, '').replace(/\\bportugal\\b/, '').trim();
    if (!limpo || limpo.length < 3) continue;
    const d = porLocalidade.get(limpo);
    if (d) return d;
  }
  return null;
}

/** Quantas entradas tem cada tabela. Serve aos testes e ao diagnóstico. */
export const TAMANHOS = {
  codigosPostais: porCp4.size,
  localidades: porLocalidade.size,
};
`;

fs.writeFileSync(saida, ts, 'utf8');
console.log(`\nescrito ${saida} (${(ts.length / 1024).toFixed(0)} KB)`);
