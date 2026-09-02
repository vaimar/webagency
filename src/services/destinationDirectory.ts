// Frontend directory of destinations and origin hubs for the explore flow.
//
// The backend's AirportResolutionService fully resolves a curated set of
// cities and wakeboard venues (flights + activities + hotels). For anything
// else it returns 400 DESTINATION_AIRPORT_REQUIRED unless the request carries
// an explicit arrivalAirport — and even then it has no city coordinates, so
// hotel/activity search is skipped. This directory lets the UI:
//   1. suggest destinations that are known to work,
//   2. attach an arrivalAirport hint for popular non-curated cities,
//   3. keep city-centre coordinates so the app can run a direct
//      /api/hotels/nearby search when the backend can't.

export interface DestinationHint {
    /** Suggestion shown in the destination datalist. */
    label: string;
    /** Lowercased tokens matched against the user's input. */
    keywords: string[];
    arrivalAirport: string;
    /** True when the backend resolves this destination itself (full pipeline). */
    curatedByBackend: boolean;
    /** City-centre coordinates for the direct hotel-search fallback. */
    cityLat?: number;
    cityLon?: number;
}

// Mirrors AirportResolutionService.createDestinations() + the wakeboard
// venue catalog examples the backend advertises in DESTINATION_AIRPORT_REQUIRED.
const CURATED_DESTINATIONS: DestinationHint[] = [
    { label: 'Nice', keywords: ['nice'], arrivalAirport: 'NCE', curatedByBackend: true, cityLat: 43.7102, cityLon: 7.2620 },
    { label: 'Dublin', keywords: ['dublin'], arrivalAirport: 'DUB', curatedByBackend: true, cityLat: 53.3498, cityLon: -6.2603 },
    { label: 'Barcelona', keywords: ['barcelona'], arrivalAirport: 'BCN', curatedByBackend: true, cityLat: 41.3874, cityLon: 2.1686 },
    { label: 'Madrid', keywords: ['madrid'], arrivalAirport: 'MAD', curatedByBackend: true, cityLat: 40.4168, cityLon: -3.7038 },
    { label: 'Lisbon', keywords: ['lisbon', 'lisboa'], arrivalAirport: 'LIS', curatedByBackend: true, cityLat: 38.7223, cityLon: -9.1393 },
    { label: 'Rome', keywords: ['rome', 'roma'], arrivalAirport: 'FCO', curatedByBackend: true, cityLat: 41.9028, cityLon: 12.4964 },
    { label: 'Marseille', keywords: ['marseille'], arrivalAirport: 'MRS', curatedByBackend: true, cityLat: 43.2965, cityLon: 5.3698 },
    { label: 'Toulouse', keywords: ['toulouse'], arrivalAirport: 'TLS', curatedByBackend: true, cityLat: 43.6047, cityLon: 1.4442 },
    { label: 'Dusseldorf', keywords: ['dusseldorf', 'düsseldorf'], arrivalAirport: 'DUS', curatedByBackend: true, cityLat: 51.2277, cityLon: 6.7735 },
    { label: 'Vilnius', keywords: ['vilnius'], arrivalAirport: 'VNO', curatedByBackend: true, cityLat: 54.6872, cityLon: 25.2797 },
    { label: 'EXO 84', keywords: ['exo 84', 'exo84'], arrivalAirport: 'MRS', curatedByBackend: true },
    { label: 'Les Houches', keywords: ['les houches', 'chamonix'], arrivalAirport: 'GVA', curatedByBackend: true, cityLat: 45.8919, cityLon: 6.7986 },
    { label: 'Paros', keywords: ['paros', 'parikia'], arrivalAirport: 'PAS', curatedByBackend: true, cityLat: 37.0853, cityLon: 25.1489 },
    { label: 'Santorini', keywords: ['santorini', 'thira', 'thera', 'fira', 'oia'], arrivalAirport: 'JTR', curatedByBackend: true, cityLat: 36.4167, cityLon: 25.4333 },
    { label: 'Mykonos', keywords: ['mykonos'], arrivalAirport: 'JMK', curatedByBackend: true, cityLat: 37.4467, cityLon: 25.3289 },
    { label: 'Naxos', keywords: ['naxos'], arrivalAirport: 'JNX', curatedByBackend: true, cityLat: 37.1036, cityLon: 25.3767 },
    { label: 'Athens', keywords: ['athens', 'athina', 'piraeus'], arrivalAirport: 'ATH', curatedByBackend: true, cityLat: 37.9838, cityLon: 23.7275 },
    // Curated backend-side since city-destinations.json gained Ibiza (city +
    // IBZ + coords + water-sports anchor venue); coords kept as a fallback.
    { label: 'Ibiza', keywords: ['ibiza', 'eivissa'], arrivalAirport: 'IBZ', curatedByBackend: true, cityLat: 38.9067, cityLon: 1.4206 },
    { label: '313 Cable Park', keywords: ['313'], arrivalAirport: 'VNO', curatedByBackend: true },
    { label: 'Paris Wakepark', keywords: ['paris wakepark'], arrivalAirport: 'ORY', curatedByBackend: true },
    { label: 'Lakecity 33', keywords: ['lakecity'], arrivalAirport: 'BOD', curatedByBackend: true },
    { label: 'Hypnotics', keywords: ['hypnotics'], arrivalAirport: 'PGF', curatedByBackend: true },
    { label: 'Langenfeld', keywords: ['langenfeld'], arrivalAirport: 'DUS', curatedByBackend: true },
];

