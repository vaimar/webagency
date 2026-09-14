// ─────────────────────────────────────────────────────────────────────────────
// Stay Guide — a browsable directory of every accommodation that EXISTS in a
// place, rendered even when no price is knowable.
//
// The brick model: each accommodation is an *identity brick* (xid, name, coords,
// category) that renders immediately from OpenTripMap. Price / rating / reviews
// are *enrichment bricks* that can be joined back on later via the stable `xid`.
// Phase 1 does NOT fetch any prices — the `enrichment` slot is left empty and
// every card deep-links out to Booking/Google instead (zero per-hotel API cost).
// Phase 2 can hydrate the slot without changing this shape.
// ─────────────────────────────────────────────────────────────────────────────

import { CuratedStay, HotelResult, getCuratedStaysByBbox, getHotelDetails, getHotelsByBbox } from './api';
import { getAirport } from './airports';
import { resolveDestinationHint, resolveDestinationHintByAirport } from './destinationDirectory';

export type StayCategory =
    | 'hotel'
    | 'hostel'
    | 'guest_house'
    | 'apartment'
    | 'resort'
    | 'motel'
    | 'camp'
    | 'other';

/**
 * Enrichment bricks joined onto an identity by `xid`. For curated hotels the
 * backend's free Xotelo pass fills these in-line on the /bbox response (a live
 * TripAdvisor rate + curated stars/reviews); everything else stays `idle` and
 * falls back to a deep-link. A later pass could hydrate the rest.
 */
export interface StayEnrichment {
    status: 'idle' | 'loading' | 'loaded' | 'unavailable';
    pricePerNight?: number | null;
    priceCurrency?: string;
    rating?: number | null;
    reviewsCount?: number | null;
    reviewSummary?: string;
    bookingLink?: string;
    thumbnailUrl?: string;
    /** True when a curated TripAdvisor/Xotelo catalog entry matched this stay. */
    curated?: boolean;
}

export interface StayGuideEntry {
    /** Stable join key — the anchor that lets enrichment bricks snap back on. */
    xid: string;
    name: string;
    latitude?: number;
    longitude?: number;
    category: StayCategory;
    /** Raw OpenTripMap `kinds` string, kept for debugging / re-categorization. */
    rawKinds?: string;
    /** Straight-line distance from the place centre, km. Null when coords absent. */
    distanceKm: number | null;
    enrichment: StayEnrichment;
}

export interface StayGuideGroup {
    category: StayCategory;
    label: string;
    entries: StayGuideEntry[];
}

export interface StayGuidePlace {
    /** Human label, e.g. "Barcelona (BCN)". */
    label: string;
    iata?: string;
    latitude: number;
    longitude: number;
    /** Where the centre came from — city-centre coords beat airport coords. */
    source: 'city-center' | 'airport';
}

/** A curated TripAdvisor catalog hotel with a live Xotelo rate — the "verified
 *  stays" tier, pulled by key independently of OpenTripMap. */
export interface VerifiedStay {
    hotelKey: string;
    name: string;
    latitude?: number;
    longitude?: number;
    rating: number | null;
    reviewsCount: number | null;
    reviewNote?: string;
    /** Curated photo of the hotel; absent when the catalog has none. */
    photoUrl?: string;
    pricePerNight: number | null;
    priceCurrency?: string;
    distanceKm: number | null;
}

export interface StayGuideResult {
    place: StayGuidePlace;
    entries: StayGuideEntry[];
    groups: StayGuideGroup[];
    total: number;
    /** How many stays came back with a live nightly rate (curated Xotelo match). */
    pricedCount: number;
    /** Curated catalog hotels in the area, priced-first — the "verified" tier. */
    verified: VerifiedStay[];
}

// Display order + labels for the grouped directory. `other` sinks to the bottom.
export const CATEGORY_ORDER: StayCategory[] = [
    'hotel', 'resort', 'apartment', 'guest_house', 'hostel', 'motel', 'camp', 'other',
];

