import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI!;
const options = { useNewUrlParser: true, useUnifiedTopology: true };

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!(global as any)._mongoClientPromise) {
    client = new MongoClient(uri, options);
    (global as any)._mongoClientPromise = client.connect();
  }
  clientPromise = (global as any)._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;

export async function getDb(dbName = process.env.MONGODB_DB ?? 'weby'): Promise<Db> {
  const c = await clientPromise;
  return c.db(dbName);
}
