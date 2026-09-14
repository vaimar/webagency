import { SkiHotel, SkiMapResponse, SkiResort, getSkiMap } from './api';

const normalizePart = (value: string | null | undefined): string => (
    (value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
);

const normalizeJoinKey = (value: string | null | undefined): string => {
    const raw = (value ?? '').trim();
    if (!raw) return '';
    return raw.includes('::')
        ? raw.split('::').map((part) => normalizePart(part)).join('::')
        : normalizePart(raw);
};

export const buildResortJoinKey = (country: string | null | undefined, resort: string | null | undefined): string => (
    `${normalizePart(country)}::${normalizePart(resort)}`
);

/**
 * Repairs the question marks the resort catalogue is riddled with — "St
 * Franc?ois Longchamp", "Arcali?s-Ordino", "Valmorel-?Doucy".
 *
 * <p>Two different characters were lost upstream and both came back as `?`. A `?`
 * between two letters was a combining diacritic (`Franc` + cedilla + `ois`); one
 * straight after a separator was a soft hyphen the source used to allow a line
 * break. Neither survives in the CSV, so this cannot restore the accent — it
 * removes the artefact and leaves the unaccented letter, because "Francois"
 * reads as a place and "Franc?ois" reads as a bug.
 *
 * <p>Display only, and temporary: the real fix is re-importing the catalogue from
 * a source that kept its accents.
 */
export const cleanResortName = (raw: string | null | undefined): string => (raw ?? '')
    // Lost diacritic: keep the base letter, drop the marker.
    .replace(/([A-Za-zÀ-ɏ])\?(?=[A-Za-z])/g, '$1')
    // Lost soft hyphen: the separator before it already does the job.
    .replace(/([/\-–—])\s*\?\s*/g, '$1')
    // Anything still standing was a character we cannot place at all.
    .replace(/�/g, '')
    .replace(/\s*\?\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // Several names end on the separator that joined them to a dropped fragment.
    .replace(/[\s\-–—/]+$/, '')
    .trim();

/**
 * Finds the planner profile slug for a catalogue resort name, or null.
 *
 * <p>The two datasets do not agree on names. The planner knows `la-clusaz`; the
 * CSV catalogue carries both "La Clusaz" and "La Clusaz-?Manigod", the latter
 * being a linked ski area whose mojibake {@link cleanResortName} repairs. So an
 * exact match is not enough — a catalogue name also matches when it extends a
 * slug at a segment boundary.
 *
 * <p>Deliberately conservative: "la-clusaz" must not match "la-clusaz-x" by
 * accident of substring, only by whole segment, and never the reverse. Linking a
 * pin to the wrong resort's planner is worse than not linking it.
 */
export const matchPlannerSlug = (
    resortName: string | null | undefined,
    plannerSlugs: readonly string[],
): string | null => {
    const normalised = normalizePart(cleanResortName(resortName));
    if (!normalised) return null;

    const exact = plannerSlugs.find((slug) => slug === normalised);
    if (exact) return exact;

    // Prefer the longest matching prefix so a future "la-clusaz-manigod" profile
    // wins over the plainer "la-clusaz" for that pin.
    const prefixed = plannerSlugs
        .filter((slug) => normalised.startsWith(`${slug}-`))
        .sort((a, b) => b.length - a.length);
    return prefixed[0] ?? null;
};

export const formatSourceFileLabel = (sourceFile: string | null | undefined): string => {
    const file = (sourceFile ?? '').trim();
    if (!file) return 'unknown source';
    return file.replace(/\.[^.]+$/, '').replace(/[-_.]+/g, ' ');
};

const toNumber = (value: number | null | undefined): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

export interface SkiResortMarker extends SkiResort {
    resortJoinKey: string;
    catalogKey: string;
}

export interface SkiHotelOverlayGroup {
    resortJoinKey: string;
    catalogKey: string;
    country: string;
    resort: string;
    latitude: number;
    longitude: number;
    sourceFile?: string;
    sourceLabel: string;
    offers: SkiHotel[];
    cheapestPriceGbp: number | null;
}

export interface SkiMapLayerData {
    resorts: SkiResortMarker[];
    hotelGroups: SkiHotelOverlayGroup[];
    orphanHotels: SkiHotel[];
    sourceFiles: string[];
}

export interface SkiResortDiscoveryFilters {
    query: string;
    country: string;
    minPisteKm: number | null;
    maxDayPassPrice: number | null;
    minTopElevationM: number | null;
    childFriendly: boolean;
    snowpark: boolean;
    nightSkiing: boolean;
}

const normalizedText = (value: string | null | undefined): string =>
    cleanResortName(value).toLocaleLowerCase();

export const filterSkiResorts = (
    resorts: SkiResortMarker[],
    filters: SkiResortDiscoveryFilters,
): SkiResortMarker[] => {
    const query = filters.query.trim().toLocaleLowerCase();

    return resorts.filter((resort) => {
        const nameAndRegion = `${normalizedText(resort.name)} ${normalizedText(resort.region)}`;
        const topElevation = resort.elevationTopM ?? resort.highestPointM;

        return (!query || nameAndRegion.includes(query))
            && (!filters.country || resort.country === filters.country)
            && (filters.minPisteKm == null || (resort.totalSlopeLengthKm ?? 0) >= filters.minPisteKm)
            && (filters.maxDayPassPrice == null || (resort.price != null && resort.price <= filters.maxDayPassPrice))
            && (filters.minTopElevationM == null || (topElevation ?? 0) >= filters.minTopElevationM)
            && (!filters.childFriendly || resort.childFriendly === true)
            && (!filters.snowpark || resort.snowparks === true)
            && (!filters.nightSkiing || resort.nightskiing === true);
    });
};

export const buildSkiResortMarkers = (resorts: SkiResort[]): SkiResortMarker[] => resorts
    .map((resort, index) => {
        const resortJoinKey = buildResortJoinKey(resort.country, resort.name);
        const catalogKey = `${normalizePart(resort.sourceFile) || 'catalog'}::${resort.rank ?? index}`;
        return {
            ...resort,
            resortJoinKey,
            catalogKey,
        };
    })
    .filter((resort) => resort.latitude != null && resort.longitude != null);

export const buildSkiHotelGroups = (resorts: SkiResort[], hotels: SkiHotel[]): SkiHotelOverlayGroup[] => {
    const resortLookup = new Map<string, SkiResort[]>();
    resorts.forEach((resort) => {
        const joinKey = buildResortJoinKey(resort.country, resort.name);
        const bucket = resortLookup.get(joinKey) ?? [];
        bucket.push(resort);
        resortLookup.set(joinKey, bucket);
    });

    const groupLookup = new Map<string, SkiHotelOverlayGroup>();
    const sortedHotels = [...hotels].sort((a, b) => {
        const countryCompare = (a.country ?? '').localeCompare(b.country ?? '');
        if (countryCompare !== 0) return countryCompare;
        const resortCompare = (a.resort ?? '').localeCompare(b.resort ?? '');
        if (resortCompare !== 0) return resortCompare;
        const priceA = toNumber(a.priceGbp);
        const priceB = toNumber(b.priceGbp);
        if (priceA == null && priceB == null) return 0;
        if (priceA == null) return 1;
        if (priceB == null) return -1;
        return priceA - priceB;
    });

    for (const hotel of sortedHotels) {
        const joinKey = normalizeJoinKey(hotel.resortKey ?? buildResortJoinKey(hotel.country, hotel.resort));
        const resortMatches = resortLookup.get(joinKey);
        const resort = resortMatches?.find((item) => item.latitude != null && item.longitude != null) ?? resortMatches?.[0];
        if (resort?.latitude == null || resort?.longitude == null) {
            continue;
        }

        const existing = groupLookup.get(joinKey);
        const sourceLabel = formatSourceFileLabel(resort.sourceFile);
        const offer = hotel;
        if (existing) {
            existing.offers.push(offer);
            const offerPrice = toNumber(offer.priceGbp);
            if (offerPrice != null) {
                existing.cheapestPriceGbp = existing.cheapestPriceGbp == null
                    ? offerPrice
                    : Math.min(existing.cheapestPriceGbp, offerPrice);
            }
            continue;
        }

        const price = toNumber(offer.priceGbp);
        groupLookup.set(joinKey, {
            resortJoinKey: joinKey,
            catalogKey: `${normalizePart(resort.sourceFile) || 'catalog'}::${resort.rank ?? joinKey}`,
            country: resort.country ?? offer.country ?? 'Unknown country',
            resort: resort.name ?? offer.resort ?? 'Unknown resort',
            latitude: resort.latitude,
            longitude: resort.longitude,
            sourceFile: resort.sourceFile,
            sourceLabel,
            offers: [offer],
            cheapestPriceGbp: price,
        });
    }

    return [...groupLookup.values()].sort((a, b) => {
        if (a.cheapestPriceGbp == null && b.cheapestPriceGbp == null) {
            return a.resort.localeCompare(b.resort);
        }
        if (a.cheapestPriceGbp == null) return 1;
        if (b.cheapestPriceGbp == null) return -1;
        if (a.cheapestPriceGbp !== b.cheapestPriceGbp) {
            return a.cheapestPriceGbp - b.cheapestPriceGbp;
        }
        return a.resort.localeCompare(b.resort);
    });
};

export const buildSkiMapLayerData = (payload: SkiMapResponse): SkiMapLayerData => {
    const resorts = buildSkiResortMarkers(payload.resorts);
    const hotelGroups = buildSkiHotelGroups(payload.resorts, payload.hotels);
    const joinedKeys = new Set(hotelGroups.map((group) => group.resortJoinKey));
    const orphanHotels = payload.hotels.filter((hotel) => {
        const joinKey = normalizeJoinKey(hotel.resortKey ?? buildResortJoinKey(hotel.country, hotel.resort));
        return !joinedKeys.has(joinKey);
    });
    const sourceFiles = Array.from(new Set(payload.resorts.map((resort) => resort.sourceFile).filter((value): value is string => Boolean(value))));
    return { resorts, hotelGroups, orphanHotels, sourceFiles };
};

export const loadSkiMap = async (): Promise<SkiMapLayerData> => {
    const { map } = await getSkiMap();
    return buildSkiMapLayerData(map);
};
