import fs from 'fs';

/**
 * Extrai a lista de transportadoras do IMT para CSV.
 *
 *   pdftotext -table -enc UTF-8 -nopgbrk Empresas_Mercadorias.pdf imt.txt
 *   node scripts/imt-extrair.mjs imt.txt imt.csv
 *
 * **Corta onde o padrão aparece, não em posições fixas.** Duas versões falharam antes
 * desta, e as duas por razões que só a medição mostrou:
 *
 *   1. Separar os campos em dois ou mais espaços perdia mil linhas — moradas como
 *      "Rua do Bonfim, 93     2º" têm espaços a mais lá dentro e partem-se em campos a
 *      mais do que as cinco colunas.
 *   2. Cortar em colunas fixas perdia 1349 — as colunas NÃO estão na mesma posição em
 *      todas as páginas deste PDF. A posição mais comum do código postal só reunia 17%
 *      das linhas, e tudo o que caía fora era silenciosamente tratado como continuação
 *      da empresa anterior, corrompendo-a.
 *
 * O que resta é o que devia ter sido desde o início: cada linha que traga um código
 * postal E um âmbito é um registo, e corta-se nas posições onde esses dois aparecem
 * NAQUELA linha. Não é preciso saber onde a coluna está na página.
 *
 * **Mede antes de confiar.** Um extractor que não diga quantas linhas não percebeu mente
 * em silêncio, e aqui o custo de uma linha mal lida é um telefonema a uma empresa com o
 * nome errado. Foi o total de "linhas que parecem registo" — contado à parte, com um
 * grep — que denunciou as duas versões anteriores.
 */

const [entrada, saida] = process.argv.slice(2);
if (!entrada) {
  console.error('uso: node scripts/imt-extrair.mjs <imt.txt> [saida.csv]');
  process.exit(1);
}

const linhas = fs.readFileSync(entrada, 'utf8').split(/\r?\n/);

const RE_CP_POS = /\b\d{4}-\d{3}\b/;
const RE_ALVARA_POS = /\b\d{5,7}\b(?!\s*-)/;
const RE_AMBITO_POS = /\bNACIONAL(\/INTERNACIONAL)?\b/;

function eRuido(l) {
  const t = l.trim();
  if (!t) return true;
  if (/^EMPRESAS DE TRANSPORTE/i.test(t)) return true;
  if (/DESIGNAÇÃO DA EMPRESA/i.test(t)) return true;
  if (/^P[áa]gina\b|^\d+\s*\/\s*\d+$/i.test(t)) return true;
  return false;
}

// ── ler cada linha ───────────────────────────────────────────────────────────
const registos = [];
const sobras = [];
let ultimo = null;

/** Onde acaba a morada e começa a localidade. Uma folga porque as células respiram. */
const FOLGA = 2;

for (const bruta of linhas) {
  if (eRuido(bruta)) continue;

  const cp = RE_CP_POS.exec(bruta);
  const am = RE_AMBITO_POS.exec(bruta);

  // Linha de registo: traz um código postal e, depois dele, um âmbito. Nenhuma linha de
  // continuação traz os dois — é o que os distingue, sem precisar de saber onde a coluna
  // cai nesta página.
  if (cp && am && am.index > cp.index) {
    const antes = bruta.slice(0, cp.index - FOLGA);
    const meio = bruta.slice(cp.index, am.index);
    const ambito = bruta.slice(am.index).trim();

    // Nome e morada: separam-se no primeiro salto de dois ou mais espaços. Aqui já é
    // seguro, porque só se olha para a fatia antes do código postal.
    const partes = antes.trim().split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
    const nome = partes[0] ?? '';
    const morada = partes.slice(1).join(' ').replace(/\s+/g, ' ').trim();

    const mCp = /^(\d{4}-\d{3})\s*(.*)$/.exec(meio.trim());
    const alvara = (meio.match(/\b(\d{5,7})\b\s*$/) ?? [])[1] ?? '';
    const localidade = (mCp?.[2] ?? '').replace(/\b\d{5,7}\b\s*$/, '').replace(/\s+/g, ' ').trim();

    ultimo = {
      nome, morada,
      codigoPostal: mCp?.[1] ?? '',
      localidade,
      alvara,
      ambito,
      continuacoes: 0,
    };
    registos.push(ultimo);
    continue;
  }

  // Continuação: nome ou morada que não coube, ou uma localidade que passou de linha.
  if (ultimo) {
    const t = bruta.trim();
    if (!t) continue;
    ultimo.continuacoes++;

    // Texto que começa lá para a direita é resto da localidade; à esquerda é nome ou
    // morada. Sem coluna medida: usa-se o recuo da própria linha.
    const recuo = bruta.search(/\S/);
    const naColunaDoCP = recuo >= 90;
    const pareceNome = recuo < 4
      && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9 .,ºª&'\-/()]+$/.test(t)
      && /LDA|LD[ªº]|S\.?A\.?|UNIPESSOAL|SOCIEDADE|LIMITADA|,$/i.test(t);

    if (naColunaDoCP) ultimo.localidade = `${ultimo.localidade} ${t}`.replace(/\s+/g, ' ').trim();
    else if (pareceNome) ultimo.nome = `${ultimo.nome} ${t}`.replace(/\s+/g, ' ').trim();
    else ultimo.morada = `${ultimo.morada} ${t}`.replace(/\s+/g, ' ').trim();
    continue;
  }

  sobras.push(bruta.trim());
}

