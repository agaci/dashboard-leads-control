// Gera index-quiz-7b.html e index-quiz-7c.html a partir das 6b/6c.
//
//   node scripts/gerar-quiz7.mjs
//
// Copia a página inteira e troca APENAS o hero: fundo, badge, título, subtítulo e
// texto do CTA. A mecânica do quiz, o tracking, o drop-off, o WhatsApp e o form
// ficam byte a byte iguais — é o que permite comparar 6b vs 7b e 6c vs 7c e saber
// que a diferença veio do hero e de mais nada.
//
// O onclick do botão primário NÃO é alterado. Muda o texto e o ícone; o
// comportamento é o mesmo, para não introduzir uma segunda variável no teste.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'c:/projetos/dashboard-leads-control/app-dashboard-leads-control/site_YB/';

// A máscara do brilho vai EMBUTIDA no CSS, não como ficheiro.
//
// O Chrome aplica CORS a `mask-image`. Aberto em file:// cada ficheiro é uma
// origem distinta, a máscara falha a carregar e o browser trata isso como máscara
// vazia — o elemento desaparece por completo. Um data URI não tem origem, por isso
// funciona em file://, em http:// e sem depender de o ficheiro chegar ao FTP.
// São ~8 KB no HTML e menos um pedido de rede.
const MASCARA_B64 = readFileSync(DIR + 'assets/images/hero-map-rota-mask.png').toString('base64');
const MASCARA_URL = `data:image/png;base64,${MASCARA_B64}`;

const PARES = [
  { de: 'index-quiz-6b.html', para: 'index-quiz-7b.html', varDe: 'QUIZ6B', varPara: 'QUIZ7B' },
  { de: 'index-quiz-6c.html', para: 'index-quiz-7c.html', varDe: 'QUIZ6C', varPara: 'QUIZ7C' },
];

// ── O hero novo ────────────────────────────────────────────────────────────
// Frases escolhidas do bloco enviado. Nota de congruência: estas páginas são de
// captação e não mostram preço no ecrã, por isso o hero promete o pedido rápido
// e a resposta — nunca "preço em 2 minutos", que a página não entrega.
const BADGE = 'TODO O PORTUGAL · 24/7';
const TITULO = `                    Quando não pode esperar,<br>
                    <span class="highlight">nós não esperamos</span>.`;
const SUBTITULO = 'Recolha em 1 hora, em todo o país. Diga-nos o que envia e tratamos do resto.';
const CTA = 'Pedir orçamento agora';

// Fundo: mapa com a rota, no lugar do iframe da animação espacial.
// O original tinha 969 KB; serve-se WebP de 24 KB (desktop) e 12 KB (telemóvel),
// com o PNG como último recurso para browsers sem WebP. Um <img> em vez de
// <iframe> também poupa um contexto de navegação dentro da página.
const FUNDO_ANTIGO = /<!-- Animacao espacial do hero \(ficheiro autonomo embutido\) -->\s*<div class="hero-space-bg" aria-hidden="true">\s*<iframe[^>]*><\/iframe>\s*<\/div>/;
const FUNDO_NOVO = `<!-- Fundo: mapa nocturno com a rota YourBox -->
        <div class="hero-map-bg" aria-hidden="true">
            <picture>
                <source media="(max-width: 768px)" srcset="assets/images/hero-map-640.webp?v=20260807" type="image/webp">
                <source srcset="assets/images/hero-map-1024.webp?v=20260807" type="image/webp">
                <img src="assets/images/city_map_with_lime_green_rout.png" alt="" loading="eager" decoding="async" fetchpriority="high">
            </picture>
            <span class="hero-route-glow"></span>
        </div>`;

