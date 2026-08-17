// Standard ray-casting point-in-polygon test -- used by the Customer
// Map's "Draw Area" tool (app/(platform)/map/MapClient.tsx) to count
// how many customers/door-hangers/leads fall inside a boundary the user
// draws by clicking points on the map. Pure and dependency-free
// (no Leaflet types) so it's easy to unit test on its own, same
// reasoning as lib/shiftHours.ts.
//
// Points and polygon vertices are both [lat, lng] tuples -- the axis
// labels don't matter to the math (it works the same as [x, y]), as
// long as every point passed in uses the same order consistently, which
// they do throughout the map code (Leaflet's own [lat, lng] convention).
export type LatLngTuple = [number, number];

export function isPointInPolygon(
  point: LatLngTuple,
  polygon: LatLngTuple[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
