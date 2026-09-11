import { createRequire } from 'node:module';

/**
 * O driver do Mongo, com exportacoes nomeadas.
 *
 * A versao 3.x e CommonJS e monta as exportacoes em tempo de execucao, o que o node nao
 * consegue ler estaticamente: `import { ObjectId } from 'mongodb'` rebenta em node puro
 * apesar de funcionar no bundler, que faz esta mesma ponte. E a unica coisa que faltava
 * para os modulos que falam com a base de dados serem carregaveis num script.
 */
const require = createRequire(import.meta.url);
const driver = require('mongodb');

export const { MongoClient, ObjectId, Binary, Long, Timestamp, Decimal128 } = driver;
export default driver;
