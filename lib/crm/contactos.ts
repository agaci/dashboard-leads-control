import {
  confiancaNoNome, emailsDoHtml, jaChega, ligacoesDeContacto,
  type ConfiancaNoNome, type EmailAchado,
} from './emails';

/**
 * Procurar por onde falar com uma empresa da lista do IMT.
 *
 * A lista traz nome, morada e alvará, e nunca um contacto. Sem telefone nem email não se
 * pode criar um parceiro — e é isso que este módulo vai buscar, em dois passos:
 *
 *   Google Places  ->  telefone e endereço do site
 *   o site         ->  email
 *
 * **Sugere, nunca grava.** O resultado vai para os campos do formulário e a operadora
 * olha antes de criar a ficha. O Places acerta na empresa errada quando há nomes
 * parecidos, e um telefone errado numa ficha é um telefonema a quem não devia.
 *
 * **Falha em silêncio é proibido.** Cada passo diz o que correu mal — sem chave, chave
 * restrita a outro IP, quota esgotada, site em baixo — porque daqui a seis meses ninguém
 * se lembra desta conversa e o sintoma vai ser "o botão deixou de funcionar".
 */

const PLACES = 'https://places.googleapis.com/v1/places:searchText';

/** Um pedido a um site alheio não pode prender o nosso durante um minuto. */
const ESPERA_MS = 12_000;

/** Quantas páginas do site se puxam, no máximo. É o site de outra pessoa. */
const MAX_PAGINAS = 4;

const AGENTE = 'Mozilla/5.0 (compatible; YourBoxBot/1.0; +https://yourbox.com.pt)';

export interface Contactos {
  telefone: string | null;
  site: string | null;
  /** O nome como o Google o conhece. Serve para a operadora ver se é mesmo a empresa. */
  nomeNoGoogle: string | null;
  /** A morada como o Google a conhece, pela mesma razão. */
  moradaNoGoogle: string | null;
  emails: EmailAchado[];
  /**
   * Se o nome que o Google devolveu é mesmo o desta empresa.
   *
   * Numa amostra de cinco empresas reais do IMT, o Google encontrou quatro — e **duas
   * eram outra coisa**. "Alcateia Resiliente, Lda" deu "Alcateia de Heróis"; "Ambiente
   * em Movimento" deu "Ambiente-móveis e Decorações". O telefone vinha, e era de outra
   * pessoa. Mostrar o nome ao lado não chega: quem promove trinta empresas não lê com
   * atenção à trigésima.
   */
  confianca: ConfiancaNoNome | null;
  /** O que correu bem e o que não. Uma linha por passo. */
  notas: string[];
}

function vazio(): Contactos {
  return {
    telefone: null, site: null, nomeNoGoogle: null, moradaNoGoogle: null,
    emails: [], confianca: null, notas: [],
  };
}

/**
 * Porque é que o Google recusou, e o que fazer a seguir.
 *
 * **Lê os campos que o Google dá para isto** — `error.status` e o `reason` dos detalhes —
 * e não procura palavras no corpo da resposta. A primeira versão fazia isso, com
 * `/IP|referer/i`, e dizia a toda a gente que a chave estava restrita a um IP errado.
 * O que ela apanhava era o "ip" de "descr**ip**tion", que vem em todas as respostas de
 * erro do Google. Uma mensagem confiante e errada é pior do que nenhuma: mandou-se uma
 * pessoa mexer em restrições que não existiam enquanto a causa real — a API por activar —
 * ficava escrita à frente dela, por ler.
 */
async function explicarFalha(r: Response): Promise<string> {
  const corpo: any = await r.json().catch(() => null);
  const erro = corpo?.error;
  const razao = erro?.details?.find((d: any) => d?.reason)?.reason ?? '';
  const url = erro?.details
    ?.flatMap((d: any) => d?.links ?? [])
    ?.find((l: any) => l?.url)?.url ?? erro?.details?.find((d: any) => d?.metadata?.activationUrl)?.metadata?.activationUrl;

  if (razao === 'SERVICE_DISABLED') {
    return `A Places API (New) não está activada neste projecto do Google Cloud.${url ? ` Active-a em ${url}` : ''}`;
  }
  if (razao === 'API_KEY_HTTP_REFERRER_BLOCKED' || razao === 'API_KEY_IP_ADDRESS_BLOCKED') {
    return 'A chave está restrita e o pedido veio de um sítio que ela não aceita. Reveja as restrições na consola do Google Cloud.';
  }
  if (razao === 'API_KEY_SERVICE_BLOCKED') {
    return 'A chave existe mas não tem a Places API (New) nas APIs permitidas. Acrescente-a nas restrições da chave.';
  }
  if (razao === 'API_KEY_INVALID' || erro?.status === 'UNAUTHENTICATED') {
    return 'A chave não é válida. Confirme o GOOGLE_PLACES_API_KEY no .env.local do servidor.';
  }
  if (razao === 'BILLING_DISABLED') {
    return 'O projecto do Google Cloud não tem facturação activa, e a Places API exige-a.';
  }
  if (r.status === 429 || razao === 'RATE_LIMIT_EXCEEDED') {
    return 'Quota do Places esgotada. Volte mais tarde ou aumente-a na consola.';
  }

  // Desconhecido: passa-se o que o Google disse, em vez de inventar uma explicação.
  const dito = String(erro?.message ?? '').trim();
  return dito
    ? `O Google recusou (${r.status}): ${dito.slice(0, 220)}`
    : `O Places respondeu ${r.status}. Escreva os contactos à mão.`;
}

