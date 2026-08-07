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

// Verde YourBox: ~#bed62f (R 190, G 214, B 47). O critério é relativo, não exacto,
// para apanhar as bordas suavizadas da linha sem apanhar o azul do mapa.
function eRota(r, g, b) {
  return g > 110 && g > b + 55 && g >= r - 30 && b < 150;
}

const alpha = Buffer.alloc(width * height);
let n = 0;
for (let i = 0, p = 0; i < data.length; i += channels, p++) {
  if (eRota(data[i], data[i + 1], data[i + 2])) { alpha[p] = 255; n++; }
}

console.log(`\npixels da rota: ${n} de ${width * height}  (${(n / (width * height) * 100).toFixed(2)}%)`);
if (n < 500) {
  console.error('Poucos pixels detectados — o critério de cor não bate com a imagem.');
  process.exit(1);
}

// PNG branco com a rota no canal alpha: é o que `mask-image` espera.
await sharp({
  create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
})
  .composite([{
    input: await sharp(Buffer.alloc(width * height * 3, 255), {
      raw: { width, height, channels: 3 },
    }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer(),
    blend: 'over',
  }])
  // Desfoque mínimo: suaviza os serrilhados da detecção sem engordar a linha.
  .blur(0.6)
  .png({ compressionLevel: 9, palette: false })
  .toFile(DESTINO);

console.log(`${DESTINO.split('/').pop()}  ${Math.round(statSync(DESTINO).size / 1024)} KB\n`);
