import pkg from 'mongodb'; const { MongoClient } = pkg;
import fs from 'fs';

/**
 * Os textos editáveis das cartas, contra a base de dados a sério.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs scripts/verificar-textos-carta.mjs
 *
 * **Escreve na base de dados.** Cria versões marcadas com `criadoPor: 'teste automatico'`
 * e apaga-as no fim. Não toca em nenhuma versão escrita por uma pessoa.
 *
 * Existe para travar a única coisa que os testes puros não alcançam: que o texto gravado
 * é mesmo o que sai no email, e que a pré-visualização e o envio lêem do mesmo sítio. Se
 * divergissem, a operadora aprovava uma carta e enviava outra.
 */
const env = fs.readFileSync('.env.local', 'utf8');
const c = await MongoClient.connect(env.match(/^MONGODB_URI=(.*)$/m)[1].trim());
const db = c.db('weby');

const { corpoApresentacao, APRESENTACOES } = await import('@/lib/crm/apresentacao.ts');
const { renderizar } = await import('@/lib/crm/textosCarta.ts');
const { TEXTOS_INICIAIS, lerTextosCarta, gravarTextoCarta, historicoTextos } = await import('@/lib/crm/textos.ts');
const { montarApresentacao, assuntoApresentacao } = await import('@/lib/email/catalogo.ts');

const falhas = [];
const ok = (n, cond, extra = '') => {
  console.log(`${cond ? ' ok  ' : 'FALHA'} ${n}${extra ? '\n       ' + extra : ''}`);
  if (!cond) falhas.push(n);
};

const V = {
  categoria: 'mudanças', zona: 'Setúbal', pedidos: 4, pedidosPorMes: 4,
  pessoa: 'o Sr. Ricardo', quemIndicou: 'a Transportes Lopes', assinatura: 'Ana Carvalho',
};

// ── 1. a semente diz o mesmo que o codigo antigo ────────────────────────────
// O codigo escrevia `&mdash;`; a semente tem o travessao a serio, porque e o que alguem
// escreve num editor de texto — um `&mdash;` escrito la sairia escapado. Renderizam
// igual, e e o renderizado que interessa.
const norm = (x) => String(x).replace(/&mdash;/g, '—');

// A `indicacao` foi reescrita de proposito: a frase antiga tinha uma ALTERNATIVA para
// quando faltava a categoria ("este tipo de transporte"), e a sintaxe de blocos so sabe
// deixar cair, nao sabe substituir. A nova le-se bem nos dois estados — o que se verifica
// logo a seguir.
const IGUAIS = ['contexto', 'generica', 'pos_chamada'];

for (const a of APRESENTACOES) {
  const antigo = corpoApresentacao(a.id, {
    categoria: V.categoria, zona: V.zona, pedidosPorMes: 4,
    pessoa: V.pessoa, quemIndicou: V.quemIndicou, assinatura: V.assinatura,
  });
  const novo = renderizar(TEXTOS_INICIAIS[a.id].abertura, V);
  if (IGUAIS.includes(a.id)) {
    const igual = norm(antigo.intro) === norm(novo);
    ok(`${a.id}: a semente diz o mesmo que o codigo`, igual,
       igual ? '' : `antigo: ${antigo.intro}\n       novo  : ${novo}`);
  } else {
    ok(`${a.id}: reescrita de proposito`, norm(antigo.intro) !== norm(novo));
  }
}

// ── 2. os blocos opcionais fecham a frase nos dois estados ──────────────────
const semNumero = corpoApresentacao('contexto', { categoria: 'mudanças', zona: 'Setúbal', pedidosPorMes: null, assinatura: 'x' });
const semNumeroNovo = renderizar(TEXTOS_INICIAIS.contexto.abertura, { ...V, pedidos: null });
ok('contexto sem "pedidos por mes" fecha igual', norm(semNumero.intro) === norm(semNumeroNovo),
   norm(semNumero.intro) === norm(semNumeroNovo) ? '' : `antigo: ${semNumero.intro}\n       novo  : ${semNumeroNovo}`);

const indComTudo = renderizar(TEXTOS_INICIAIS.indicacao.abertura, V);
const indSo = renderizar(TEXTOS_INICIAIS.indicacao.abertura, { quemIndicou: V.quemIndicou });
ok('indicacao com categoria e zona', indComTudo.includes('que façam <strong>mudanças</strong>'), indComTudo);
ok('indicacao sem elas nao deixa pontuacao a solta',
   indSo.includes('Procuramos empresas para lhes passar') && !indSo.includes('[') && !/ [:,]/.test(indSo),
   indSo);

