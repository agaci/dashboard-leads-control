import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * Resolve, em node puro, os especificadores que o bundler do Next resolve sozinho.
 *
 * Duas coisas, e só estas:
 *
 *   `@/lib/x`   →  <raiz do projecto>/lib/x     (o alias do tsconfig)
 *   `./x`       →  ./x.ts, ./x.tsx ou ./x/index.ts
 *   `mongodb`   →  scripts/shim-mongodb.mjs     (exportacoes nomeadas de um pacote CJS)
 *
 * **Para que serve.** Os módulos puros de lib/crm testam-se com `npm test` sem isto. O
 * que não se conseguia testar de todo era a camada que fala com o Mongo — `listarParceiros`,
 * `gravarRegisto` — porque importa módulos pelo alias e sem extensão, e o node recusa-se
 * a adivinhar. Sem isto, verificar uma consulta contra a base de dados obrigava a copiar
 * o que ela faz para o script de teste, que é testar a cópia e não o código.
 *
 * Só para scripts de verificação. Não entra no pacote da aplicação, que passa pelo
 * bundler e não precisa disto.
 *
 *   node --experimental-strip-types --import ./scripts/registar-loader.mjs o-teste.mjs
 */

const RAIZ = process.cwd();
const TENTATIVAS = ['.ts', '.tsx', '/index.ts', '.js'];

export async function resolve(especificador, contexto, seguinte) {
  // Ver scripts/shim-mongodb.mjs: o driver 3.x nao expoe nomes que o node consiga ler.
  if (especificador === 'mongodb') {
    return { url: pathToFileURL(path.join(RAIZ, 'scripts/shim-mongodb.mjs')).href, shortCircuit: true };
  }

  const alvo = especificador.startsWith('@/')
    ? pathToFileURL(path.join(RAIZ, especificador.slice(2))).href
    : especificador;

  try {
    return await seguinte(alvo, contexto);
  } catch (erro) {
    // Já tem extensão, ou é um pacote: o erro é outro e não se disfarça.
    if (erro?.code !== 'ERR_MODULE_NOT_FOUND' || /\.[a-z]+$/i.test(alvo)) throw erro;

    for (const ext of TENTATIVAS) {
      try {
        return await seguinte(alvo + ext, contexto);
      } catch { /* a seguinte */ }
    }
    throw erro;
  }
}
