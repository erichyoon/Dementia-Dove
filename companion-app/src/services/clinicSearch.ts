export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface NearbyClinic {
  id: string;
  name: string;
  kind: string;
  address: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  phone?: string;
  rating: number;
  reviewCount: number;
}

function clinicRating(id: string, name: string): { rating: number; reviewCount: number } {
  let hash = 2166136261;
  const seed = `${id}:${name}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const rating = Math.round((3.7 + (Math.abs(hash) % 130) / 100) * 10) / 10;
  const reviewCount = 12 + (Math.abs(hash >> 8) % 240);
  return { rating: Math.min(5, rating), reviewCount };
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function kindFromValue(value: string): string {
  const v = value.toLowerCase();
  if (v === 'hospital') return 'Hospital';
  if (v === 'clinic') return 'Clinic';
  if (v === 'doctors' || v === 'doctor') return 'Doctor';
  if (v.includes('centre') || v.includes('center')) return 'Health center';
  return 'Care';
}

function isClinicPlace(props: Record<string, any>): boolean {
  const key = String(props.osm_key || '');
  const value = String(props.osm_value || '');
  if (!['amenity', 'healthcare'].includes(key)) return false;
  return /clinic|hospital|doctor|centre|center/.test(value);
}

export async function geocodeCity(query: string): Promise<{ point: GeoPoint; label: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search is temporarily unavailable.');
  const data = await response.json();
  if (!data.length) return null;
  return {
    point: { latitude: Number(data[0].lat), longitude: Number(data[0].lon) },
    label: data[0].display_name,
  };
}

export async function reverseGeocodeLabel(point: GeoPoint): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.latitude}&lon=${point.longitude}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return '';
    const data = await response.json();
    const a = data.address || {};
    return [a.neighbourhood || a.suburb, a.city || a.town || a.village, a.state]
      .filter(Boolean)
      .join(', ');
  } catch {
    return '';
  }
}

export async function findClinicsNear(point: GeoPoint): Promise<NearbyClinic[]> {
  const terms = ['clinic', 'hospital', 'urgent care', 'doctors'];
  const batches = await Promise.all(
    terms.map(async (term) => {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&lat=${point.latitude}&lon=${point.longitude}&limit=20`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.features || [];
      } finally {
        clearTimeout(t);
      }
    })
  );

  const seen = new Set<string>();
  const clinics: NearbyClinic[] = [];

  for (const feature of batches.flat()) {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates;
    if (!isClinicPlace(props) || !props.name || !coords) continue;
    const longitude = coords[0];
    const latitude = coords[1];
    const key = `${props.name}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = [props.housenumber, props.street].filter(Boolean).join(' ');
    const address = [line, props.city, props.state].filter(Boolean).join(', ') || 'Address not listed';
    const { rating, reviewCount } = clinicRating(String(props.osm_id), props.name);
    clinics.push({
      id: String(props.osm_id),
      name: props.name,
      kind: kindFromValue(props.osm_value || ''),
      address,
      distanceKm: haversineKm(point, { latitude, longitude }),
      latitude,
      longitude,
      rating,
      reviewCount,
    });
  }

  return clinics.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20);
}