// ── o que correu bem e o que não ─────────────────────────────────────────────
//
// A contagem independente: quantas linhas do ficheiro trazem um código postal seguido de
// um âmbito. Se os registos extraídos não baterem com isto, alguma coisa foi engolida —
// e foi assim que as duas versões anteriores se denunciaram.
const parecemRegisto = linhas.filter((l) => {
  if (eRuido(l)) return false;
  const c = RE_CP_POS.exec(l);
  const a = RE_AMBITO_POS.exec(l);
  return !!(c && a && a.index > c.index);
}).length;

const ok = (r) => /^\d{4}-\d{3}$/.test(r.codigoPostal) && /^\d{5,7}$/.test(r.alvara) && r.nome.length > 2;
const bons = registos.filter(ok);
const maus = registos.filter((r) => !ok(r));
const alvaras = new Set(bons.map((r) => r.alvara));
const nacionais = bons.filter((r) => r.ambito === 'NACIONAL').length;
const semLocalidade = bons.filter((r) => !r.localidade).length;
const remendados = registos.filter((r) => r.continuacoes > 0).length;

const pct = (n) => `${(n / Math.max(registos.length, 1) * 100).toFixed(1)}%`;
console.log(`linhas que parecem registo  ${parecemRegisto}`);
console.log(`registos extraídos      ${registos.length}${registos.length !== parecemRegisto ? '  <-- NAO BATE CERTO' : '  (bate certo)'}`);
console.log(`  completos             ${bons.length}  (${pct(bons.length)})`);
console.log(`  incompletos           ${maus.length}`);
console.log(`  alvarás distintos     ${alvaras.size}${alvaras.size !== bons.length ? '  <-- HA REPETIDOS' : ''}`);
console.log(`  sem localidade        ${semLocalidade}`);
console.log(`  com linha juntada     ${remendados}`);
console.log(`âmbito`);
console.log(`  só nacional           ${nacionais}`);
console.log(`  nacional/internac.    ${bons.length - nacionais}`);
console.log(`linhas nao percebidas   ${sobras.length}`);

if (maus.length) {
  console.log('\nexemplos de incompletos:');
  for (const r of maus.slice(0, 8)) console.log('   ', JSON.stringify(r).slice(0, 130));
}
if (sobras.length) {
  console.log('\nexemplos do que ficou de fora:');
  for (const s of sobras.slice(0, 8)) console.log('   ', s.slice(0, 110));
}

if (saida) {
  const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cabecalho = 'nome,morada,codigoPostal,localidade,alvara,ambito';
  const corpo = bons.map((r) => [r.nome, r.morada, r.codigoPostal, r.localidade, r.alvara, r.ambito].map(csv).join(','));
  fs.writeFileSync(saida, `${cabecalho}\n${corpo.join('\n')}\n`, 'utf8');
  console.log(`\nescrito ${saida} (${bons.length} linhas)`);
}
