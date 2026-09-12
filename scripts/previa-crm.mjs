import fs from 'fs';

/**
 * O painel de um parceiro e o mapa, nos dois temas, sem servidor nem sessao.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs scripts/previa-crm.mjs
 *
 * Escreve tres HTML na raiz, para abrir no browser ou fotografar sem interface.
 *
 * **Existe por uma razao concreta.** A primeira versao do mapa tinha `fill="#fff"` nos
 * numeros das ilhas. No tema escuro estava certo; no claro eram numeros brancos sobre um
 * cartao branco, e nem o TypeScript nem os testes nem o build dizem nada sobre isso —
 * so se ve a olho, e so se olharmos para o tema certo.
 *
 * O CSS sai do proprio page.tsx e os tokens de cor saem do globals.css, para nao
 * divergirem. O markup e copiado a mao: e a fraqueza disto, e pode ficar velho. Serve
 * para julgar cor, contraste e espacamento, nao para provar comportamento.
 */
const page = fs.readFileSync('app/dashboard/crm/page.tsx', 'utf8');
const CSS = page.match(/<style>\{`([\s\S]*?)`\}<\/style>/)[1];
const globais = fs.readFileSync('app/globals.css', 'utf8');

const bloco = (re) => globais.match(re)[1];
const TOKENS_ESCURO = bloco(/(--yb-bg:[\s\S]*?)color-scheme:\s*dark;/);
const TOKENS_CLARO = bloco(/\[data-theme="light"\][\s\S]*?(--yb-bg:[\s\S]*?)color-scheme:\s*light;/);

const { DISTRITOS_MAPA, MAPA_LARGURA, MAPA_ALTURA } = await import('@/lib/crm/mapa-distritos.ts');
const { degrau } = await import('@/lib/crm/escala.ts');

const ESCALA = [
  'rgba(34,197,220,0.22)', 'rgba(30,199,222,0.38)', 'rgba(24,201,224,0.54)',
  'rgba(16,203,226,0.70)', 'rgba(8,205,228,0.88)',
];
const valores = {
  porto: 14, braga: 9, aveiro: 7, lisboa: 12, setubal: 6, coimbra: 4, leiria: 3,
  faro: 5, 'viana do castelo': 2, 'vila real': 1, viseu: 2, guarda: 0, braganca: 0,
  'castelo branco': 0, santarem: 3, portalegre: 0, evora: 1, beja: 0, acores: 0, madeira: 1,
};
const maximo = Math.max(...Object.values(valores));

const DEFS = `<defs><pattern id="yb-vazio" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="5" height="5" fill="var(--yb-input)"/>
  <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-opacity="0.5" stroke-width="1"/></pattern></defs>`;

const centro = (d) => {
  let sx = 0; let sy = 0; let n = 0;
  for (const par of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) { sx += Number(par[1]); sy += Number(par[2]); n++; }
  return { x: sx / n, y: sy / n };
};
const cPorto = centro(DISTRITOS_MAPA.find((d) => d.id === 'porto').d);

const caminho = (d) => {
  const v = valores[d.id] ?? 0;
  const g = degrau(v, maximo);
  const sel = d.id === 'porto';
  const fill = g < 0 ? 'url(#yb-vazio)' : ESCALA[g];
  const stroke = sel ? 'rgba(0,188,212,0.85)' : (v <= 0 ? 'var(--yb-muted)' : 'var(--yb-card)');
  return `<path d="${d.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sel ? 1.8 : 0.8}" stroke-linejoin="round"/>`;
};

const ilha = (nome, id, i) => {
  const v = valores[id] ?? 0;
  const g = degrau(v, maximo);
  const x = i * (MAPA_LARGURA / 2);
  const fill = g < 0 ? 'url(#yb-vazio)' : ESCALA[g];
  const stroke = v > 0 ? 'var(--yb-border)' : 'var(--yb-muted)';
  return `<rect x="${x + 4}" y="0" width="${MAPA_LARGURA / 2 - 8}" height="42" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="0.7"/>
    <text x="${x + MAPA_LARGURA / 4}" y="16" text-anchor="middle" font-size="9" fill="var(--yb-muted)">${nome}</text>
    <text x="${x + MAPA_LARGURA / 4}" y="33" text-anchor="middle" font-size="13" font-weight="700" fill="var(--yb-fg)">${v}</text>`;
};

const MAPA = `<svg viewBox="0 0 ${MAPA_LARGURA} ${MAPA_ALTURA + 74}" style="width:100%;max-width:236px;display:block;margin:0 auto;color:var(--yb-subtle)">
  ${DEFS}
  ${DISTRITOS_MAPA.map(caminho).join('\n  ')}
  <text x="${cPorto.x.toFixed(1)}" y="${cPorto.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
    font-size="10" font-weight="700" fill="var(--yb-fg)" stroke="var(--yb-card)" stroke-width="2.8" paint-order="stroke">14</text>
  <g transform="translate(0 ${MAPA_ALTURA + 14})">${ilha('Açores', 'acores', 0)}${ilha('Madeira', 'madeira', 1)}</g>
</svg>`;

