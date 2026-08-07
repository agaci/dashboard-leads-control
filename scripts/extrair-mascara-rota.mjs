// Extrai a silhueta da rota verde da imagem do hero, para servir de máscara CSS.
//
//   node scripts/extrair-mascara-rota.mjs
//
// PORQUÊ
// A imagem é raster: não se pode animar um traçado que são pixels. Mas pode-se
// isolar os pixels da rota num PNG transparente e usá-lo como `mask-image` de uma
// camada com um gradiente em movimento. O gradiente só se vê onde a rota existe,
// e o efeito é um brilho a percorrê-la — sem redesenhar o mapa em vector nem
// adivinhar o traçado.
//
// Apanha a linha sólida e a tracejada: ambas são do mesmo verde.

import sharp from 'sharp';
import { statSync } from 'node:fs';

const DIR = 'site_YB/assets/images/';
const ORIGEM = DIR + 'city_map_with_lime_green_rout.png';
const DESTINO = DIR + 'hero-map-rota-mask.png';

const { data, info } = await sharp(ORIGEM)
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

// Verde YourBox: ~#bed62f (R 190, G 214, B 47).
//
// O alpha é CONTÍNUO, não binário. Um limiar seco dava-lhe bordas em escada, e o
// brilho por cima ficava com ar recortado — que era a queixa. Aqui a opacidade
// acompanha o quanto o pixel puxa ao verde, por isso as bordas suavizadas da linha
// (o anti-aliasing do desenho original) tornam-se bordas suavizadas na máscara, e
// o clarão ganha um halo natural em vez de um corte.
function verdura(r, g, b) {
  if (g < 90) return 0;                 // escuro de mais para ser rota
  const contraste = g - Math.max(b, r * 0.75);
  if (contraste <= 10) return 0;        // azul do mapa
  // 10 -> transparente, 95 -> opaco. Suave o suficiente para dar meio-tom sem
  // apanhar o brilho ténue das ruas.
  const t = Math.min(1, (contraste - 10) / 85);
  // Curva suave (smoothstep): evita o degrau que uma rampa linear deixa a meio.
  return t * t * (3 - 2 * t);
}

const alpha = Buffer.alloc(width * height);
let n = 0;
for (let i = 0, p = 0; i < data.length; i += channels, p++) {
  const v = verdura(data[i], data[i + 1], data[i + 2]);
  if (v > 0) { alpha[p] = Math.round(v * 255); if (v > 0.4) n++; }
}

console.log(`\npixels da rota: ${n} de ${width * height}  (${(n / (width * height) * 100).toFixed(2)}%)`);
if (n < 500) {
  console.error('Poucos pixels detectados — o critério de cor não bate com a imagem.');
  process.exit(1);
}

// PNG branco com a rota no canal alpha: é o que `mask-image` espera.
// Construído directamente em RGBA — sem `composite`, que no mesmo pipeline colide
// com o `resize` (o canvas encolhe antes de a camada ser sobreposta).
const rgba = Buffer.alloc(width * height * 4);
for (let p = 0; p < width * height; p++) {
  rgba[p * 4] = 255;
  rgba[p * 4 + 1] = 255;
  rgba[p * 4 + 2] = 255;
  rgba[p * 4 + 3] = alpha[p];
}

await sharp(rgba, { raw: { width, height, channels: 4 } })
  // Desfoque generoso: o clarão deve transbordar ligeiramente da linha, como luz
  // a irradiar. Um valor baixo mantinha o brilho preso dentro do traço e dava-lhe
  // o aspecto de fita, não de luz.
  .blur(1.8)
  // Metade da resolução. A máscara vai embutida no HTML em base64, e já está
  // desfocada — a 512 não se distingue da versão a 1024, e poupa dois terços dos
  // bytes que o visitante descarrega antes de a página pintar.
  .resize({ width: 512, kernel: 'lanczos3' })
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(DESTINO);

console.log(`${DESTINO.split('/').pop()}  ${Math.round(statSync(DESTINO).size / 1024)} KB\n`);