// Popular cities the backend cannot resolve by itself: the UI supplies the
// arrivalAirport explicitly and uses the city-centre coordinates for the
// direct hotel-search fallback.
const HINTED_DESTINATIONS: DestinationHint[] = [
    { label: 'Geneva', keywords: ['geneva', 'genève', 'geneve'], arrivalAirport: 'GVA', curatedByBackend: false, cityLat: 46.2044, cityLon: 6.1432 },
    { label: 'Prague', keywords: ['prague', 'praha'], arrivalAirport: 'PRG', curatedByBackend: false, cityLat: 50.0755, cityLon: 14.4378 },
    { label: 'Palma de Mallorca', keywords: ['palma', 'mallorca'], arrivalAirport: 'PMI', curatedByBackend: false, cityLat: 39.5696, cityLon: 2.6502 },
    { label: 'Malaga', keywords: ['malaga', 'málaga'], arrivalAirport: 'AGP', curatedByBackend: false, cityLat: 36.7213, cityLon: -4.4216 },
    { label: 'Alicante', keywords: ['alicante'], arrivalAirport: 'ALC', curatedByBackend: false, cityLat: 38.3452, cityLon: -0.4810 },
    { label: 'Lyon', keywords: ['lyon'], arrivalAirport: 'LYS', curatedByBackend: false, cityLat: 45.7640, cityLon: 4.8357 },
    { label: 'Porto', keywords: ['porto'], arrivalAirport: 'OPO', curatedByBackend: false, cityLat: 41.1579, cityLon: -8.6291 },
    { label: 'Faro', keywords: ['faro'], arrivalAirport: 'FAO', curatedByBackend: false, cityLat: 37.0194, cityLon: -7.9304 },
    { label: 'London', keywords: ['london'], arrivalAirport: 'STN', curatedByBackend: false, cityLat: 51.5072, cityLon: -0.1276 },
];

const ALL_DESTINATIONS = [...CURATED_DESTINATIONS, ...HINTED_DESTINATIONS];

export const getDestinationSuggestions = (): string[] => ALL_DESTINATIONS.map((hint) => hint.label);

export const resolveDestinationHint = (input: string): DestinationHint | undefined => {
    const normalized = input.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }

    return ALL_DESTINATIONS.find((hint) => hint.keywords.some(
        (keyword) => normalized === keyword || normalized.includes(keyword),
    ));
};

// Some airports serve both a city and a nearby venue (MRS → Marseille + EXO 84,
// GVA → Geneva + Les Houches, …). When a caller asks "what city does this airport
// serve?" the answer is always the city, never the venue — so the ambiguous
// airports name their primary destination explicitly instead of relying on list
// order. Airports with a single hint need no entry here.
const PRIMARY_DESTINATION_BY_AIRPORT: Record<string, string> = {
    MRS: 'Marseille',
    DUS: 'Dusseldorf',
    VNO: 'Vilnius',
    GVA: 'Geneva',
    ORY: 'Paris Wakepark',
    BOD: 'Lakecity 33',
    PGF: 'Hypnotics',
};

/**
 * Resolve an IATA code to the destination whose city-centre coordinates should
 * anchor a location search. Note this is NOT what {@link resolveDestinationHint}
 * does — that matches city-name keywords, so an IATA code ('MAD') never matches
 * a keyword ('madrid'). Only hints that actually carry coordinates are returned;
 * callers fall back to the airport's own location when this yields nothing.
 */
export const resolveDestinationHintByAirport = (iata: string): DestinationHint | undefined => {
    const code = iata.trim().toUpperCase();
    if (!code) {
        return undefined;
    }

    const candidates = ALL_DESTINATIONS.filter(
        (hint) => hint.arrivalAirport === code && hint.cityLat != null && hint.cityLon != null,
    );
    if (candidates.length <= 1) {
        return candidates[0];
    }

    const preferred = PRIMARY_DESTINATION_BY_AIRPORT[code];
    return candidates.find((hint) => hint.label === preferred) ?? candidates[0];
};

// Rough origin hub lookup — the backend does the real flight search; this only
// turns a home address into a sensible departure airport, never left blank.
const ORIGIN_HUBS: Array<[string, string]> = [
    ['limerick', 'SNN'],
    ['shannon', 'SNN'],
    ['dublin', 'DUB'],
    ['cork', 'ORK'],
    ['galway', 'NOC'],
    ['paris', 'CDG'],
    ['london', 'LHR'],
    ['nice', 'NCE'],
    ['lyon', 'LYS'],
    ['berlin', 'BER'],
];

export const resolveOriginAirport = (homeAddress: string): string => {
    const normalized = homeAddress.toLowerCase();
    const match = ORIGIN_HUBS.find(([city]) => normalized.includes(city));
    return match ? match[1] : 'DUB';
};