const pcSo = renderizar(TEXTOS_INICIAIS.pos_chamada.abertura, { pessoa: 'o Sr. Ricardo' });
ok('pos_chamada sem categoria nem zona fecha bem', pcSo.includes('temos pedidos que não'), pcSo);

// ── 3. sem nada gravado, vale o codigo ──────────────────────────────────────
let textos = await lerTextosCarta(db);
const versaoDePartida = textos.contexto.versao;
ok('sem nada gravado, vale a semente', versaoDePartida === 'contexto-v1', versaoDePartida);

const antes = montarApresentacao('contexto', V, '#', '#', textos.contexto);
ok('o email de partida traz a frase actual', antes.includes('que não conseguimos servir'));

// ── 4. a validacao trava antes de gravar ────────────────────────────────────
const mauAssunto = await gravarTextoCarta(db, 'contexto', {
  assunto: 'Trabalho de **{categoria}**', abertura: 'x', oQueE: [],
}, 'teste automatico');
ok('recusa negrito no assunto', mauAssunto.ok === false, mauAssunto.erro ?? '');

const mauCampo = await gravarTextoCarta(db, 'contexto', {
  assunto: 'a', abertura: 'Olá {patrao}', oQueE: [],
}, 'teste automatico');
ok('recusa uma variavel que nao existe', mauCampo.ok === false, mauCampo.erro ?? '');

// ── 5. gravar cria versao nova, e o email muda ──────────────────────────────
const gravou = await gravarTextoCarta(db, 'contexto', {
  assunto: 'Trabalho de {categoria} que não conseguimos fazer',
  abertura: 'Temos pedidos de **{categoria}** em **{zona}**[ — cerca de {pedidos} por mês] à espera de quem os faça.',
  oQueE: ['Somos a YourBox e isto é um teste.'],
}, 'teste automatico');
ok('grava e sobe a versao', gravou.ok && gravou.versao === 'contexto-v2', gravou.versao ?? gravou.erro);

textos = await lerTextosCarta(db);
ok('a leitura traz a versao nova', textos.contexto.versao === 'contexto-v2');

const depois = montarApresentacao('contexto', V, '#', '#', textos.contexto);
ok('o email passa a trazer o texto novo', depois.includes('à espera de quem os faça'));
ok('e deixa de trazer o antigo', !depois.includes('gostávamos de vos passar esses pedidos'));
ok('o negrito virou <strong>', depois.includes('<strong>mudanças</strong>'));
ok('o assunto acompanha',
   assuntoApresentacao('contexto', V, textos.contexto) === 'Trabalho de mudanças que não conseguimos fazer',
   assuntoApresentacao('contexto', V, textos.contexto));

// As outras tres nao se mexeram.
ok('as outras variantes ficam como estavam', textos.generica.versao === 'generica-v1');

// ── 6. gravar o mesmo nao cria versao ───────────────────────────────────────
const igual = await gravarTextoCarta(db, 'contexto', textos.contexto, 'teste automatico');
ok('gravar sem mudar nada nao cria versao', igual.versao === 'contexto-v2', igual.versao);

const h = await historicoTextos(db, 'contexto');
ok('o historico guarda uma versao so', h.length === 1 && h[0].versao === 'contexto-v2', `${h.length} versao(oes)`);

// ── 7. um valor perigoso nao parte a carta ──────────────────────────────────
const mau = montarApresentacao('contexto', { ...V, categoria: 'Silva & <script>x</script>' }, '#', '#', textos.contexto);
ok('valor com HTML sai escapado', mau.includes('&lt;script&gt;') && !mau.includes('<script>'));
ok('e o & nao fica escapado a dobrar', !mau.includes('&amp;amp;'));

// ── limpeza ─────────────────────────────────────────────────────────────────
await db.collection('crm_textos_carta').deleteMany({ criadoPor: 'teste automatico' });
const limpo = await lerTextosCarta(db);
ok('apagado o teste, volta a semente', limpo.contexto.versao === versaoDePartida);

console.log(`\n${falhas.length ? 'FALHARAM: ' + falhas.join(' | ') : 'todos passaram'}`);
await c.close();
process.exit(falhas.length ? 1 : 0);
