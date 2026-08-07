// Optimiza a imagem de fundo do hero das quiz 7.
//
//   node scripts/otimizar-hero-map.mjs
//
// O original tem 992 KB — quase um megabyte a carregar antes de a página pintar,
// com 78% do tráfego em telemóvel. Um hero pesado atrasa o primeiro desenho
// exactamente onde se perdem os visitantes impacientes, e este teste é sobre o
// hero: não queremos medir "imagem bonita vs rápida", queremos medir a imagem.
//
// Gera duas larguras em WebP. O `<picture>` no HTML serve a pequena a quem está
// no telemóvel e a grande ao resto, e o PNG original fica como fallback para os
// poucos browsers sem WebP.
//
// Usa o sharp que já vem com o Next.js — sem dependências novas.

import sharp from 'sharp';
import { statSync } from 'node:fs';

const DIR = 'site_YB/assets/images/';
const ORIGEM = DIR + 'city_map_with_lime_green_rout.png';

const kb = (p) => Math.round(statSync(p).size / 1024);

const SAIDAS = [
  { nome: 'hero-map-1024.webp', largura: 1024, qualidade: 80 },
  { nome: 'hero-map-640.webp', largura: 640, qualidade: 78 },
];

const antes = kb(ORIGEM);
console.log(`\noriginal: ${ORIGEM.split('/').pop()}  ${antes} KB  (1024x1024)\n`);

for (const s of SAIDAS) {
  const destino = DIR + s.nome;
  await sharp(ORIGEM)
    .resize({ width: s.largura, withoutEnlargement: true })
    // effort 6: mais tempo a comprimir agora, menos bytes para sempre.
    .webp({ quality: s.qualidade, effort: 6 })
    .toFile(destino);

  const depois = kb(destino);
  console.log(`  ${s.nome.padEnd(22)} ${String(depois).padStart(4)} KB   -${Math.round((1 - depois / antes) * 100)}%`);
}

console.log('');
