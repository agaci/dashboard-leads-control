export interface DistanceMatrixResult {
  distanciaFinal: number; // km
  duracaoTotal: number;   // horas
}

// Recebe array de endereços ordenados [milestone, ...pontos, milestone]
// Soma a diagonal: d(0→1) + d(1→2) + ... + d(n-1→n)
export async function getDistanceMatrix(addresses: string[]): Promise<DistanceMatrixResult> {
  if (addresses.length < 2) throw new Error('getDistanceMatrix requer pelo menos 2 endereços');

  const origins = addresses.slice(0, -1).map(encodeURIComponent).join('|');
  const destinations = addresses.slice(1).map(encodeURIComponent).join('|');

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origins}` +
    `&destinations=${destinations}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}` +
    `&region=pt&language=pt&units=metric`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK') throw new Error(`DistanceMatrix failed: ${data.status}`);

  let totalMeters = 0;
  let totalSeconds = 0;

  // Ler diagonal: row i → element i
  for (let i = 0; i < addresses.length - 1; i++) {
    const element = data.rows[i]?.elements[i];
    if (!element || element.status !== 'OK') {
      throw new Error(`DistanceMatrix element [${i}][${i}] status: ${element?.status}`);
    }
    totalMeters += element.distance.value;
    totalSeconds += element.duration.value;
  }

  return {
    distanciaFinal: Math.round((totalMeters / 1000) * 10) / 10,
    duracaoTotal: Math.round((totalSeconds / 3600) * 10) / 10,
  };
}
