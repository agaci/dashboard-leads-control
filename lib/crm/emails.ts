/**
 * Encontrar o email de uma empresa no site dela.
 *
 * O Google Places dá o telefone e o endereço do site, e nunca o email — não é
 * configuração, é o que a API devolve. O email está no site, e é dali que se tira.
 *
 * **A ordem de preferência não é cosmética.** Num site de transportadora aparecem dois
 * tipos de endereço, e são coisas diferentes à luz do RGPD:
 *
 *   geral@, info@, comercial@   a caixa da empresa. Não é dado pessoal.
 *   joao.silva@empresa.pt       é dado pessoal de uma pessoa concreta.
 *
 * Escrever para o primeiro é escrever a uma empresa; escrever para o segundo é tratar
 * dados de alguém. Preferir o genérico é de graça e evita a conversa toda — por isso a
 * classificação está aqui, e não é uma opção que se possa esquecer de ligar.
 *
 * Sem imports de runtime: testa-se sem rede e sem base de dados.
 */

/**
 * Caixas que pertencem à empresa e não a uma pessoa.
 *
 * **A ordem é a de quem lê o que lhe vamos escrever**, e não alfabética. Estamos a
 * oferecer trabalho a uma transportadora: `comercial@` é a secretária que quer trabalho e
 * pode dizer que sim; `geral@` é a porta da frente; `apoio@` é quem trata de reclamações
 * e não decide nada.
 *
 * Sem esta ordem o desempate ficava alfabético — e alfabético é uma decisão que ninguém
 * tomou.
 */
const CAIXAS_GERAIS = [
  // quem quer trabalho
  'comercial', 'vendas', 'sales',
  // a porta da frente
  'geral', 'info', 'informacoes', 'informacao', 'contacto', 'contactos', 'contact',
  'email', 'mail', 'correio', 'empresa', 'hello', 'ola',
  // quem faz o serviço
  'transportes', 'logistica', 'operacoes', 'trafego', 'expedicao', 'encomendas',
  'servicos',
  // quem trata de papéis
  'administracao', 'admin', 'escritorio', 'office',
  // quem trata de queixas, e decide menos
  'apoio', 'suporte', 'support',
];

/**
 * Endereços que não servem para falar com ninguém.
 *
 * Os últimos saem dos marcadores que ficam nos formulários — "o seu email", "nome@..." —
 * e apanhei-os num site a sério: o yourbox.com.pt devolvia `seu@email.com` a seguir ao
 * `info@` verdadeiro. Um exemplo de formulário lido como contacto é uma carta a ninguém.
 */
const LIXO = [
  'noreply', 'no-reply', 'nao-responder', 'naoresponder', 'donotreply',
  'postmaster', 'webmaster', 'hostmaster', 'abuse', 'mailer-daemon',
  'example', 'exemplo', 'test', 'teste', 'seu-email', 'youremail', 'email',
  'seu', 'oseu', 'teu', 'nome', 'utilizador', 'user', 'username', 'emailaddress',
];

/**
 * Domínios que denunciam um exemplo, ou o endereço de quem fez o site.
 *
 * `email.com` e `mail.com` estão aqui por serem o que se escreve num campo de exemplo —
 * "seu@email.com". Quem tem mesmo uma caixa nesses domínios não é uma transportadora com
 * site próprio, e é melhor perder esse caso raro do que escrever para um marcador.
 */
const DOMINIOS_FORA = [
  'example.com', 'example.org', 'exemplo.pt', 'sentry.io', 'wixpress.com',
  'sentry.wixpress.com', 'godaddy.com', 'wordpress.com', 'squarespace.com',
  'email.com', 'mail.com', 'dominio.pt', 'seudominio.pt', 'seusite.pt',
  'empresa.pt', 'suaempresa.pt', 'yourdomain.com', 'yoursite.com',
];

export interface EmailAchado {
  endereco: string;
  /** Caixa da empresa (`geral@`) ou de uma pessoa (`joao.silva@`). */
  tipo: 'geral' | 'pessoal';
  /** Está no mesmo domínio do site? Um `gmail.com` numa página é quase sempre de outro. */
  doDominio: boolean;
  /** Posição na lista das caixas, para o desempate ser escolhido e não alfabético. */
  lugar: number;
}

