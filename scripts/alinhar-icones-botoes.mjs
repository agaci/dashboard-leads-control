// Alinha os ícones com o texto nos botões de acção do hero, nas páginas de quiz.
//
//   node scripts/alinhar-icones-botoes.mjs
//
// O PORQUÊ
// `.btn-primary` e `.btn-secondary` não declaram `display`, por isso são
// inline-block: o SVG do ícone (injectado pelo lucide em runtime) assenta na linha
// de base do texto e fica uns pixels abaixo do centro óptico. Nota-se sobretudo no
// botão primário, que é grande.
//
// Os restantes botões da página — quiz-next, quiz-back, quiz-choice, btn-gps — já
// usam flex e estão bem. Não se lhes toca.
//
// O bloco é injectado no <style> de cada página em vez de ir para o CSS partilhado
// (styles-a.css), que também serve as landings A/B/C/D. O pedido era para as quiz,
// e assim nenhuma outra página muda de aspecto sem termos decidido isso.
//
// Idempotente: correr duas vezes não duplica nada.

import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const DIR = 'c:/projetos/dashboard-leads-control/app-dashboard-leads-control/site_YB/';
const MARCA = '/* ===== Alinhamento dos icones nos botoes de accao =====';

const BLOCO = `
    ${MARCA}
       .btn-primary e .btn-secondary nao declaram display, por isso sao inline-block:
       o SVG do icone assenta na linha de base do texto e fica abaixo do centro.
       Os outros botoes da pagina (quiz-next, quiz-back, quiz-choice, btn-gps) ja
       usam flex e nao precisam. */
    .hero-buttons .btn-primary,
    .hero-buttons .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      line-height: 1.2;
    }
    /* O icone nunca deve encolher quando o texto e longo. */
    .hero-buttons .btn-primary svg,
    .hero-buttons .btn-secondary svg { flex-shrink: 0; }
`;

// Fecho do <style> inline, imediatamente antes do script do lucide.
const ANCORA = /(\n\s*<\/style>\s*\n\s*<script src="https:\/\/unpkg\.com\/lucide)/;

const ficheiros = globSync(DIR + 'index-quiz*.html');

for (const caminho of ficheiros.sort()) {
  const nome = caminho.split(/[\\/]/).pop();
  let s = readFileSync(caminho, 'utf8');

  if (s.includes(MARCA)) { console.log(`SKIP   ${nome}  (ja alinhado)`); continue; }

  // Só faz sentido onde existam mesmo os botões do hero com ícone.
  if (!/<div class="hero-buttons">/.test(s)) { console.log(`-      ${nome}  (sem hero-buttons)`); continue; }

  if (!ANCORA.test(s)) { console.log(`FALHA  ${nome}  (ancora do </style> nao encontrada)`); continue; }

  s = s.replace(ANCORA, BLOCO + '$1');
  writeFileSync(caminho, s, 'utf8');
  console.log(`OK     ${nome}`);
}