// ── o painel ─────────────────────────────────────────────────────────────────
const TITULO = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--yb-subtle);margin:0';
const CARTAO = 'background:var(--yb-card);border:1px solid var(--yb-border);border-radius:10px;padding:13px 15px;min-width:0';
const INPUT = 'width:100%;background:var(--yb-input);border:1px solid var(--yb-border);color:var(--yb-fg);border-radius:8px;padding:7px 10px;font-size:13px;box-sizing:border-box';
const FANTASMA = 'background:transparent;border:1px solid transparent;border-radius:7px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;color:var(--yb-cyan)';
const FANTASMA_P = FANTASMA.replace('var(--yb-cyan)', 'var(--yb-subtle)');

const campo = (k, v) => `<p style="font-size:12px;margin:0 0 3px;color:var(--yb-fg)"><span style="color:var(--yb-subtle)">${k}: </span>${v}</p>`;
const numeral = (v, l, cor) => `<div style="min-width:62px"><p style="font-size:21px;font-weight:700;line-height:1.1;margin:0;color:${cor ?? 'var(--yb-fg)'};font-variant-numeric:tabular-nums">${v}</p><p style="font-size:10px;color:var(--yb-subtle);margin:2px 0 0;line-height:1.3">${l}</p></div>`;
const cabeca = (t, accao) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><p style="${TITULO}">${t}</p>${accao ? `<span style="margin-left:auto">${accao}</span>` : ''}</div>`;

const PAINEL = `
<div style="border-top:1px solid var(--yb-border);background:var(--yb-card-2);padding:14px 16px 16px">
  <div class="yb-d-grelha">

    <section style="${CARTAO}">
      ${cabeca('Quem são', `<button style="${FANTASMA}">editar</button>`)}
      ${campo('Pessoa', 'Helder A')}${campo('Telefone', '961220881')}${campo('Email', 'hjbdmc@gmail.com')}${campo('NIF', '508821070')}${campo('Morada', 'Rua Central 42, Amora')}
      <div style="margin-top:11px;padding-left:10px;border-left:3px solid var(--yb-cyan)">
        <p style="${TITULO};margin:0 0 3px">Notas</p>
        <p style="font-size:12px;line-height:1.55;margin:0;white-space:pre-wrap;color:var(--yb-fg)">Só trabalha até às 18h. Prefere WhatsApp. Tem carrinha com plataforma elevatória — bom para electrodomésticos.</p>
      </div>
    </section>

    <section style="${CARTAO}">
      ${cabeca('O que fazem, e onde')}
      <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:11px">
        ${campo('Zonas', 'todo o país')}${campo('Dimensão', '2 a 5')}${campo('Viaturas', '5')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--yb-border)">
        <span style="min-width:0">
          <span style="display:block;font-size:12px;color:var(--yb-fg);font-weight:600">Mudanças</span>
          <span style="display:block;font-size:11px;color:var(--yb-muted);line-height:1.45">todo o país</span>
        </span>
        <span style="margin-left:auto;flex-shrink:0"><button style="${FANTASMA_P}">apagar</button></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--yb-border)">
        <span style="min-width:0">
          <span style="display:block;font-size:12px;color:var(--yb-fg);font-weight:600">ADR <span style="font-size:10px;font-weight:600;color:var(--yb-aviso);margin-left:6px">por activar</span></span>
          <span style="display:block;font-size:11px;color:var(--yb-muted);line-height:1.45">porto, braga · max 1200 kg</span>
        </span>
        <span style="margin-left:auto;flex-shrink:0"><button style="${FANTASMA_P}">apagar</button></span>
      </div>
      <div style="margin-top:10px"><select style="${INPUT}"><option>acrescentar categoria...</option></select></div>
    </section>

    <section style="${CARTAO}">
      ${cabeca('Carteira')}
      <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:12px">
        ${numeral('3600.00', 'euros em carteira')}${numeral('10', 'leads de trial', 'var(--yb-aviso)')}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <input style="${INPUT};width:96px" placeholder="0.00">
        <button style="background:rgba(0,188,212,0.15);color:var(--yb-cyan);border:1px solid rgba(0,188,212,0.35);border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Carregar</button>
      </div>
      <p style="${TITULO};margin:0 0 6px;padding-top:10px;border-top:1px solid var(--yb-border)">Últimos movimentos</p>
      <p style="font-size:11px;color:var(--yb-muted);margin:0 0 5px;line-height:1.45"><span style="color:var(--yb-success);font-weight:700">+100.00</span> carregamento de saldo<br><span style="color:var(--yb-subtle)">07/09/2026, 14:44:46 · saldo 3600.00 EUR</span></p>
      <p style="font-size:11px;color:var(--yb-muted);margin:0 0 5px;line-height:1.45"><span style="color:var(--yb-error);font-weight:700">-20.00</span> lead de mudanças<br><span style="color:var(--yb-subtle)">06/09/2026, 09:12:02 · saldo 3500.00 EUR</span></p>
    </section>

    <section style="${CARTAO};grid-column:1 / -1">
      ${cabeca('Resultados')}
      <div style="display:flex;flex-wrap:wrap;gap:14px 30px">
        ${numeral('4', 'leads recebidas')}${numeral('2', 'reportadas')}${numeral('1', 'recusas', 'var(--yb-error)')}${numeral('1', 'ganhos declarados', 'var(--yb-success)')}${numeral('4.7', 'avaliação do cliente')}${numeral('62', 'score')}
      </div>
    </section>
  </div>