const CSS_ANTIGO = /\.hero-space-bg \{[^}]*\}\s*\.hero-space-bg iframe \{[^}]*\}/;
const CSS_NOVO = `.hero-map-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
    .hero-map-bg picture { position: absolute; inset: 0; display: block; }
    /* A imagem e quadrada (1024x1024) e o hero e largo: o cover corta em cima e em
       baixo e mantem o centro, que e por onde passa a rota. */
    .hero-map-bg img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; }
    /* O texto do hero tem de ganhar ao mapa: veu escuro por cima, mais denso do lado
       do conteudo. Sem isto o titulo perde contraste sobre a rota clara. */
    .hero-map-bg::after { content: ''; position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(100deg, rgba(8,20,34,0.92) 0%, rgba(8,20,34,0.72) 45%, rgba(8,20,34,0.35) 100%); }
    @media (max-width: 768px) { .hero-map-bg::after { background: rgba(8,20,34,0.80); } }

    /* Brilho a percorrer a rota.
       A imagem e raster — os pixels nao se animam. O truque e mascarar esta camada
       com a silhueta da rota (extraida da propria imagem por
       scripts/extrair-mascara-rota.mjs) e fazer correr um gradiente por dentro: so
       se ve onde a rota existe. Fica POR CIMA do veu escuro, senao ficava apagado.
       O mask-size/position acompanham o object-fit da imagem, para alinharem. */
    .hero-route-glow { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden;
      --yb-rota-mask: url("${MASCARA_URL}");
      -webkit-mask-image: var(--yb-rota-mask);
              mask-image: var(--yb-rota-mask);
      -webkit-mask-size: cover;      mask-size: cover;
      -webkit-mask-position: center; mask-position: center;
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      mix-blend-mode: screen; }
    /* O brilho e um filho a deslizar com transform, nao um background-position
       animado: transform corre na GPU e nao obriga a repintar a cada frame, o que
       importa com 78% do trafego em telemovel. */
    .hero-route-glow::before { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 38%;
      background: linear-gradient(90deg,
        rgba(234,255,168,0) 0%, rgba(234,255,168,0.20) 35%,
        rgba(255,255,255,0.95) 50%,
        rgba(234,255,168,0.20) 65%, rgba(234,255,168,0) 100%);
      will-change: transform;
      animation: yb-rota-brilho 5.5s linear infinite; }
    @keyframes yb-rota-brilho {
      from { transform: translateX(-110%); }
      to   { transform: translateX(375%); }
    }
    /* Quem pediu menos movimento ao sistema fica com a rota parada, sem perder o hero. */
    @media (prefers-reduced-motion: reduce) {
      .hero-route-glow::before { animation: none; transform: none; width: 100%; opacity: 0.25; }
    }`;

function trocar(src, re, novo, etiqueta, ficheiro) {
  if (!re.test(src)) throw new Error(`[${ficheiro}] não encontrei: ${etiqueta}`);
  return src.replace(re, novo);
}

for (const p of PARES) {
  const origem = DIR + p.de;
  if (!existsSync(origem)) { console.log(`FALTA  ${p.de}`); continue; }

  let s = readFileSync(origem, 'utf8');

  s = trocar(s, FUNDO_ANTIGO, FUNDO_NOVO, 'bloco do fundo', p.de);
  s = trocar(s, CSS_ANTIGO, CSS_NOVO, 'CSS do fundo', p.de);

  s = trocar(s,
    /<div class="hero-badge"><i data-lucide="zap"><\/i>[^<]*<\/div>/,
    `<div class="hero-badge"><i data-lucide="map-pin"></i> ${BADGE}</div>`,
    'badge', p.de);

  s = trocar(s,
    /<h1 class="hero-title">[\s\S]*?<\/h1>/,
    `<h1 class="hero-title">\n${TITULO}\n                </h1>`,
    'titulo', p.de);

  s = trocar(s,
    /<p class="hero-subtitle">[\s\S]*?<\/p>/,
    `<p class="hero-subtitle">\n                    ${SUBTITULO}\n                </p>`,
    'subtitulo', p.de);

  // Só o rótulo e o ícone. O onclick fica como está.
  s = trocar(s,
    /<button class="btn-primary" onclick="yourboxForm\.focusOrigem\(\)"><i data-lucide="calculator"><\/i>[^<]*<\/button>/,
    `<button class="btn-primary" onclick="yourboxForm.focusOrigem()"><i data-lucide="arrow-right"></i> ${CTA}</button>`,
    'CTA primario', p.de);

  // Identidade da variante — sem isto os dois testes misturavam-se no dashboard.
  const antes = (s.match(new RegExp(p.varDe, 'g')) ?? []).length;
  s = s.split(p.varDe).join(p.varPara);

  writeFileSync(DIR + p.para, s, 'utf8');
  console.log(`OK     ${p.para}  (${p.varDe} -> ${p.varPara}, ${antes} ocorrências)`);
}

console.log('\nMecanica do quiz intacta: so o hero mudou.');
