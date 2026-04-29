import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

const MONGO_OPTIONS = {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  minPoolSize: 1,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  keepAlive: true,
  keepAliveInitialDelay: 300_000,
} as any;

// Key versioned so hot-reload in dev never reuses a stale promise from old code
const CACHE_KEY = '__mongoClientPromise_v3';

function buildClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(uri!, MONGO_OPTIONS);
  return client.connect().then(c => {
    c.on('topologyClosed', () => {
      const g = global as any;
      delete g[CACHE_KEY];
    });
    return c;
  }).catch(err => {
    const g = global as any;
    delete g[CACHE_KEY];
    throw err;
  });
}

function getOrCreatePromise(): Promise<MongoClient> {
  const g = global as any;
  if (!g[CACHE_KEY]) g[CACHE_KEY] = buildClientPromise();
  return g[CACHE_KEY];
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  if (!uri) throw new Error('MONGODB_URI is not set');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await getOrCreatePromise();
      // Ping to verify the connection is still alive before returning
      await client.db('admin').command({ ping: 1 });
      return client.db(dbName);
    } catch (err: any) {
      // Clear stale promise so the next attempt creates a fresh connection
      const g = global as any;
      delete g[CACHE_KEY];
      if (attempt === 1) throw err;
    }
  }

  // Unreachable but TypeScript needs it
  throw new Error('MongoDB: unexpected getDb exit');
}
