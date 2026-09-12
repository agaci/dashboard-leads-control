import fs from 'fs';

/**
 * A expiracao da sessao do yourbox-visit.js, testada sobre o ficheiro que vai subir.
 *
 *   node scripts/verificar-sessao-visita.mjs
 *
 * Nao copia a logica: extrai do proprio ficheiro o bloco do `sessionId` e corre-o com um
 * `sessionStorage` falso e um relogio que se manda andar. Uma copia num teste provaria
 * que a copia funciona.
 *
 * O que isto trava: o ficheiro e servido sem Cache-Control e vive em quinze paginas. Um
 * erro aqui so se veria dias depois, e ve-se como "as visitas pararam" — que foi
 * exactamente o sintoma que deu origem a isto.
 */
const src = fs.readFileSync('site_YB/assets/js/yourbox-visit.js', 'utf8');

const bloco = src.slice(
  src.indexOf('var INACTIVIDADE_MS'),
  src.indexOf('function detectVariante'),
);
if (!bloco.includes('function sessionId')) {
  console.error('nao encontrei o bloco do sessionId — o ficheiro mudou de forma');
  process.exit(1);
}

const falhas = [];
const ok = (n, cond, extra = '') => {
  console.log(`${cond ? ' ok  ' : 'FALHA'} ${n}${extra ? '  ' + extra : ''}`);
  if (!cond) falhas.push(n);
};

/** Um sessionStorage de brincar, partilhado entre carregamentos da mesma "aba". */
function criarAba(rebenta = false) {
  const dados = new Map();
  return {
    getItem: (k) => { if (rebenta) throw new Error('bloqueado'); return dados.has(k) ? dados.get(k) : null; },
    setItem: (k, v) => { if (rebenta) throw new Error('bloqueado'); dados.set(k, String(v)); },
    removeItem: (k) => dados.delete(k),
    _dados: dados,
  };
}

/** Simula um carregamento de pagina: o modulo e avaliado de novo, a aba mantem-se. */
function carregar(aba, agora) {
  const fn = new Function('sessionStorage', 'Date', `
    ${bloco}
    return { id: sessionId(), nova: SESSAO_NOVA, outraVez: sessionId() };
  `);
  return fn(aba, { now: () => agora });
}

const MIN = 60 * 1000;
const T0 = 1757600000000;

// ── uma aba normal ───────────────────────────────────────────────────────────
const aba = criarAba();

const a = carregar(aba, T0);
ok('a primeira visita cria sessao', a.nova === true && /^s_/.test(a.id), a.id);
ok('duas chamadas no mesmo carregamento dao o mesmo id', a.id === a.outraVez);

const b = carregar(aba, T0 + 5 * MIN);
ok('5 minutos depois e a mesma sessao', b.id === a.id && b.nova === false, b.id);

const c = carregar(aba, T0 + 29 * MIN);
ok('29 minutos depois ainda e a mesma', c.id === a.id && c.nova === false);

// A actividade de agora mesmo conta: sao 30 minutos SEM NADA, e nao 30 desde o inicio.
const d = carregar(aba, T0 + 55 * MIN);
ok('26 minutos depois da ultima ainda e a mesma', d.id === a.id && d.nova === false,
   'a janela conta da ultima actividade, nao do inicio');

const e = carregar(aba, T0 + 55 * MIN + 31 * MIN);
ok('31 minutos parado abre sessao nova', e.id !== a.id && e.nova === true, e.id);

// ── o caso que deu origem a isto ─────────────────────────────────────────────
const aberta = criarAba();
const ontem = carregar(aberta, T0);
const hoje = carregar(aberta, T0 + 17 * 60 * MIN);
ok('um separador aberto de um dia para o outro conta como visita nova',
   hoje.id !== ontem.id && hoje.nova === true,
   'era isto que contava como uma visita so');

// ── os casos estragados ──────────────────────────────────────────────────────
const semData = criarAba();
carregar(semData, T0);
semData._dados.delete('yb_vsts');
const r1 = carregar(semData, T0 + MIN);
ok('sem marca de tempo, comeca sessao nova', r1.nova === true);

const lixo = criarAba();
carregar(lixo, T0);
lixo._dados.set('yb_vsts', 'nao-e-um-numero');
const r2 = carregar(lixo, T0 + MIN);
ok('marca de tempo estragada nao prende a sessao', r2.nova === true);

const bloqueado = criarAba(true);
const r3 = carregar(bloqueado, T0);
ok('com o armazenamento bloqueado continua a haver id', /^s_/.test(r3.id), r3.id);
ok('e cada carregamento conta como visita, que e o melhor que se pode fazer', r3.nova === true);

// ── a marca de tempo renova-se ───────────────────────────────────────────────
const renova = criarAba();
carregar(renova, T0);
const t1 = renova._dados.get('yb_vsts');
carregar(renova, T0 + 10 * MIN);
ok('cada carregamento renova a marca de tempo', renova._dados.get('yb_vsts') !== t1);

// ── e a geo nao se herda entre sessoes ───────────────────────────────────────
ok('sessao nova limpa a geo em cache',
   src.includes('if (!SESSAO_NOVA) {') && src.indexOf('sessionId();') < src.indexOf("getItem('yb_vgeo')"),
   'quem sai do escritorio e volta noutra rede aparecia na cidade errada');

console.log(`\n${falhas.length ? 'FALHARAM: ' + falhas.join(' | ') : 'todos passaram'}`);
process.exit(falhas.length ? 1 : 0);
