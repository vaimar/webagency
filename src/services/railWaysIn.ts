// Train "ways in" to a French spot — the client for GET /api/spots/{slug}/rail.
//
// Spec: docs/specs/sncf-rail-ways-in.md (rev 4), sections 7.2 and 8.4.
//
// Two things about this surface are deliberate, and both are why the types
// below look the way they do:
//
//   · There is no price. The SNCF coverage returns no fares at all, so `fare`
//     is null on every journey and the block links out to SNCF Connect instead
//     of showing a number. Navitia's "0.0" never becomes a €0 on a page.
//   · The endpoint answers 200 with a `status` rather than failing. Every way
//     this can come back empty — no station, no train, timetable not published,
//     provider down, quota gone — is a distinct value the block has fixed copy
//     for, so a rider is told which one happened.
//
// Times arrive as ISO-8601 with the Europe/Paris offset and are read as wall
// clock by `formatClock`, never re-zoned into the reader's locale.

import { API_BASE } from './api';
import { formatClock, formatDuration } from './flightFormat';
import { trackedFetch } from './serviceStatus';

/** The outcome of the whole lookup. `OK` means at least one origin has a journey. */
export type RailStatus =
    | 'OK'
    | 'NOT_FRANCE'
    | 'NO_COORDINATES'
    | 'NOT_CONFIGURED'
    | 'NO_STATION_NEARBY'
    | 'NO_JOURNEY'
    | 'TIMETABLE_NOT_PUBLISHED'
    | 'PROVIDER_UNAVAILABLE'
    | 'QUOTA_EXHAUSTED';

/** The outcome for one origin. A single origin can fail while the response is `OK`. */
export type OriginStatus =
    | 'OK'
    | 'NO_JOURNEY'
    | 'TIMETABLE_NOT_PUBLISHED'
    | 'PROVIDER_UNAVAILABLE'
    | 'QUOTA_EXHAUSTED';

/** How the flight the rider picked connects to the trains below it. */
export interface RailChain {
    /** `arrivalAirport`, upper-cased. */
    airport: string;
    /**
     * ISO-8601 carrying the Europe/Paris offset, e.g. '2026-10-03T09:40:00+02:00'.
     * Characters 0..9 are therefore already the Paris calendar date — slice them
     * rather than parsing, or the date renders in the reader's zone (8.3).
     */
    arrivalTime: string;
    /** True for the gateways we have a curated transfer buffer for: CDG, LYS, BVA, ORY. */
    routed: boolean;
    /** CDG 90 / LYS 75 / BVA 180 / ORY 150. Null when `routed` is false. */
    bufferMinutes: number | null;
}

/** The station the trains run to — the nearest rail-served stop_area, which may be a halt. */
export interface RailStation {
    id: string;
    name: string;
    /** Haversine spot → stop_area, 1 decimal. A straight line, not a routed distance. */
    distanceKm: number;
    latitude: number;
    longitude: number;
}

/** One leg of a journey: a train, not a transfer or a walk. */
export interface RailLeg {
    /**
     * Commercial mode: 'TGV INOUI', 'Aléop', 'NOMAD', 'Rémi', 'RER', 'OUIGO'.
     * Never 'TER' — no TER-branded leg exists in the captured answer, and the
     * physical mode that would say otherwise lies.
     */
    mode: string;
    /** Line code; 'B' for RER B. Null when the provider sends ''. */
    line: string | null;
    /** Headsign when it is all digits, else null. */
    trainNumber: string | null;
    from: string;
    to: string;
    /** ISO-8601 with the Europe/Paris offset. */
    departure: string;
    arrival: string;
}

/**
 * Somewhere the rider can get off this journey and still be within 30 km of the
 * spot. A long wait mid-journey can make an earlier, farther station the better
 * trade — reaching Le Mans at 10:30 and walking 7.2 km beats sitting on a
 * platform until 13:20 to arrive 2 km out — so both are offered and the rider
 * decides.
 *
 * This cannot be derived here: legs carry station names only, and the client has
 * neither station nor spot coordinates to take a haversine from. It arrives on
 * the wire, already filtered.
 */
export interface RailAlightingOption {
    stationId: string;
    /** Without the commune suffix: 'Le Mans', never 'Le Mans (Le Mans)'. */
    stationName: string;
    /** ISO-8601 with offset: when the rider is off the train here. */
    arrivalTime: string;
    /** Haversine station → spot, 1 decimal. */
    distanceKm: number;
    /** THIS option's run, not the journey's: Le Mans is 102 where the journey is 277. */
    durationMinutes: number;
    /** Changes made before reaching this option. */
    changes: number;
    /** True exactly once, on the journey's destination station. */
    final: boolean;
}

export interface RailJourney {
    /** ISO-8601 with offset. */
    departure: string;
    /** At the destination station — the last alighting option. */
    arrival: string;
    /** The FULL run to the destination, even when an earlier option is nearer. */
    durationMinutes: number;
    /** Number of changes over the full run; 0 is a direct train. */
    changes: number;
    /** Public-transport legs only, in order. At least one. */
    legs: RailLeg[];
    /** Where the rider can get off, in journey order. Never empty. */
    alightingOptions: RailAlightingOption[];
    /** Reserved for the fares follow-up (F1). Always null in this slice. */
    fare: null;
}