</div>`;

const LINHA = (nome, estado, cor, zonas, servicos, dim, viat, score, saldo, trial) => `
<div class="yb-p-linha">
  <span style="min-width:0">
    <span style="display:block;font-size:13px;font-weight:600;color:var(--yb-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</span>
    <span style="display:block;font-size:10px;color:var(--yb-subtle)">Helder · nunca contactado</span>
  </span>
  <span><span style="display:inline-block;background:color-mix(in srgb, ${cor} 14%, transparent);color:${cor};border:1px solid color-mix(in srgb, ${cor} 34%, transparent);border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">${estado}</span></span>
  <span class="yb-p-so-medio" style="font-size:11px;color:var(--yb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${zonas}</span>
  <span class="yb-p-so-largo" style="font-size:11px;color:var(--yb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${servicos}</span>
  <span class="yb-p-so-largo" style="font-size:11px;color:var(--yb-muted)">${dim}${viat ? `<span style="display:block;font-size:10px;color:var(--yb-subtle)">${viat}</span>` : ''}</span>
  <span class="yb-p-so-medio" style="font-size:11px;text-align:right;color:var(--yb-muted);font-variant-numeric:tabular-nums">${score}</span>
  <span style="text-align:right;font-variant-numeric:tabular-nums"><span style="display:block;font-size:12px;font-weight:700;color:${saldo === '0.00' ? 'var(--yb-error)' : 'var(--yb-fg)'}">${saldo}</span>${trial ? `<span style="display:block;font-size:10px;color:var(--yb-aviso)">+${trial} trial</span>` : ''}</span>
</div>`;

const CORPO = `
<div class="yb-p-corpo">
  <div class="yb-p-mapa" style="${CARTAO};padding:14px 14px 12px">
    <div style="display:flex;gap:5px;margin-bottom:10px">
      <button style="background:rgba(0,188,212,0.15);color:var(--yb-cyan);border:1px solid rgba(0,188,212,0.35);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer">quem temos</button>
      <button style="background:var(--yb-input);color:var(--yb-muted);border:1px solid var(--yb-border);border-radius:20px;padding:3px 10px;font-size:11px;cursor:pointer">o que falta</button>
    </div>
    ${MAPA}
    <div style="margin-top:10px;border-top:1px solid var(--yb-border);padding-top:8px;font-size:11px;color:var(--yb-muted);line-height:1.5">
      <strong style="color:var(--yb-fg)">Porto</strong> — 14 parceiros
      <span style="display:block;color:var(--yb-subtle);font-size:10px">clique outra vez para tirar o filtro</span>
    </div>
  </div>

  <div style="background:var(--yb-card);border:1px solid var(--yb-border);border-radius:12px;overflow:hidden">
    <div class="yb-p-linha yb-p-cab">
      <span>Parceiro</span><span>Estado</span>
      <span class="yb-p-so-medio">Zonas</span><span class="yb-p-so-largo">Serviços</span>
      <span class="yb-p-so-largo">Dimensão</span>
      <span class="yb-p-so-medio" style="text-align:right">Score</span>
      <span style="text-align:right">Saldo</span>
    </div>
    ${LINHA('Parceiro A', 'ACTIVO', '#22c55e', 'todo o país', 'Mudanças', '2 a 5', '5 viat.', 62, '3600.00', 10)}
    ${PAINEL}
    ${LINHA('Parceiro B', 'TRIAL', '#22c55e', 'todo o país', 'Transporte de viaturas', 'não disse', '', 50, '0.00', 5)}
    ${LINHA('Parceiro C', 'TRIAL', '#22c55e', 'lisboa, porto, setubal', 'Temperatura controlada', 'não disse', '', 50, '0.00', 5)}
  </div>
</div>`;

for (const tema of ['claro', 'escuro', 'claro-estreito']) {
  const html = `<!doctype html><meta charset="utf-8">
<style>
:root{${TOKENS_ESCURO}}
[data-theme="light"]{${TOKENS_CLARO}}
body{margin:0;background:var(--yb-bg);font-family:system-ui,sans-serif;padding:16px}
${CSS}
</style>
<body${tema.startsWith('claro') ? ' data-theme="light"' : ''}>${CORPO}</body>`;
  fs.writeFileSync(`zz-previa-detalhe-${tema}.html`, html);
  console.log(`escrito zz-previa-detalhe-${tema}.html`);
}
