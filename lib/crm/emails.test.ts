import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dominioDoSite, emailsDoHtml, jaChega, ligacoesDeContacto, paginasDeContacto,
  parecenca, confiancaNoNome,
} from './emails.ts';

// ── extrair ──────────────────────────────────────────────────────────────────

test('apanha o email no texto e no mailto', () => {
  const html = '<p>Contacte-nos: <a href="mailto:geral@silva.pt">geral@silva.pt</a></p>';
  assert.deepEqual(emailsDoHtml(html).map((e) => e.endereco), ['geral@silva.pt']);
});

test('o mesmo endereço duas vezes conta uma', () => {
  const html = 'geral@silva.pt e também <a href="mailto:GERAL@SILVA.PT">aqui</a>';
  assert.equal(emailsDoHtml(html).length, 1);
});

test('tira o que vem colado ao endereço', () => {
  // No rodapé aparece muita vez "geral@silva.pt." ou entre parênteses.
  assert.deepEqual(emailsDoHtml('escreva para geral@silva.pt.').map((e) => e.endereco), ['geral@silva.pt']);
  assert.deepEqual(emailsDoHtml('(geral@silva.pt)').map((e) => e.endereco), ['geral@silva.pt']);
});

test('o mailto com assunto nao arrasta o assunto', () => {
  const html = '<a href="mailto:geral@silva.pt?subject=Orcamento">pedir</a>';
  assert.deepEqual(emailsDoHtml(html).map((e) => e.endereco), ['geral@silva.pt']);
});

// ── o que nao serve ──────────────────────────────────────────────────────────

test('deita fora o que nao serve para falar com ninguem', () => {
  const html = 'noreply@silva.pt webmaster@silva.pt postmaster@silva.pt geral@silva.pt';
  assert.deepEqual(emailsDoHtml(html).map((e) => e.endereco), ['geral@silva.pt']);
});

test('deita fora exemplos e enderecos de quem fez o site', () => {
  const html = 'seuemail@example.com algo@sentry.wixpress.com geral@silva.pt';
  assert.deepEqual(emailsDoHtml(html).map((e) => e.endereco), ['geral@silva.pt']);
});

test('nao confunde nomes de ficheiro com emails', () => {
  // "logo@2x.png" tem a forma de um email e nao e um.
  const html = '<img src="logo@2x.png"><img src="banner@3x.jpeg"> geral@silva.pt';
  assert.deepEqual(emailsDoHtml(html).map((e) => e.endereco), ['geral@silva.pt']);
});

// ── a distincao que o RGPD obriga ────────────────────────────────────────────

test('separa a caixa da empresa da caixa de uma pessoa', () => {
  // "geral@" e a empresa; "joao.silva@" e uma pessoa, e isso e dado pessoal.
  const r = emailsDoHtml('joao.silva@silva.pt geral@silva.pt', 'https://silva.pt');
  assert.equal(r.find((e) => e.endereco === 'geral@silva.pt')?.tipo, 'geral');
  assert.equal(r.find((e) => e.endereco === 'joao.silva@silva.pt')?.tipo, 'pessoal');
});

test('a caixa da empresa vem sempre a frente de uma pessoa', () => {
  // Quem escolher o primeiro da lista escolhe bem sem ter de pensar nisto.
  const r = emailsDoHtml('joao.silva@silva.pt geral@silva.pt', 'https://silva.pt');
  assert.equal(r[0].endereco, 'geral@silva.pt');
});

test('entre caixas da empresa, ganha quem pode dizer que sim', () => {
  // Estamos a oferecer trabalho: "comercial@" e quem o quer, "apoio@" trata de queixas.
  // Sem esta ordem o desempate era alfabetico — uma decisao que ninguem tomou.
  const r = emailsDoHtml('apoio@silva.pt geral@silva.pt comercial@silva.pt', 'https://silva.pt');
  assert.deepEqual(r.map((e) => e.endereco), [
    'comercial@silva.pt', 'geral@silva.pt', 'apoio@silva.pt',
  ]);
});

test('conhece as caixas que as transportadoras usam', () => {
  for (const caixa of ['transportes', 'logistica', 'trafego', 'expedicao', 'encomendas', 'comercial']) {
    const r = emailsDoHtml(`${caixa}@silva.pt`, 'https://silva.pt');
    assert.equal(r[0]?.tipo, 'geral', `${caixa}@ devia contar como caixa da empresa`);
  }
});

