import { MongoClient, Db } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  if (process.env.NODE_ENV === 'development') {
    const g = global as any;
    if (!g._mongoClientPromise) {
      g._mongoClientPromise = new MongoClient(uri).connect();
    }
    clientPromise = g._mongoClientPromise;
  } else {
    clientPromise = new MongoClient(uri).connect();
  }

  return clientPromise!;
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  const c = await getClientPromise();
  return c.db(dbName);
}
