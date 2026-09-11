/**
 * Gera lib/crm/mapa-distritos.ts a partir da CAOP.
 *
 *   node --max-old-space-size=3072 scripts/gerar-mapa-distritos.mjs <geojson> <destino.ts>
 *
 * A origem é a Carta Administrativa Oficial de Portugal, da Direcção-Geral do Território,
 * em EPSG:3763 (ETRS89 / Portugal TM06). Já vem projectada em metros — e isso é melhor do
 * que graus: é a projecção oficial do país, com as formas certas, e dispensa converter
 * seja o que for. Basta escalar e virar o Y ao contrário, que no SVG cresce para baixo.
 *
 * O ficheiro de origem tem 400 mil pontos. Num mapa de 250 unidades de largura, milhares
 * deles caem no mesmo pixel — e 12 MB no pacote do browser custariam mais a carregar do
 * que o mapa inteiro vale. Por isso se simplifica com Douglas-Peucker antes de gravar.
 */
import fs from 'node:fs';

const ORIGEM = process.argv[2];
const DESTINO = process.argv[3];

/** Em metros. Um mapa desta largura não distingue nada abaixo disto. */
const TOLERANCIA_M = 300;
/** Ilhotas mais pequenas do que 4 km² não chegam a um pixel. */
const AREA_MINIMA_M2 = 4e6;
/** Altura do desenho, em unidades de SVG. A largura sai da proporção real do país. */
const ALTURA = 520;

const SLUG = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "CASTELO BRANCO" -> "Castelo Branco", "VIANA DO CASTELO" -> "Viana do Castelo". */
const CAPITULAR = (s) => s.toLowerCase().replace(/\p{L}+/gu, (p) =>
  ['de', 'do', 'da', 'dos', 'das', 'e'].includes(p) ? p : p[0].toUpperCase() + p.slice(1));

let bruto = fs.readFileSync(ORIGEM, 'utf8');
if (bruto.charCodeAt(0) === 0xFEFF) bruto = bruto.slice(1);   // a CAOP vem com BOM
const g = JSON.parse(bruto);

// ── Douglas-Peucker ──────────────────────────────────────────────────────────

function distanciaAoSegmento2(p, a, b) {
  let x = a[0], y = a[1];
  const dx = b[0] - x, dy = b[1] - y;
  if (dx || dy) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}

function simplificar(pontos, tol2) {
  if (pontos.length <= 4) return pontos;
  const guardar = new Uint8Array(pontos.length);
  guardar[0] = guardar[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop();
    let pior = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distanciaAoSegmento2(pontos[k], pontos[i], pontos[j]);
      if (d > pior) { pior = d; idx = k; }
    }
    if (pior > tol2 && idx > 0) { guardar[idx] = 1; pilha.push([i, idx], [idx, j]); }
  }
  return pontos.filter((_, i) => guardar[i]);
}

const area = (anel) => {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    a += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  }
  return Math.abs(a / 2);
};

// ── extensão, para escalar ───────────────────────────────────────────────────

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const f of g.features) {
  const anda = (c) => {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    } else c.forEach(anda);
  };
  anda(f.geometry.coordinates);
}

const ESCALA = ALTURA / (maxY - minY);
const LARGURA = Math.ceil((maxX - minX) * ESCALA);
const proj = ([x, y]) => [
  +((x - minX) * ESCALA).toFixed(1),
  +((maxY - y) * ESCALA).toFixed(1),   // no SVG o Y cresce para baixo
];

// ── montar ───────────────────────────────────────────────────────────────────

const distritos = [];
let antes = 0, depois = 0, ilhotas = 0;

for (const f of g.features) {
  const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const partes = [];

  for (const pol of poligonos) {
    const exterior = pol[0];
    antes += exterior.length;
    if (area(exterior) < AREA_MINIMA_M2) { ilhotas++; continue; }

    const s = simplificar(exterior, TOLERANCIA_M ** 2);
    if (s.length < 4) continue;
    depois += s.length;

    const pts = s.map(proj);
    partes.push('M' + pts.map((p, i) => (i ? 'L' : '') + p[0] + ' ' + p[1]).join('') + 'Z');
  }

  if (!partes.length) { console.warn('sem geometria utilizavel:', f.properties.Distrito); continue; }

  distritos.push({
    id: SLUG(f.properties.Distrito),
    nome: CAPITULAR(f.properties.Distrito),
    d: partes.join(''),
    // a CAOP traz isto como texto nalguns registos
    concelhos: Number(f.properties.N_Concelho) || null,
  });
}

distritos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

const ts = `/**
 * Fronteiras dos distritos de Portugal continental.
 *
 * Origem: Carta Administrativa Oficial de Portugal (CAOP), da Direcção-Geral do
 * Território. É a carta oficial, não um desenho aproximado — e vem em EPSG:3763
 * (ETRS89 / PT-TM06), a projecção do país, o que dá as formas certas sem converter nada.
 *
 * Gerado por scripts/gerar-mapa-distritos.mjs. Dos ${antes.toLocaleString('pt-PT')} pontos
 * do original ficaram ${depois.toLocaleString('pt-PT')}: a esta largura os outros caíam
 * todos no mesmo pixel, e 12 MB no pacote do browser custariam mais a carregar do que o
 * mapa inteiro vale. Foram também deixadas de fora ${ilhotas} ilhotas com menos de 4 km².
 *
 * **Os \`id\` são os mesmos slugs de lib/crm/zonas.ts.** É por eles que o mapa se cruza
 * com as zonas declaradas pelos parceiros; se divergirem, o mapa pinta-se todo a cinzento
 * sem dizer porquê. Há um teste a travar isso.
 *
 * Açores e Madeira não vêm na CAOP continental. À escala de um mapa de Portugal desenham-se
 * em caixa à parte, que é o que qualquer mapa do país faz.
 *
 * Para regenerar (o GeoJSON da CAOP não está no repositório, por ter 12 MB):
 *   node --max-old-space-size=3072 scripts/gerar-mapa-distritos.mjs <caop.geojson> lib/crm/mapa-distritos.ts
 */

export interface DistritoMapa {
  /** Igual ao slug de lib/crm/zonas.ts. */
  id: string;
  nome: string;
  /** O atributo \`d\` de um <path> de SVG, já projectado e escalado. */
  d: string;
  concelhos: number | null;
}

export const MAPA_LARGURA = ${LARGURA};
export const MAPA_ALTURA = ${ALTURA};

export const DISTRITOS_MAPA: DistritoMapa[] = ${JSON.stringify(distritos, null, 2)};
`;

fs.writeFileSync(DESTINO, ts, 'utf8');

console.log(`distritos : ${distritos.length}`);
console.log(`pontos    : ${antes.toLocaleString('pt-PT')} -> ${depois.toLocaleString('pt-PT')}  (${(depois / antes * 100).toFixed(1)}%)`);
console.log(`ilhotas   : ${ilhotas} deixadas de fora`);
console.log(`viewBox   : 0 0 ${LARGURA} ${ALTURA}   (proporcao ${(LARGURA / ALTURA).toFixed(2)})`);
console.log(`ficheiro  : ${(fs.statSync(DESTINO).size / 1024).toFixed(0)} KB`);
