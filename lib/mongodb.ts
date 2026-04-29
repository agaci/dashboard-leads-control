import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

// Cachear o cliente no global para sobreviver a recarregamentos de módulo
// (hot-reload em dev, restarts em prod após deploy)
function getClientPromise(): Promise<MongoClient> | null {
  if (!uri) return null;
  const g = global as any;
  if (!g._mongoClientPromise) {
    g._mongoClientPromise = new MongoClient(uri).connect();
  }
  return g._mongoClientPromise;
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  let promise = getClientPromise();
  if (!promise) throw new Error('MONGODB_URI is not set');
  try {
    const c = await promise;
    return c.db(dbName);
  } catch {
    // Pool destruída (ex: restart do servidor) — forçar reconexão
    const g = global as any;
    g._mongoClientPromise = new MongoClient(uri!).connect();
    promise = g._mongoClientPromise;
    const c = await promise!;
    return c.db(dbName);
  }
}
