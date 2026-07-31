// Straight-line ("as the crow flies") distance between two coordinates,
// via the haversine formula. This is NOT actual driving distance — a
// real routing/directions API (Google Directions, Mapbox, etc.) would
// need its own API key and billing setup that this app doesn't have
// configured. My Day uses this for a rough "how spread out is today"
// sense (miles to next stop, total for the day), always labeled as an
// estimate rather than presented as a real route distance.
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_MILES = 3958.8;

  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}