/** Minúsculas, sem espaços, sem o `mailto:` nem o que venha atrás dele. */
function limpar(bruto: string): string {
  return String(bruto ?? '')
    .replace(/^mailto:/i, '')
    .split('?')[0]
    .trim()
    .toLowerCase()
    // Alguns sites escrevem o endereço com entidades ou com pontuação colada.
    .replace(/&#64;|\s*\(at\)\s*|\s+at\s+/gi, '@')
    .replace(/[.,;:)\]}>'"]+$/, '');
}

const RE_EMAIL = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;

function eLixo(local: string, dominio: string): boolean {
  if (LIXO.includes(local)) return true;
  if (DOMINIOS_FORA.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return true;
  // Ficheiros que a expressão apanha por engano: "logo@2x.png", "imagem@3x.jpg".
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(dominio)) return true;
  return false;
}

/** Em que lugar da lista fica esta caixa, ou -1 se não for uma caixa da empresa. */
function lugarDaCaixa(local: string): number {
  const semNumeros = local.replace(/\d+$/, '');
  const i = CAIXAS_GERAIS.indexOf(local);
  return i >= 0 ? i : CAIXAS_GERAIS.indexOf(semNumeros);
}

/** O domínio de um endereço de site, sem `www.` nem porta. */
export function dominioDoSite(url: string): string {
  const m = /^(?:https?:\/\/)?(?:www\.)?([^/:?#]+)/i.exec(String(url ?? '').trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * Todos os endereços de email que aparecem num pedaço de HTML, ordenados pelo que
 * interessa primeiro.
 *
 * A ordem: caixa da empresa no domínio dela, depois caixa da empresa noutro domínio,
 * depois pessoa no domínio dela, e só então o resto. Quem escolher o primeiro da lista
 * escolhe bem sem ter de pensar nisto.
 */
export function emailsDoHtml(html: string, site = ''): EmailAchado[] {
  const dominioSite = dominioDoSite(site);
  const vistos = new Map<string, EmailAchado>();

  for (const bruto of String(html ?? '').match(RE_EMAIL) ?? []) {
    const endereco = limpar(bruto);
    const [local, dominio] = endereco.split('@');
    if (!local || !dominio || !dominio.includes('.')) continue;
    if (eLixo(local, dominio)) continue;
    if (vistos.has(endereco)) continue;

    const lugar = lugarDaCaixa(local);
    vistos.set(endereco, {
      endereco,
      tipo: lugar >= 0 ? 'geral' : 'pessoal',
      doDominio: !!dominioSite && (dominio === dominioSite || dominio.endsWith(`.${dominioSite}`)),
      lugar: lugar >= 0 ? lugar : CAIXAS_GERAIS.length,
    });
  }

  // Primeiro o que é da casa, depois o que é da empresa e não de uma pessoa, e só então
  // qual das caixas. A ordem alfabética fica para o fim, onde já não decide nada.
  const peso = (e: EmailAchado) => (e.doDominio ? 0 : 4) + (e.tipo === 'geral' ? 0 : 2);
  return [...vistos.values()].sort((a, b) => (
    peso(a) - peso(b) || a.lugar - b.lugar || a.endereco.localeCompare(b.endereco)
  ));
}

/**
 * As páginas onde um email costuma estar, por ordem de probabilidade.
 *
 * A página inicial primeiro porque muitas transportadoras põem o contacto no rodapé de
 * todas as páginas; as de contactos a seguir, que é onde está quando não está no rodapé.
 * Pára-se assim que apareça uma caixa da empresa — não vale a pena puxar cinco páginas
 * de um site alheio para confirmar o que já se sabe.
 */
export function paginasDeContacto(site: string): string[] {
  const base = String(site ?? '').trim().replace(/\/+$/, '');
  if (!base) return [];
  const comEsquema = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  return [
    comEsquema,
    `${comEsquema}/contactos`,
    `${comEsquema}/contacto`,
    `${comEsquema}/contact`,
    `${comEsquema}/contacts`,
    `${comEsquema}/quem-somos`,
  ];
}

/** Já chega de procurar? Sim, quando há uma caixa da empresa no domínio dela. */
export function jaChega(achados: EmailAchado[]): boolean {
  return achados.some((e) => e.tipo === 'geral' && e.doDominio);
}

/**
 * As ligações da página que parecem levar aos contactos.
 *
 * Adivinhar caminhos — `/contactos`, `/contacto` — falha em metade dos sites: uns usam
 * `/pt/contactos`, outros `/contact-us`, outros põem tudo numa página só. Seguir as
 * ligações que o site mostra é o que uma pessoa faria, e acerta onde o palpite falha.
 *
 * Só do mesmo domínio: uma ligação para o Facebook ou para quem fez o site não leva ao
 * email de ninguém que interesse.
 */
export function ligacoesDeContacto(html: string, site: string): string[] {
  const dominio = dominioDoSite(site);
  if (!dominio) return [];

  const base = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const PALAVRAS = /contact|contato|contacte|fale|fale-connosco|quem-somos|empresa|sobre|about|onde-estamos/i;

  const achadas = new Map<string, number>();
  for (const m of String(html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].trim();
    const texto = m[2].replace(/<[^>]+>/g, ' ').trim();
    if (!href || /^(mailto|tel|javascript):/i.test(href)) continue;

    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (dominioDoSite(url.hostname) !== dominio) continue;

    // O endereço vale mais do que o texto: um menu diz "Contactos" em vinte sítios, mas
    // só um deles tem "contact" no caminho.
    const peso = (PALAVRAS.test(url.pathname) ? 0 : 2) + (PALAVRAS.test(texto) ? 0 : 1);
    if (peso >= 3) continue;

    const limpa = `${url.origin}${url.pathname}`.replace(/\/+$/, '') || url.origin;
    if (!achadas.has(limpa) || achadas.get(limpa)! > peso) achadas.set(limpa, peso);
  }

  return [...achadas.entries()].sort((a, b) => a[1] - b[1]).map(([u]) => u).slice(0, 4);
}

/**
 * Quanto é que dois nomes de empresa se parecem, de 0 a 1.
 *
 * **Existe porque o Google acerta na empresa errada com frequência.** Numa amostra de
 * cinco empresas reais da lista do IMT, encontrou quatro — e duas eram outra coisa:
 * "Alcateia Resiliente, Lda" devolveu "Alcateia de Heróis", e "Ambiente em Movimento,
 * Lda" devolveu "Ambiente-móveis e Decorações". O telefone vinha, e era de outra pessoa.
 *
 * Mostrar o nome ao lado não chega: quem está a promover trinta empresas não lê com
 * atenção à trigésima. O sistema tem de dizer que desconfia.
 *
 * Compara as palavras com peso, e não letra a letra: o que distingue uma transportadora
 * de outra é o nome próprio, não a forma jurídica. Por isso "lda", "unipessoal",
 * "transportes" e companhia não contam — se contassem, duas transportadoras quaisquer
 * pareciam-se por serem ambas transportadoras.
 */
const PALAVRAS_VAZIAS = new Set([
  'lda', 'ldª', 'limitada', 'sa', 's', 'a', 'unipessoal', 'sociedade', 'sociedades',
  'e', 'de', 'da', 'do', 'dos', 'das', 'em', 'o', 'os', 'as', 'por', 'com',
  'transportes', 'transporte', 'transportadora', 'logistica', 'logistico',
  'mercadorias', 'comercio', 'servicos', 'servico', 'empresa', 'grupo',
  'nacional', 'internacional', 'international', 'lisboa', 'porto',
]);

function palavrasUteis(nome: string): string[] {
  return String(nome ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p));
}

export function parecenca(a: string, b: string): number {
  const pa = palavrasUteis(a);
  const pb = new Set(palavrasUteis(b));
  if (!pa.length || !pb.size) return 0;

  // Quantas das palavras que importam no primeiro nome aparecem no segundo. Não é
  // simétrico de propósito: o Google costuma abreviar, e um nome curto que esteja todo
  // contido no comprido é o mesmo nome.
  const encontradas = pa.filter((p) => pb.has(p)).length;
  return encontradas / pa.length;
}

/**
 * O que se diz à operadora sobre o nome que o Google devolveu.
 *
 * Três bandas e não um limiar cego, porque há um meio-termo verdadeiro: o Google abrevia
 * nomes com frequência, e "abreviou" e "trocou de empresa" parecem-se de longe.
 *
 * Nas cinco empresas reais que testei, as duas trocas deram 0.50 e as três certas deram
 * 1.00. A separação foi limpa — mas cinco casos não são amostra, e por isso o meio não
 * afirma nada: pede que se olhe.
 */
export type ConfiancaNoNome = 'confere' | 'confirme' | 'suspeito';

export function confiancaNoNome(nomeNosso: string, nomeDoGoogle: string): ConfiancaNoNome {
  if (!nomeDoGoogle?.trim()) return 'confirme';
  const p = parecenca(nomeNosso, nomeDoGoogle);
  if (p >= 0.8) return 'confere';
  if (p >= 0.5) return 'confirme';
  return 'suspeito';
}