test('um numero no fim nao faz da caixa uma pessoa', () => {
  assert.equal(emailsDoHtml('geral2@silva.pt')[0].tipo, 'geral');
});

// ── o domínio ────────────────────────────────────────────────────────────────

test('sabe qual e o dominio do site', () => {
  assert.equal(dominioDoSite('https://www.silva.pt/contactos'), 'silva.pt');
  assert.equal(dominioDoSite('silva.pt'), 'silva.pt');
  assert.equal(dominioDoSite(''), '');
});

test('distingue o email do dominio do site de um gmail qualquer', () => {
  // Um gmail numa pagina e quase sempre de outra pessoa — do contabilista, de um
  // parceiro, de quem fez o site.
  const r = emailsDoHtml('geral@silva.pt outra.empresa@gmail.com', 'https://silva.pt');
  assert.equal(r.find((e) => e.endereco === 'geral@silva.pt')?.doDominio, true);
  assert.equal(r.find((e) => e.endereco === 'outra.empresa@gmail.com')?.doDominio, false);
});

test('a caixa da empresa no dominio dela ganha a tudo', () => {
  const r = emailsDoHtml('info@gmail.com pedro@silva.pt geral@silva.pt', 'https://silva.pt');
  assert.equal(r[0].endereco, 'geral@silva.pt');
});

// ── onde procurar ────────────────────────────────────────────────────────────

test('as paginas a tentar comecam pela inicial', () => {
  // Muitas transportadoras poem o contacto no rodape de todas as paginas.
  const p = paginasDeContacto('https://silva.pt');
  assert.equal(p[0], 'https://silva.pt');
  assert.ok(p.includes('https://silva.pt/contactos'));
});

test('um site sem esquema recebe https', () => {
  assert.equal(paginasDeContacto('silva.pt')[0], 'https://silva.pt');
});

test('a barra a mais no fim nao duplica', () => {
  assert.equal(paginasDeContacto('https://silva.pt/')[1], 'https://silva.pt/contactos');
});

test('sem site, nao ha onde procurar', () => {
  assert.deepEqual(paginasDeContacto(''), []);
});

test('para de procurar quando tem a caixa da empresa', () => {
  // Nao vale a pena puxar cinco paginas de um site alheio para confirmar o que ja se sabe.
  assert.equal(jaChega(emailsDoHtml('geral@silva.pt', 'https://silva.pt')), true);
  assert.equal(jaChega(emailsDoHtml('joao@silva.pt', 'https://silva.pt')), false);
  assert.equal(jaChega(emailsDoHtml('geral@outra.pt', 'https://silva.pt')), false);
  assert.equal(jaChega([]), false);
});

// ── o mundo real ─────────────────────────────────────────────────────────────

test('um rodape de transportadora a serio', () => {
  const html = `
    <footer>
      <p>Transportes Silva &amp; Filhos, Lda.</p>
      <p>Tel: 219 000 000 · <a href="mailto:geral@silvatransportes.pt">geral@silvatransportes.pt</a></p>
      <p>Comercial: comercial@silvatransportes.pt</p>
      <p>Gerente: antonio.silva@silvatransportes.pt</p>
      <small>Site por <a href="mailto:info@agenciaweb.pt">Agência Web</a></small>
    </footer>`;
  const r = emailsDoHtml(html, 'https://www.silvatransportes.pt');
  // "comercial@" a frente de "geral@" de proposito: e a secretaria que quer trabalho.
  assert.equal(r[0].endereco, 'comercial@silvatransportes.pt');
  assert.equal(r[1].endereco, 'geral@silvatransportes.pt');
  // O da agência é uma caixa geral, mas noutro domínio: fica atrás do que é da casa.
  const agencia = r.findIndex((e) => e.endereco === 'info@agenciaweb.pt');
  const gerente = r.findIndex((e) => e.endereco === 'antonio.silva@silvatransportes.pt');
  assert.ok(agencia > 1, 'o email da agência não devia vir à frente');
  assert.equal(r[gerente].tipo, 'pessoal');
});

test('html sem email nenhum devolve lista vazia', () => {
  assert.deepEqual(emailsDoHtml('<p>Ligue-nos: 219 000 000</p>'), []);
  assert.deepEqual(emailsDoHtml(''), []);
});

// ── seguir as ligacoes em vez de adivinhar caminhos ──────────────────────────

