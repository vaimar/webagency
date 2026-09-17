/**
 * V1 and its variants from docs/specs/sncf-rail-ways-in.md section 7.2, as typed
 * fixtures shared by the service suite and the component suite.
 *
 * Test-only. Nothing under src/ imports this at runtime; `sdet` owns it under
 * the fixture-ownership table (section 11).
 *
 * **Every value in V1 is captured, not illustrative** (rev 5). It is journey 1
 * of R0's sanitized body, `src/test/resources/sncf/journeys-cdg-arnage-20261003.json`:
 * 08:48 not 08:49, an `Aléop P30 857065` second leg rather than a TER that does
 * not exist on this route, and ONE journey — the old RER B + TGV 8051 pair came
 * from the earlier CDG→Le Mans probe and is not in this body.
 *
 * P1 is closed: Arnage is at (47.928541, 0.189882), 1.9506 km from Spot FR,
 * so `distanceKm: 2.0` renders as `2 km`.
 *
 * Each builder returns a fresh object, so a test that edits a vector to make a
 * variant cannot leak that edit into the next test.
 */
import type {
    RailAlightingOption,
    RailJourney,
    RailOrigin,
    RailStation,
    RailWaysInResponse,
} from './railWaysIn';

/** Arnage as R0's captured body reports it. */
export const arnageStation = (): RailStation => ({
    id: 'stop_area:SNCF:87396549',
    name: 'Arnage',
    distanceKm: 2.0,
    latitude: 47.928541,
    longitude: 0.189882,
});

/** Le Mans: reached at 10:30, 7.2 km out — the earlier, farther option. */
export const leMansOption = (): RailAlightingOption => ({
    stationId: 'stop_area:SNCF:87396002',
    stationName: 'Le Mans',
    arrivalTime: '2026-10-03T10:30:00+02:00',
    distanceKm: 7.2,
    durationMinutes: 102,
    changes: 0,
    final: false,
});

/** Arnage: reached at 13:25 after a 2h50 wait, 2 km out — the destination. */
export const arnageOption = (): RailAlightingOption => ({
    stationId: 'stop_area:SNCF:87396549',
    stationName: 'Arnage',
    arrivalTime: '2026-10-03T13:25:00+02:00',
    distanceKm: 2.0,
    durationMinutes: 277,
    changes: 1,
    final: true,
});

/**
 * V1's single captured journey. The 2h50 at Le Mans is the point of the whole
 * alighting feature: the rider is off the train at 10:30, 7.2 km away, or stays
 * aboard to 13:25 and 2 km.
 */
export const v1Journey = (): RailJourney => ({
    departure: '2026-10-03T08:48:00+02:00',
    arrival: '2026-10-03T13:25:00+02:00',
    durationMinutes: 277,
    changes: 1,
    fare: null,
    legs: [
        {
            mode: 'TGV INOUI',
            line: null,
            trainNumber: '5210',
            from: 'Aéroport Charles de Gaulle 2 TGV',
            to: 'Le Mans',
            departure: '2026-10-03T08:48:00+02:00',
            arrival: '2026-10-03T10:30:00+02:00',
        },
        {
            mode: 'Aléop',
            line: 'P30',
            trainNumber: '857065',
            from: 'Le Mans',
            to: 'Arnage',
            departure: '2026-10-03T13:20:00+02:00',
            arrival: '2026-10-03T13:25:00+02:00',
        },
    ],
    alightingOptions: [leMansOption(), arnageOption()],
});

/**
 * The same journey with only its destination option — the shape criterion 46's
 * negative half needs. Journey 2 of the captured body is the real one-option
 * case (its five candidates span 27 minutes, under the materiality threshold);
 * this is that SHAPE, built from V1 rather than quoting figures I have not read.
 */
export const singleOptionJourney = (): RailJourney => ({
    ...v1Journey(),
    alightingOptions: [arnageOption()],
});

export const cdgOrigin = (journeys: RailJourney[] = [v1Journey()]): RailOrigin => ({
    kind: 'AIRPORT',
    code: 'CDG',
    label: 'Paris Charles de Gaulle',
    stationName: 'Aéroport CDG 2 TGV',
    note: 'Station inside Terminal 2.',
    status: 'OK',
    journeys,
});

export const parisOrigin = (): RailOrigin => ({
    kind: 'CITY',
    code: 'PARIS',
    label: 'Paris',
    stationName: null,
    note: 'Any Paris station. Getting into Paris is not included.',
    status: 'NO_JOURNEY',
    journeys: [],
});

/** V1: sample mode, status OK, one CDG journey and a Paris origin with none. */
export const v1Response = (): RailWaysInResponse => ({
    slug: 'wake-paradise-spay-fr',
    status: 'OK',
    provider: 'SNCF',
    date: '2026-10-03',
    dateBasis: 'SAMPLE',
    departAfter: '08:00',
    chain: null,
    station: arnageStation(),
    origins: [cdgOrigin(), parisOrigin()],
    priceState: 'MANUAL_CHECK',
    bookingUrl: 'https://www.sncf-connect.com/',
    fetchedAt: '2026-09-15T09:12:00Z',
});

/**
 * V2: V1 chained to a 09:35 CDG landing. 09:35 + 90 rounds up to 11:15.
 *
 * Only the chain, dateBasis, departAfter and origin list are asserted from this
 * vector — criterion 31 reads the date line, which depends on `chain` and
 * `origins[0].stationName` and not on which journeys the origin holds.
 */
export const v2Response = (): RailWaysInResponse => ({
    ...v1Response(),
    dateBasis: 'AFTER_FLIGHT',
    departAfter: '11:15',
    chain: {
        airport: 'CDG',
        arrivalTime: '2026-10-03T09:35:00+02:00',
        routed: true,
        bufferMinutes: 90,
    },
    origins: [cdgOrigin()],
});

/**
 * A well-formed response with no journeys, for the status and request-shape
 * cases. `origins` is empty, so `status` is honestly NO_JOURNEY rather than an
 * OK carrying nothing.
 */
export const railEnvelope = (
    overrides: Partial<RailWaysInResponse> = {},
): RailWaysInResponse => ({
    ...v1Response(),
    status: 'NO_JOURNEY',
    origins: [],
    ...overrides,
});

/** A chained response for one gateway, used by criterion 31's vectors. */
export const chainedResponse = (chain: {
    airport: string;
    arrivalTime: string;
    routed: boolean;
    bufferMinutes: number | null;
}, date: string, departAfter: string, origin: RailOrigin): RailWaysInResponse => ({
    ...v1Response(),
    date,
    dateBasis: chain.routed ? 'AFTER_FLIGHT' : 'SAMPLE',
    departAfter,
    chain,
    origins: [origin],
});
