// Presenting an OpenStreetMap place to a human.
//
// The tags arrive as OSM writes them — "italian;pizza", "Mo-Fr 09:00-17:00" —
// which is precise and unreadable. These turn them into something a person can
// scan, without adding anything OSM did not say.

import { MapPoi } from './mapMarkers';

const EARTH_RADIUS_KM = 6371;

/** Straight-line km between two coordinates. */
export const distanceKm = (fromLat: number, fromLon: number, toLat: number, toLon: number): number => {
    const toRad = (deg: number): number => (deg * Math.PI) / 180;
    const dLat = toRad(toLat - fromLat);
    const dLon = toRad(toLon - fromLon);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** "700 m" under a kilometre, "2.4 km" above — the precision people walk by. */
export const formatDistance = (km: number): string => (
    km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`
);

/** "italian;pizza" → ["Italian", "Pizza"]. OSM separates with semicolons. */
export const cuisineList = (cuisine?: string | null): string[] => (
    (cuisine ?? '')
        .split(';')
        .map((part) => part.trim().replace(/_/g, ' '))
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
);

/** "cafe" → "Café", "fast_food" → "Fast food". */
export const placeKind = (amenity?: string | null): string => {
    switch ((amenity ?? '').toLowerCase()) {
        case 'cafe': return 'Café';
        case 'fast_food': return 'Fast food';
        case 'bar': return 'Bar';
        case 'pub': return 'Pub';
        case 'restaurant': return 'Restaurant';
        default: return 'Place to eat';
    }
};

/**
 * The facts OSM happens to hold, as short chips.
 *
 * Only TRUE values become chips. A missing `wheelchair` tag means nobody has
 * surveyed it, and rendering "no wheelchair access" from that absence would be
 * inventing a fact about a real business.
 */
export const placeFeatures = (poi: MapPoi): string[] => {
    const features: string[] = [];
    if (poi.outdoorSeating) features.push('Outdoor seating');
    if (poi.vegetarian) features.push('Vegetarian');
    if (poi.vegan) features.push('Vegan');
    if (poi.wheelchair) features.push('Step-free');
    return features;
};

/**
 * A maps link that lands on the PLACE, not a patch of ground.
 *
 * The old link searched bare coordinates, which drops you on a map pin with no
 * name and no reviews. Searching the name alongside the coordinates opens the
 * business listing — which is where the ratings we cannot provide actually live.
 */
export const placeMapUrl = (poi: MapPoi): string => (
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.name} ${poi.lat},${poi.lon}`)}`
);

/**
 * Roughly how long the walk is, at 4.8 km/h.
 *
 * Distance alone does not answer the question a rider is asking after a
 * session — "can I walk to it, or do I have to move the car" — and 1.9 km
 * means different things to different people. Returns null past 3 km, where
 * nobody is walking and a minute figure would only be noise.
 */
export const walkMinutes = (km: number): number | null => (
    km > 3 ? null : Math.max(1, Math.round((km / 4.8) * 60))
);