export const CATEGORY_LABELS: Record<StayCategory, string> = {
    hotel: 'Hotels',
    resort: 'Resorts',
    apartment: 'Apartments',
    guest_house: 'Guest houses',
    hostel: 'Hostels',
    motel: 'Motels',
    camp: 'Campsites',
    other: 'Other stays',
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in km. */
export const haversineKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

export interface BoundingBox {
    lonMin: number;
    latMin: number;
    lonMax: number;
    latMax: number;
}

/** Square-ish bbox of `radiusKm` half-extent around a centre, longitude scaled
 *  by latitude so it stays roughly `radiusKm` on the ground east-to-west too. */
export const bboxAround = (lat: number, lon: number, radiusKm: number): BoundingBox => {
    const latDelta = radiusKm / 110.574;
    const lonDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(lat))));
    return {
        lonMin: lon - lonDelta,
        latMin: lat - latDelta,
        lonMax: lon + lonDelta,
        latMax: lat + latDelta,
    };
};

// OpenTripMap `kinds` is a comma-joined tag string. Order matters: the most
// specific / most-marketable category wins so a "hostel,accomodations" row is a
// hostel, not a generic hotel.
const KIND_RULES: Array<[StayCategory, RegExp]> = [
    ['hostel', /hostel/],
    ['guest_house', /guest_?house/],
    ['apartment', /apartment/],
    ['resort', /resort/],
    ['motel', /motel/],
    ['camp', /camp|caravan|alpine_hut/],
    ['hotel', /hotel|accomodation/],
];

/** Map an OpenTripMap `kinds` string to a single display category. */
export const categorizeKinds = (kinds?: string): StayCategory => {
    const normalized = (kinds ?? '').toLowerCase();
    for (const [category, pattern] of KIND_RULES) {
        if (pattern.test(normalized)) {
            return category;
        }
    }
    return 'other';
};

/** Turn one OpenTripMap hotel row into an identity brick with an empty
 *  enrichment slot, computing distance from the place centre when possible. */
const isLivePrice = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Read the enrichment bricks the backend already attached (free Xotelo pass for
 *  curated hotels). A live nightly rate marks the entry `loaded`; a curated stars
 *  match with no rate still carries rating/review; otherwise the slot stays idle. */
const readEnrichment = (hotel: HotelResult): StayEnrichment => {
    const price = isLivePrice(hotel.pricePerNight) ? hotel.pricePerNight : null;
    const rating = typeof hotel.rating === 'number' && Number.isFinite(hotel.rating) ? hotel.rating : null;
    const curated = price != null || rating != null || Boolean(hotel.reviewSummary);
    return {
        status: price != null ? 'loaded' : 'idle',
        pricePerNight: price,
        priceCurrency: hotel.priceCurrency,
        rating,
        reviewsCount: hotel.reviewsCount ?? null,
        reviewSummary: hotel.reviewSummary,
        bookingLink: hotel.bookingLink,
        thumbnailUrl: hotel.thumbnailUrl,
        curated,
    };
};

export const toStayEntry = (
    hotel: HotelResult,
    center: { lat: number; lon: number },
    index: number,
): StayGuideEntry => {
    const hasCoords = typeof hotel.latitude === 'number' && typeof hotel.longitude === 'number';
    return {
        xid: hotel.xid || `stay-${index}`,
        name: hotel.name?.trim() || `Unnamed stay ${index + 1}`,
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        category: categorizeKinds(hotel.kinds),
        rawKinds: hotel.kinds,
        distanceKm: hasCoords
            ? haversineKm(center.lat, center.lon, hotel.latitude as number, hotel.longitude as number)
            : null,
        enrichment: readEnrichment(hotel),
    };
};

/** Drop duplicates: same `xid` first, then same name at (near-)identical coords.
 *  OpenTripMap occasionally returns the same property twice across tag sets. */
export const dedupeEntries = (entries: StayGuideEntry[]): StayGuideEntry[] => {
    const seenXid = new Set<string>();
    const seenNameLoc = new Set<string>();
    const out: StayGuideEntry[] = [];
    for (const entry of entries) {
        if (entry.xid && seenXid.has(entry.xid)) {
            continue;
        }
        const locKey = `${entry.name.toLowerCase()}@${entry.latitude?.toFixed(4)},${entry.longitude?.toFixed(4)}`;
        if (seenNameLoc.has(locKey)) {
            continue;
        }
        if (entry.xid) {
            seenXid.add(entry.xid);
        }
        seenNameLoc.add(locKey);
        out.push(entry);
    }
    return out;
};

/** Group entries by category into the display order, nearest-first within each
 *  group (unknown-distance entries sink to the end of their group). */
