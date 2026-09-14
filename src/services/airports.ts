// Client for the airport reference API (GET /api/airports), backed by the
// imported OurAirports data (IATA-coded rows only). Powers the typeahead airport
// pickers — the full ~9k airport set, not the hardcoded curated shortlist.

import { ALL_AIRPORT_OPTIONS, AirportMetadata, buildAirportSearchText, getAirportMetadata } from '../data/airportMetadata';
import { trackedFetch } from './serviceStatus';

export interface AirportOption {
    iata: string;
    icao: string | null;
    name: string;
    municipality: string | null;
    isoCountry: string | null;
    type: string;
    scheduledService: boolean;
    latitude: number | null;
    longitude: number | null;
}

export interface AirportSearchParams {
    /** ISO alpha-2 country filter, e.g. "FR". */
    country?: string;
    limit?: number;
    signal?: AbortSignal;
}

/**
 * Strips diacritics so "Malaga" matches "Málaga".
 *
 * The backend matches the query against the stored name literally, so an
 * accented airport was unreachable unless the visitor typed the accent:
 * "Malaga" returned nothing at all, "Málaga" returned AGP. The same held for
 * "Dusseldorf". AGP is this app's own default destination, so the single most
 * likely first search anyone runs returned an empty list.
 */
const deaccent = (value: string): string => value
    .normalize('NFD')
    // Combining diacritical marks. Written as an explicit range rather than
    // \p{Diacritic} so it does not depend on the Unicode-property regex target.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Regional-indicator flag emoji are literally the ISO 3166-1 alpha-2 code —
 * 🇪🇸 is U+1F1EA U+1F1F8, i.e. "E" "S". The curated table stores a flag but no
 * ISO code, and the picker renders one, so derive it rather than duplicating a
 * country→code table that would drift.
 */
const isoFromFlag = (flag: string): string | null => {
    const letters = Array.from(flag)
        .map((char) => char.codePointAt(0) ?? 0)
        .filter((point) => point >= 0x1f1e6 && point <= 0x1f1ff)
        .map((point) => String.fromCharCode(point - 0x1f1e6 + 65));

    return letters.length === 2 ? letters.join('') : null;
};

const curatedToOption = (airport: AirportMetadata): AirportOption => ({
    iata: airport.code,
    icao: null,
    name: airport.airportName,
    municipality: airport.city,
    isoCountry: isoFromFlag(airport.flag),
    type: 'curated',
    scheduledService: true,
    latitude: null,
    longitude: null,
});

/** Accent-insensitive search over the bundled curated airports. */
const searchCurated = (query: string): AirportOption[] => {
    const needle = deaccent(query);
    if (!needle) return [];

    return ALL_AIRPORT_OPTIONS
        .map((code) => getAirportMetadata(code))
        .filter((airport): airport is AirportMetadata => airport != null)
        .filter((airport) => deaccent(buildAirportSearchText(airport)).includes(needle))
        .map(curatedToOption);
};

/**
 * Puts an exact code match first.
 *
 * The backend returns its own order, in which an exact IATA hit is not
 * necessarily first: "dub" listed Dublin fifth, behind Dubai World Central and
 * Dubbo, and "ory" put Paris Orly second. Typing the code is the fastest way to
 * pick an airport, and it was the least reliable — it is genuinely easy to
 * select the wrong airport from that list without noticing.
 */
const rankByQuery = (query: string, options: AirportOption[]): AirportOption[] => {
    const needle = deaccent(query);

    const score = (airport: AirportOption): number => {
        if (deaccent(airport.iata) === needle) return 0;
        if (airport.icao && deaccent(airport.icao) === needle) return 1;
        if (deaccent(airport.iata).startsWith(needle)) return 2;
        if (deaccent(airport.municipality ?? '').startsWith(needle)) return 3;
        return 4;
    };

    // Stable: equal scores keep the order the backend chose.
    return options
        .map((airport, index) => ({ airport, index, rank: score(airport) }))
        .sort((left, right) => (left.rank - right.rank) || (left.index - right.index))
        .map((entry) => entry.airport);
};

const dedupeByIata = (options: AirportOption[]): AirportOption[] => {
    const seen = new Set<string>();
    return options.filter((airport) => {
        if (seen.has(airport.iata)) return false;
        seen.add(airport.iata);
        return true;
    });
};

/** Free-text search: IATA/ICAO code or a name/municipality substring. */
export const searchAirports = async (query: string, params: AirportSearchParams = {}): Promise<AirportOption[]> => {
    const search = new URLSearchParams();
    if (query.trim()) {
        search.set('q', query.trim());
    }
    if (params.country) {
        search.set('country', params.country);
    }
    const limit = params.limit ?? 12;
    search.set('limit', String(limit));

    // Curated matches are computed locally and merged in. Server rows win on
    // duplicates because they carry coordinates and ICAO; the curated table is
    // there to catch what the literal server match misses.
    const curated = searchCurated(query);

    let remote: AirportOption[];
    try {
        const response = await trackedFetch(`/api/airports?${search.toString()}`, { signal: params.signal });
        if (!response.ok) {
            throw new Error(`Airport search failed with status ${response.status}`);
        }
        remote = (await response.json()) as AirportOption[];
    } catch (error) {
        // A cancelled request is the caller's business, never ours to swallow.
        if (error instanceof Error && error.name === 'AbortError') throw error;
        // Otherwise fall back to curated results, so the picker still works
        // against the airports this app actually promotes while the backend is
        // down. With nothing to offer, surface the failure instead of an
        // empty list that would read as "no such airport".
        if (curated.length === 0) throw error;
        return rankByQuery(query, curated).slice(0, limit);
    }

    return rankByQuery(query, dedupeByIata([...remote, ...curated])).slice(0, limit);
};

/** Resolve a single airport by IATA code, or null when it isn't in the table. */
export const getAirport = async (iata: string): Promise<AirportOption | null> => {
    const response = await trackedFetch(`/api/airports/${encodeURIComponent(iata)}`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`Airport lookup failed with status ${response.status}`);
    }
    return (await response.json()) as AirportOption;
};

/** Compact one-line label for an airport, e.g. "Paris-Orly Airport · Paris (ORY)". */
export const formatAirportLabel = (airport: AirportOption): string => {
    const place = airport.municipality && airport.municipality !== airport.name ? ` · ${airport.municipality}` : '';
    return `${airport.name}${place} (${airport.iata})`;
};