export interface RailOrigin {
    kind: 'AIRPORT' | 'CITY';
    code: 'CDG' | 'LYS' | 'PARIS';
    label: string;
    /** The origin's station; null for a city origin, which is any station in it. */
    stationName: string | null;
    /** Fixed copy from the backend's gateway table (7.3). */
    note: string;
    status: OriginStatus;
    /** 1..3 when `status` is `OK`, else empty. */
    journeys: RailJourney[];
}

export interface RailWaysInResponse {
    slug: string;
    status: RailStatus;
    provider: 'SNCF';
    /** 'YYYY-MM-DD'. Null for NOT_FRANCE, NO_COORDINATES and NOT_CONFIGURED. */
    date: string | null;
    /** Null exactly when `date` is null. */
    dateBasis: 'AFTER_FLIGHT' | 'SAMPLE' | null;
    /** 'HH:MM' local; '08:00' in sample mode. Null exactly when `date` is null. */
    departAfter: string | null;
    /** Null when no arrival params were sent. */
    chain: RailChain | null;
    /** Non-null once the station step succeeded. */
    station: RailStation | null;
    /** Empty unless a station was found. */
    origins: RailOrigin[];
    priceState: 'MANUAL_CHECK';
    bookingUrl: 'https://www.sncf-connect.com/';
    /**
     * Earliest provider-fetch instant behind this response. Deliberately NOT
     * rendered: no price is shown, so no freshness claim is made (8.3).
     */
    fetchedAt: string | null;
}

/** `0` → "Direct", `1` → "1 change", `n` → "n changes". */
export const changesText = (n: number): string => {
    if (n === 0) return 'Direct';
    return n === 1 ? '1 change' : `${n} changes`;
};

/**
 * The train as a rider would say it: "TGV INOUI 5210", "Aléop P30 857065",
 * "RER B".
 *
 * Mode, then whichever of line and train number the provider actually sent —
 * a TGV INOUI carries a number and no line code, an RER a line and no number,
 * a regional brand like Aléop often both.
 */
export const legName = (leg: RailLeg): string => (
    [leg.mode, leg.line, leg.trainNumber].filter((part) => part != null && part !== '').join(' ')
);

/**
 * 2.0 → "2", 7.2 → "7.2". One decimal at most, never a trailing ".0".
 *
 * Exported so the station line and the alighting lines cannot drift apart: the
 * same station reading "2 km" in one and "2.0 km" three rows below looks like a
 * bug to everyone except the person who wrote it.
 */
export const formatDistanceKm = (km: number): string => {
    const rounded = Math.round(km * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * A wait, said the way a person would say it: "17 min" for a short one, "2h50"
 * once it stops being a gap and starts being an afternoon.
 *
 * The threshold is 90 minutes, inclusive. "170 min" is arithmetically fine and
 * useless — it makes a two-hour-fifty platform wait read as a small number, and
 * that wait is exactly what the rider needs to notice.
 */
export const waitText = (minutes: number): string => (
    minutes < 90 ? `${minutes} min` : formatDuration(minutes)
);

/** One alighting option as its line of copy, per the spec's fixed strings. */
export const alightingLabel = (option: RailAlightingOption): string => {
    const lead = option.final ? 'Stay to' : 'Off at';
    return `${lead} ${option.stationName} ${formatClock(option.arrivalTime)} · `
        + `${formatDuration(option.durationMinutes)} · ${changesText(option.changes)} · `
        + `${formatDistanceKm(option.distanceKm)} km to the spot`;
};

/**
 * Minutes waiting at a change: the next leg's departure minus this leg's
 * arrival. Both carry the Paris offset, so they subtract correctly.
 */
export const changeMinutes = (prev: RailLeg, next: RailLeg): number => (
    Math.round((Date.parse(next.departure) - Date.parse(prev.arrival)) / 60000)
);

/**
 * One lookup. Pass `arrival` to chain the trains to a picked flight; leave it
 * off for the labelled sample date.
 *
 * Throws on a network failure, a non-200 or an unparseable body — the block
 * renders all three the same way it renders PROVIDER_UNAVAILABLE (8.3).
 */
export const fetchRailWaysIn = async (
    slug: string,
    arrival?: { airport: string; time: string },
): Promise<RailWaysInResponse> => {
    const path = `${API_BASE}/api/spots/${encodeURIComponent(slug)}/rail`;
    // URLSearchParams percent-encodes the clock's colons and leaves the ISO "T"
    // alone, which is exactly the shape the spec's request assertions expect.
    const query = arrival
        ? `?${new URLSearchParams({ arrivalAirport: arrival.airport, arrivalTime: arrival.time }).toString()}`
        : '';

    const response = await trackedFetch(`${path}${query}`);
    if (!response.ok) {
        throw new Error(`Rail ways-in request failed with status ${response.status}`);
    }
    return (await response.json()) as RailWaysInResponse;
};
