import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

// clientPromise is null only during build (no MONGODB_URI). At runtime it is
// created eagerly so the connection is established before the first request.
let clientPromise: Promise<MongoClient> | null = null;

if (uri) {
  if (process.env.NODE_ENV === 'development') {
    const g = global as any;
    if (!g._mongoClientPromise) {
      g._mongoClientPromise = new MongoClient(uri, { useUnifiedTopology: true } as any).connect();
    }
    clientPromise = g._mongoClientPromise;
  } else {
    clientPromise = new MongoClient(uri, { useUnifiedTopology: true } as any).connect();
  }
}

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  if (!clientPromise) throw new Error('MONGODB_URI is not set');
  const c = await clientPromise;
  return c.db(dbName);
}