export const groupEntries = (entries: StayGuideEntry[]): StayGuideGroup[] => {
    const byCategory = new Map<StayCategory, StayGuideEntry[]>();
    for (const entry of entries) {
        const bucket = byCategory.get(entry.category) ?? [];
        bucket.push(entry);
        byCategory.set(entry.category, bucket);
    }
    return CATEGORY_ORDER
        .filter((category) => byCategory.has(category))
        .map((category) => ({
            category,
            label: CATEGORY_LABELS[category],
            entries: (byCategory.get(category) as StayGuideEntry[]).sort(sortByDistance),
        }));
};

// Rank within a group: live-rate stays first, then curated (rated) stays, then
// the rest — each tier ordered nearest-first. Puts the actionable, priced hotels
// where the eye lands.
const rank = (entry: StayGuideEntry): number => {
    if (entry.enrichment.status === 'loaded') return 0;
    if (entry.enrichment.curated) return 1;
    return 2;
};

const sortByDistance = (a: StayGuideEntry, b: StayGuideEntry): number => {
    const tier = rank(a) - rank(b);
    if (tier !== 0) return tier;
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
};

/** Entries in display order (priced/curated first, then nearest) — the same
 *  ranking used inside groups, for the flat, paginated category view. */
export const sortEntries = (entries: StayGuideEntry[]): StayGuideEntry[] =>
    [...entries].sort(sortByDistance);

/** Resolve a place (picked as an airport IATA) to a bbox centre. Prefers the
 *  curated city-centre coordinates over the airport's own location, since a
 *  hotel guide wants the city, not the runway (BVA is 85 km from Paris). */
export const resolveGuidePlace = async (
    iata: string,
    label?: string,
): Promise<StayGuidePlace | null> => {
    const code = iata.trim().toUpperCase();
    if (!code) {
        return null;
    }

    // 1. City-centre coords from a matching destination hint (best signal). The
    //    airport lookup comes first because the Stay Guide picks destinations by
    //    IATA code, which never matches a city-name keyword.
    const hint = resolveDestinationHintByAirport(code)
        ?? (label ? resolveDestinationHint(label) : undefined);
    if (hint?.cityLat != null && hint?.cityLon != null) {
        return {
            label: label || hint.label,
            iata: code,
            latitude: hint.cityLat,
            longitude: hint.cityLon,
            source: 'city-center',
        };
    }

    // 2. Airport coordinates as a universal fallback.
    const airport = await getAirport(code);
    if (airport?.latitude != null && airport?.longitude != null) {
        return {
            label: label || `${airport.municipality ?? airport.name ?? code} (${code})`,
            iata: code,
            latitude: airport.latitude,
            longitude: airport.longitude,
            source: 'airport',
        };
    }

    return null;
};

/**
 * The free, on-demand extras for one stay. Deliberately narrow: it carries only
 * the fields OpenStreetMap tags on the property ITSELF (its website and postal
 * address), which are reliable. It intentionally omits OTM's `preview` image and
 * `wikipedia` extract — those come from a loosely-associated Wikidata entity and
 * are frequently a different building entirely (a hostel resolving to a café that
 * closed in 1925), so surfacing them would be actively misleading.
 */
export interface StayDetails {
    /** The property's own site, often its direct Booking.com page. */
    websiteUrl?: string;
    addressLine?: string;
}

const asText = (value: unknown): string | undefined => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text : undefined;
};

/** Build "Road 12, 28012 Madrid" from OSM address tags, skipping missing parts. */
const buildAddressLine = (address: unknown): string | undefined => {
    if (!address || typeof address !== 'object') {
        return undefined;
    }
    const parts = address as Record<string, unknown>;
    // A house number without a street name is meaningless ("4, 28013 Madrid"), so
    // it is only included when there is a road to attach it to.
    const road = asText(parts.road);
    const street = road ? [road, asText(parts.house_number)].filter(Boolean).join(' ') : undefined;
    const locality = [asText(parts.postcode), asText(parts.city ?? parts.town ?? parts.village)]
        .filter(Boolean).join(' ');
    const line = [street, locality].filter(Boolean).join(', ');
    return line || undefined;
};

/**
 * Fetch the free OpenTripMap details for one stay, on demand.
 *
 * COST: zero. This is OpenTripMap's free `/places/xid` endpoint, and the backend
 * caches the response in its DB with a TTL, so repeat views cost nothing at all.
 * It is called only from an explicit user click — never eagerly for a whole
 * 200-card directory, which would also trip OTM's rate limit.
 */
