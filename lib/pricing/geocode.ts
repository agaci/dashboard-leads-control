import { getDb } from '@/lib/mongodb';

export async function geocode(address: string): Promise<{ lat: number; lng: number }> {
  // Tentar cache pCodes antes de chamar a API
  const postalMatch = address.match(/\b(\d{4}-\d{3})\b/);
  if (postalMatch) {
    try {
      const db = await getDb();
      const cached = await db.collection('pCodes').findOne({ code: postalMatch[1] });
      if (cached?.lat && cached?.lng) {
        return { lat: cached.lat, lng: cached.lng };
      }
    } catch {
      // cache miss — segue para API
    }
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}&region=pt&language=pt`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Geocode failed: ${data.status} — "${address}"`);

  const { lat, lng } = data.results[0].geometry.location;

  // Guardar em cache se tinha código postal
  if (postalMatch) {
    try {
      const db = await getDb();
      await db.collection('pCodes').updateOne(
        { code: postalMatch[1] },
        { $set: { code: postalMatch[1], lat, lng, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch {
      // falha silenciosa — cache não crítica
    }
  }

  return { lat, lng };
}