test('encontra a ligacao para os contactos no menu', () => {
  // Adivinhar "/contactos" falha em metade dos sites: uns usam "/pt/contactos", outros
  // "/contact-us". Seguir o que o site mostra e o que uma pessoa faria.
  const html = '<nav><a href="/pt/contactos">Contactos</a><a href="/pt/frota">Frota</a></nav>';
  assert.deepEqual(ligacoesDeContacto(html, 'https://silva.pt'), ['https://silva.pt/pt/contactos']);
});

test('o endereco vale mais do que o texto do menu', () => {
  const html = '<a href="/pt/contact-us">Fale connosco</a><a href="/x">Contactos</a>';
  const r = ligacoesDeContacto(html, 'https://silva.pt');
  assert.equal(r[0], 'https://silva.pt/pt/contact-us');
});

test('nao sai do dominio', () => {
  // Uma ligacao para o Facebook ou para quem fez o site nao leva ao email de ninguem.
  const html = '<a href="https://facebook.com/contact">Contacto</a><a href="/contactos">Contactos</a>';
  assert.deepEqual(ligacoesDeContacto(html, 'https://silva.pt'), ['https://silva.pt/contactos']);
});

test('ignora mailto, tel e javascript', () => {
  const html = '<a href="mailto:geral@silva.pt">Contacto</a><a href="tel:219000000">Contacto</a>';
  assert.deepEqual(ligacoesDeContacto(html, 'https://silva.pt'), []);
});

test('a mesma pagina duas vezes conta uma', () => {
  const html = '<a href="/contactos">Contactos</a><a href="/contactos/">Contacte-nos</a>';
  assert.equal(ligacoesDeContacto(html, 'https://silva.pt').length, 1);
});

test('sem ligacoes de contacto, devolve vazio', () => {
  assert.deepEqual(ligacoesDeContacto('<a href="/frota">Frota</a>', 'https://silva.pt'), []);
  assert.deepEqual(ligacoesDeContacto('', 'https://silva.pt'), []);
  assert.deepEqual(ligacoesDeContacto('<a href="/contactos">x</a>', ''), []);
});

// ── desconfiar do que o Google devolve ───────────────────────────────────────

test('reconhece o mesmo nome escrito de duas maneiras', () => {
  assert.equal(confiancaNoNome('TORRESTIR - TRANSPORTES, LDA', 'Torrestir'), 'confere');
  assert.equal(confiancaNoNome('ALENEXPRESSO , UNIPESSOAL LDA', 'AlenExpresso'), 'confere');
  assert.equal(confiancaNoNome('ALFREDO SIMOES NASCIMENTO-TRANSPORTES MERCADORIAS',
    'Alfredo Simões Nascimento - Transportes Mercadorias, Lda.'), 'confere');
});

test('nao afirma que confere quando o Google trocou de empresa', () => {
  // Duas de cinco, numa amostra real da lista do IMT. O telefone vinha, e era de outra
  // pessoa. Nenhuma das duas pode passar como "confere".
  for (const [nosso, google] of [
    ['Alcateia Resiliente - Unipessoal, Lda', 'Alcateia de Heróis'],
    ['AMBIENTE EM MOVIMENTO, UNIPESSOAL, LDA', 'Ambiente-móveis E Decorações'],
  ]) {
    assert.notEqual(confiancaNoNome(nosso, google), 'confere', `${nosso} vs ${google}`);
  }
});

test('sem nome do Google, pede-se para confirmar', () => {
  assert.equal(confiancaNoNome('Silva, Lda', ''), 'confirme');
});

test('nomes sem nada em comum sao suspeitos', () => {
  assert.equal(confiancaNoNome('Transportes Silva, Lda', 'Padaria Costa'), 'suspeito');
});

test('a forma juridica nao faz dois nomes parecidos', () => {
  // Se "lda" e "transportes" contassem, duas transportadoras quaisquer pareciam-se.
  assert.equal(parecenca('Transportes Silva, Lda', 'Transportes Costa, Lda'), 0);
  assert.equal(parecenca('Silva Unipessoal Lda', 'Costa Unipessoal Lda'), 0);
});

test('nomes iguais dao 1', () => {
  assert.equal(parecenca('Silva & Filhos', 'Silva e Filhos'), 1);
});

test('um nome vazio nao se parece com nada', () => {
  assert.equal(parecenca('', 'Silva'), 0);
  assert.equal(parecenca('Silva', ''), 0);
  assert.equal(parecenca('Lda', 'Lda'), 0);
});