export const fetchStayDetails = async (xid: string): Promise<StayDetails> => {
    const { details } = await getHotelDetails(xid);
    return {
        websiteUrl: asText(details.url),
        addressLine: buildAddressLine(details.address),
    };
};

const isLiveRate = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Map a backend CuratedStay to a VerifiedStay, computing distance from centre. */
export const toVerifiedStay = (stay: CuratedStay, center: { lat: number; lon: number }): VerifiedStay => {
    const hasCoords = typeof stay.latitude === 'number' && typeof stay.longitude === 'number';
    return {
        hotelKey: stay.hotelKey ?? '',
        name: stay.name?.trim() || stay.hotelKey || 'Curated stay',
        latitude: stay.latitude,
        longitude: stay.longitude,
        rating: typeof stay.rating === 'number' ? stay.rating : null,
        reviewsCount: typeof stay.reviewsCount === 'number' ? stay.reviewsCount : null,
        reviewNote: stay.reviewNote,
        photoUrl: stay.photoUrl,
        pricePerNight: isLiveRate(stay.pricePerNight) ? stay.pricePerNight : null,
        priceCurrency: stay.priceCurrency,
        distanceKm: hasCoords
            ? haversineKm(center.lat, center.lon, stay.latitude as number, stay.longitude as number)
            : null,
    };
};

/** Priced stays first (cheapest → dearest), then rate-less curated stays by distance. */
const sortVerified = (a: VerifiedStay, b: VerifiedStay): number => {
    const aPriced = a.pricePerNight != null;
    const bPriced = b.pricePerNight != null;
    if (aPriced !== bPriced) return aPriced ? -1 : 1;
    if (aPriced && bPriced) return (a.pricePerNight as number) - (b.pricePerNight as number);
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
};

export interface LoadStayGuideOptions {
    /** Half-extent of the search bbox, km. Airport-sourced centres widen a bit
     *  since the runway can sit well outside town. */
    radiusKm?: number;
}

/** Both stay sources around one centre: the OpenTripMap directory and the
 *  curated, live-priced catalog. Shared by the guide and the nearby lookup. */
const fetchStaysAround = async (
    center: { lat: number; lon: number },
    radiusKm: number,
): Promise<{ entries: StayGuideEntry[]; verified: VerifiedStay[] }> => {
    const box = bboxAround(center.lat, center.lon, radiusKm);

    // OpenTripMap directory + curated catalog run in parallel; a curated-catalog
    // failure must never sink the directory, so it degrades to an empty list.
    const [{ hotels }, curated] = await Promise.all([
        getHotelsByBbox(box.lonMin, box.latMin, box.lonMax, box.latMax),
        getCuratedStaysByBbox(box.lonMin, box.latMin, box.lonMax, box.latMax).catch(() => [] as CuratedStay[]),
    ]);

    return {
        entries: dedupeEntries(hotels.map((hotel, index) => toStayEntry(hotel, center, index))),
        verified: curated.map((stay) => toVerifiedStay(stay, center)).sort(sortVerified),
    };
};

// ─── Stays near an arbitrary point (a spot on the map, not a city) ────────────

/**
 * One place to sleep near a point, flattened from either source. A wake park is
 * not a city: the question there is "what is close", so both sources collapse
 * into a single distance-ordered list rather than the guide's category groups.
 */
export interface NearbyStay {
    /** `xid` for directory rows, `hotelKey` for curated ones — unique per list. */
    id: string;
    name: string;
    latitude?: number;
    longitude?: number;
    category: StayCategory;
    /** Straight-line km from the spot itself, not from a city centre. */
    distanceKm: number | null;
    pricePerNight: number | null;
    priceCurrency?: string;
    rating: number | null;
    reviewsCount: number | null;
    /** A matched property page when we have one; otherwise the caller deep-links. */
    bookingLink?: string;
    thumbnailUrl?: string;
    /** From the curated TripAdvisor catalog — rated, and priced when quoted. */
    curated: boolean;
}

export interface NearbyStaysResult {
    stays: NearbyStay[];
    /** How many carry a live nightly rate. */
    pricedCount: number;
    /** The half-extent actually searched, so the UI can say "within 15 km". */
    radiusKm: number;
}

/** Normalised name for duplicate detection: case, accents and the filler words
 *  that differ between OSM and TripAdvisor ("Hôtel Le Lac" vs "Hotel Le Lac"). */
