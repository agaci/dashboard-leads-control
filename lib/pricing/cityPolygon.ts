// Ray casting algorithm — point-in-polygon
// polygon: array de [lat, lng]
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// poligonos da BD: array onde [0] = Lisboa, [1] = Porto
export function classifyPoints(
  points: { lat: number; lng: number }[],
  poligonos: [number, number][][]
): { LX: number; PT: number; GLX_GPT: number } {
  let LX = 0, PT = 0, GLX_GPT = 0;
  for (const p of points) {
    if (pointInPolygon(p.lat, p.lng, poligonos[0])) LX++;
    else if (pointInPolygon(p.lat, p.lng, poligonos[1])) PT++;
    else GLX_GPT++;
  }
  return { LX, PT, GLX_GPT };
}
