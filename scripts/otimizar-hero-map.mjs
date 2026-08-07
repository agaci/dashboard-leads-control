// Optimiza a imagem de fundo do hero das quiz 7.
//
//   node scripts/otimizar-hero-map.mjs
//
// O original tem 969 KB — quase um megabyte antes de a página pintar, com 78% do
// tráfego em telemóvel. Mas comprimir de mais também custa: a imagem tem áreas
// planas grandes onde o WebP agressivo deixa bandas visíveis, logo por trás do
// título.
//
// Três larguras. A imagem é quadrada (1024) e o hero é largo, por isso num ecrã
// de 1920 o `cover` amplia-a quase 2x — daí a versão 1920, ampliada aqui com
// lanczos em vez de deixar o browser fazer o upscale com bilinear.
//
// Usa o sharp que já vem com o Next.js — sem dependências novas.

import sharp from 'sharp';
import { statSync } from 'node:fs';

const DIR = 'site_YB/assets/images/';
const ORIGEM = DIR + 'city_map_with_lime_green_rout.png';

const kb = (p) => Math.round(statSync(p).size / 1024);

const SAIDAS = [
  // Ecrãs largos: ampliada com lanczos3 (o resize do sharp por omissão), que
  // segura melhor as linhas finas da rota do que o upscale do browser.
  { nome: 'hero-map-1920.webp', largura: 1920, qualidade: 90 },
  { nome: 'hero-map-1024.webp', largura: 1024, qualidade: 92 },
  { nome: 'hero-map-640.webp', largura: 640, qualidade: 90 },
];

const antes = kb(ORIGEM);
console.log(`\noriginal: ${ORIGEM.split('/').pop()}  ${antes} KB  (1024x1024)\n`);

for (const s of SAIDAS) {
  const destino = DIR + s.nome;
  await sharp(ORIGEM)
    .resize({ width: s.largura, kernel: 'lanczos3' })
    .webp({
      quality: s.qualidade,
      effort: 6,          // mais tempo a comprimir agora, menos bytes para sempre
      smartSubsample: true, // preserva a saturação do verde da rota
    })
    .toFile(destino);

  const depois = kb(destino);
  console.log(`  ${s.nome.padEnd(22)} ${String(depois).padStart(4)} KB   -${Math.round((1 - depois / antes) * 100)}%`);
}

console.log('');