const nameKey = (name: string): string => name
    .toLowerCase()
    .normalize('NFD')
    // Combining marks, spelled as escapes so the source stays plain ASCII.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Same property from both sources: same name, and within 500 m of each other.
 *  Coordinates alone are not enough — the two feeds geocode a large resort to
 *  different corners of it — and the name alone would merge two "Camping Municipal". */
const isSameProperty = (a: NearbyStay, b: NearbyStay): boolean => {
    if (nameKey(a.name) !== nameKey(b.name)) return false;
    if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return true;
    return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) <= 0.5;
};

const verifiedToNearby = (stay: VerifiedStay): NearbyStay => ({
    id: stay.hotelKey || `curated-${nameKey(stay.name)}`,
    name: stay.name,
    latitude: stay.latitude,
    longitude: stay.longitude,
    // The curated catalog is hotels by construction; it carries no OSM kinds.
    category: 'hotel',
    distanceKm: stay.distanceKm,
    pricePerNight: stay.pricePerNight,
    priceCurrency: stay.priceCurrency,
    rating: stay.rating,
    reviewsCount: stay.reviewsCount,
    thumbnailUrl: stay.photoUrl,
    curated: true,
});

const entryToNearby = (entry: StayGuideEntry): NearbyStay => ({
    id: entry.xid,
    name: entry.name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    category: entry.category,
    distanceKm: entry.distanceKm,
    pricePerNight: entry.enrichment.pricePerNight ?? null,
    priceCurrency: entry.enrichment.priceCurrency,
    rating: entry.enrichment.rating ?? null,
    reviewsCount: entry.enrichment.reviewsCount ?? null,
    bookingLink: entry.enrichment.bookingLink,
    thumbnailUrl: entry.enrichment.thumbnailUrl,
    curated: Boolean(entry.enrichment.curated),
});

/**
 * Merge the two feeds into one list. Curated rows are laid down first so that
 * when the same hotel appears in both, the one keeping its rating and live rate
 * is the one that survives. Unknown-distance rows sink to the bottom rather than
 * claiming a position they cannot support.
 */
export const mergeNearbyStays = (entries: StayGuideEntry[], verified: VerifiedStay[]): NearbyStay[] => {
    const merged: NearbyStay[] = verified.map(verifiedToNearby);
    for (const entry of entries) {
        const candidate = entryToNearby(entry);
        if (merged.some((existing) => isSameProperty(existing, candidate))) continue;
        merged.push(candidate);
    }
    return merged.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
    });
};

/**
 * Places to sleep around a bare coordinate — used by the spot finder once a spot
 * is picked on the map. No IATA and no destination hint involved: a wake park is
 * usually nowhere near a city the directory knows by name.
 *
 * <p>The default radius is wider than the city guide's because these are rural.
 * A lake with nothing inside 8 km is normal, and an empty list there would read
 * as "nothing exists" rather than "look a bit further out".
 */
export const loadStaysNear = async (
    latitude: number,
    longitude: number,
    radiusKm = 15,
): Promise<NearbyStaysResult> => {
    const center = { lat: latitude, lon: longitude };
    const { entries, verified } = await fetchStaysAround(center, radiusKm);
    const stays = mergeNearbyStays(entries, verified);
    return {
        stays,
        pricedCount: stays.filter((stay) => stay.pricePerNight != null).length,
        radiusKm,
    };
};

/**
 * Build the full accommodation directory for a place.
 * Resolves coords → queries OpenTripMap by bbox → maps to identity bricks →
 * dedupes → groups by category. No price fetching happens here.
 */
export const loadStayGuide = async (
    iata: string,
    label?: string,
    options: LoadStayGuideOptions = {},
): Promise<StayGuideResult> => {
    const place = await resolveGuidePlace(iata, label);
    if (!place) {
        throw new Error(`Could not resolve a location for "${label || iata}".`);
    }

    const radiusKm = options.radiusKm ?? (place.source === 'airport' ? 12 : 8);
    const { entries, verified } = await fetchStaysAround(
        { lat: place.latitude, lon: place.longitude },
        radiusKm,
    );

    return {
        place,
        entries,
        groups: groupEntries(entries),
        total: entries.length,
        pricedCount: entries.filter((entry) => entry.enrichment.status === 'loaded').length,
        verified,
    };
};
