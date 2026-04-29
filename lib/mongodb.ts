import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

// useUnifiedTopology é obrigatório no driver v3.x para o novo motor de topologia
const MONGO_OPTIONS = { useUnifiedTopology: true } as any;

function createClientPromise(): Promise<MongoClient> {
  const p = new MongoClient(uri!, MONGO_OPTIONS).connect();
  // Quando a topology fechar (ex: restart), limpar cache para forçar reconexão
  p.then((client) => {
    client.on('topologyClosed', () => {
      const g = global as any;
      if (g._mongoClientPromise === p) delete g._mongoClientPromise;
    });
  }).catch(() => {
    const g = global as any;
    if (g._mongoClientPromise === p) delete g._mongoClientPromise;
  });
  return p;
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  if (!uri) throw new Error('MONGODB_URI is not set');
  const g = global as any;
  if (!g._mongoClientPromise) g._mongoClientPromise = createClientPromise();
  try {
    const client: MongoClient = await g._mongoClientPromise;
    return client.db(dbName);
  } catch {
    // Promise rejeitada — reconectar
    delete g._mongoClientPromise;
    g._mongoClientPromise = createClientPromise();
    const client: MongoClient = await g._mongoClientPromise;
    return client.db(dbName);
  }
}