/**
 * O que o Google Places sabe desta empresa.
 *
 * Um pedido só, e não dois: pedindo os campos do contacto no próprio `searchText`, o
 * telefone e o site vêm no resultado da procura. Dois pedidos custavam o dobro para dar
 * o mesmo.
 */
async function doPlaces(nome: string, morada: string): Promise<Partial<Contactos> & { notas: string[] }> {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  if (!chave) {
    return { notas: ['Sem GOOGLE_PLACES_API_KEY: o telefone e o site têm de ser escritos à mão.'] };
  }

  try {
    const r = await fetch(PLACES, {
      method: 'POST',
      signal: AbortSignal.timeout(ESPERA_MS),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave,
        // Só o que se usa. A máscara decide o preço: pedir campos a mais é pagar a mais.
        'X-Goog-FieldMask': [
          'places.displayName', 'places.formattedAddress',
          'places.nationalPhoneNumber', 'places.websiteUri',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: `${nome} ${morada}`.trim(),
        languageCode: 'pt',
        regionCode: 'PT',
        maxResultCount: 1,
      }),
    });

    if (!r.ok) return { notas: [await explicarFalha(r)] };

    const d: any = await r.json();
    const p = d?.places?.[0];
    if (!p) return { notas: ['O Google não encontrou esta empresa. Escreva os contactos à mão.'] };

    return {
      telefone: p.nationalPhoneNumber ?? null,
      site: p.websiteUri ?? null,
      nomeNoGoogle: p.displayName?.text ?? null,
      moradaNoGoogle: p.formattedAddress ?? null,
      notas: [],
    };
  } catch (err: any) {
    const porque = err?.name === 'TimeoutError' ? 'demorou de mais' : (err?.message ?? 'erro');
    return { notas: [`Não consegui falar com o Google (${porque}). Escreva os contactos à mão.`] };
  }
}

async function puxar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(ESPERA_MS),
      headers: { 'User-Agent': AGENTE, Accept: 'text/html' },
    });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') ?? '';
    if (!tipo.includes('html')) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/**
 * Os emails que o site publica.
 *
 * Começa pela página inicial, porque muitas transportadoras põem o contacto no rodapé de
 * todas as páginas, e só segue as ligações se lá não estiver. Pára assim que apareça uma
 * caixa da empresa: não se puxam cinco páginas de um site alheio para confirmar o que já
 * se sabe.
 */
export async function emailsDoSite(site: string): Promise<{ emails: EmailAchado[]; notas: string[] }> {
  const base = String(site ?? '').trim();
  if (!base) return { emails: [], notas: [] };

  const inicial = await puxar(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  if (!inicial) return { emails: [], notas: ['O site não respondeu, ou não devolveu HTML.'] };

  let achados = emailsDoHtml(inicial, base);
  if (jaChega(achados)) return { emails: achados, notas: [] };

  let puxadas = 1;
  for (const ligacao of ligacoesDeContacto(inicial, base)) {
    if (puxadas >= MAX_PAGINAS) break;
    const html = await puxar(ligacao);
    puxadas++;
    if (!html) continue;
    for (const novo of emailsDoHtml(html, base)) {
      if (!achados.some((a) => a.endereco === novo.endereco)) achados = [...achados, novo];
    }
    if (jaChega(achados)) break;
  }

  // Reordena com tudo junto: um "comercial@" achado na terceira página tem de passar à
  // frente de um "joao@" achado na primeira.
  achados = emailsDoHtml(achados.map((a) => a.endereco).join(' '), base);

  return {
    emails: achados,
    notas: achados.length ? [] : ['O site não publica nenhum email — há sites que só têm formulário.'],
  };
}

/**
 * Tudo o que se consegue saber sobre como falar com esta empresa.
 *
 * `siteConhecido` serve para quando a operadora já sabe o site — aí salta-se o Google e
 * vai-se direito ao email, sem gastar uma chamada paga.
 */
export async function procurarContactos(
  nome: string,
  morada: string,
  siteConhecido?: string,
): Promise<Contactos> {
  const out = vazio();

  if (siteConhecido?.trim()) {
    out.site = siteConhecido.trim();
    out.notas.push('Site dado por si: não se gastou uma consulta ao Google.');
  } else {
    const g = await doPlaces(nome, morada);
    out.telefone = g.telefone ?? null;
    out.site = g.site ?? null;
    out.nomeNoGoogle = g.nomeNoGoogle ?? null;
    out.moradaNoGoogle = g.moradaNoGoogle ?? null;
    out.notas.push(...g.notas);

    if (out.nomeNoGoogle) {
      out.confianca = confiancaNoNome(nome, out.nomeNoGoogle);
      // Quando nao confere, o telefone e o site sao de outra empresa. Ficam a vista para
      // a operadora decidir, mas ela tem de saber disso ANTES de os aceitar.
      if (out.confianca === 'suspeito') {
        out.notas.push(`O Google devolveu "${out.nomeNoGoogle}", que não se parece com esta empresa. O telefone e o site são provavelmente de outra.`);
      } else if (out.confianca === 'confirme') {
        out.notas.push(`O Google devolveu "${out.nomeNoGoogle}". Confirme que é a mesma empresa antes de aceitar o telefone.`);
      }
    }
  }

  if (out.site) {
    const e = await emailsDoSite(out.site);
    out.emails = e.emails;
    out.notas.push(...e.notas);
  } else if (!siteConhecido) {
    out.notas.push('Sem site não há onde procurar o email.');
  }

  return out;
}
