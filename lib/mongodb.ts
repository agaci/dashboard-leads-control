import { MongoClient, Db } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

function createClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');
  return new MongoClient(uri).connect();
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    const g = global as any;
    if (!g._mongoClientPromise) {
      g._mongoClientPromise = createClientPromise();
    }
    return g._mongoClientPromise;
  }

  if (!clientPromise) {
    clientPromise = createClientPromise();
  }
  return clientPromise;
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  try {
    const c = await getClientPromise();
    return c.db(dbName);
  } catch {
    // Pool destroyed or connection failed — reset and retry once
    clientPromise = null;
    if (process.env.NODE_ENV === 'development') {
      (global as any)._mongoClientPromise = null;
    }
    const c = await getClientPromise();
    return c.db(dbName);
  }
}
