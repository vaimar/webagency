// Honest "first-mile" driving cost for the home → departure-airport leg when
// the traveller drives themselves and parks at the airport. Covers fuel, tolls,
// and parking (× nights), plus the added round-trip drive time.
//
// Values are real Irish route data (the routes Slumber's Limerick/Cork/Galway
// users actually drive) with a transparent fuel model. Everything is a labelled
// estimate; unknown routes return null rather than a fabricated number.

export interface DriveTollItem {
    name: string;
    /** One-way charge; applied both directions in the round-trip total. */
    amountEur: number;
}

export interface DriveEstimate {
    originCity: string;
    departureAirport: string;
    /** Airport the traveller flies back into; defaults to departureAirport. */
    returnAirport: string;
    /** True when the return airport differs from where the car is parked
     *  (open-jaw) — the round-trip parking/drive-home assumption breaks. */
    splitAirport: boolean;
    distanceKm: number;
    driveMinutesOneWay: number;
    addedMinutesRoundTrip: number;
    fuelEur: number;
    /** Named tolls (one-way list, for display). */
    tolls: DriveTollItem[];
    /** Round-trip toll total (each toll counted both ways). */
    tollsEur: number;
    parkingPerDayEur: number;
    nights: number;
    parkingEur: number;
    totalEur: number;
    currency: string;
}

interface RouteData {
    distanceKm: number;
    driveMinutesOneWay: number;
    tolls: DriveTollItem[];
}

// Keyed `${ORIGIN_CITY}|${AIRPORT}`. Tolls are the barrier-free/unregistered
// (no-tag) rates a casual driver actually pays.
const ROUTES: Record<string, RouteData> = {
    'LIMERICK|DUB': {
        distanceKm: 200,
        driveMinutesOneWay: 150,
        tolls: [
            { name: 'M7 toll (Barnalisheen)', amountEur: 2.30 },
            { name: 'M50 eFlow (unregistered)', amountEur: 3.80 },
        ],
    },
    'LIMERICK|SNN': { distanceKm: 25, driveMinutesOneWay: 25, tolls: [] },
    'CORK|DUB': {
        distanceKm: 220,
        driveMinutesOneWay: 165,
        tolls: [
            { name: 'M8 toll (Watergrasshill)', amountEur: 1.90 },
            { name: 'M50 eFlow (unregistered)', amountEur: 3.80 },
        ],
    },
    'CORK|ORK': { distanceKm: 12, driveMinutesOneWay: 20, tolls: [] },
    'GALWAY|DUB': {
        distanceKm: 210,
        driveMinutesOneWay: 150,
        tolls: [
            { name: 'M6/M4 toll (Kinnegad)', amountEur: 2.20 },
            { name: 'M50 eFlow (unregistered)', amountEur: 3.80 },
        ],
    },
    'GALWAY|NOC': { distanceKm: 90, driveMinutesOneWay: 75, tolls: [] },
    'DUBLIN|DUB': { distanceKm: 12, driveMinutesOneWay: 25, tolls: [] },
};

// Airport long-term / off-site parking, € per day.
const PARKING_PER_DAY_EUR: Record<string, number> = {
    DUB: 10,
    SNN: 8,
    ORK: 9,
    NOC: 7,
};
const DEFAULT_PARKING_PER_DAY_EUR = 12;

// Transparent fuel model (mid-size car, current Irish pump price).
const FUEL_LITRES_PER_100KM = 7.0;
const FUEL_PRICE_PER_LITRE_EUR = 1.75;

const ORIGIN_CITY_KEYS = ['LIMERICK', 'SHANNON', 'CORK', 'GALWAY', 'DUBLIN'];

// The home region implied by the resolved origin airport, so the drive origin
// survives even when only the IATA code is in the response.
const AIRPORT_TO_ORIGIN_CITY: Record<string, string> = {
    SNN: 'Limerick',
    ORK: 'Cork',
    NOC: 'Galway',
    DUB: 'Dublin',
};

export const originCityForAirport = (iata?: string | null): string | null => (
    iata ? AIRPORT_TO_ORIGIN_CITY[iata.trim().toUpperCase()] ?? null : null
);

// Strict 2-dp rounding to stop IEEE-754 leaks (e.g. 91.00000000000001) from
// accumulating through the breakdown and into the package sum.
export const round2 = (value: number): number => Number(value.toFixed(2));

const resolveOriginCityKey = (originCity: string): string | undefined => {
    const normalized = originCity.trim().toUpperCase();
    // "Shannon" travellers drive the Limerick routes.
    const match = ORIGIN_CITY_KEYS.find((key) => normalized.includes(key));
    return match === 'SHANNON' ? 'LIMERICK' : match;
};

/**
 * Estimate the driving cost + added time from home to the departure airport.
 * Returns null when we have no real route data for the origin/airport pair —
 * we never fabricate distances or tolls.
 */
export const estimateDrive = (params: {
    originCity: string;
    departureAirport: string;
    nights: number;
    /** Airport the return flight lands at. Defaults to departureAirport (a
     *  standard round trip). When it differs, the car is stranded at the
     *  departure airport — open-jaw logistics the caller must surface. */
    returnAirport?: string;
}): DriveEstimate | null => {
    const airport = params.departureAirport?.trim().toUpperCase();
    const cityKey = resolveOriginCityKey(params.originCity ?? '');
    if (!airport || !cityKey) {
        return null;
    }

    const route = ROUTES[`${cityKey}|${airport}`];
    if (!route) {
        return null;
    }

    const returnAirport = params.returnAirport?.trim().toUpperCase() || airport;
    // Open-jaw check: parked-at airport ≠ returned-to airport.
    const splitAirport = returnAirport !== airport;

    // Zero-Night Clamp: a same-day / 0-night trip still parks the car for a day,
    // so clamp to at least 1 rather than letting facility overhead cancel out.
    const nights = Math.max(1, Number.isFinite(params.nights) ? Math.round(params.nights) : 1);
    const parkingPerDay = PARKING_PER_DAY_EUR[airport] ?? DEFAULT_PARKING_PER_DAY_EUR;

    // Round trip of the home→airport leg (drive there, drive home after the trip).
    const fuelEur = round2(route.distanceKm * 2 * (FUEL_LITRES_PER_100KM / 100) * FUEL_PRICE_PER_LITRE_EUR);
    const tollsEur = round2(route.tolls.reduce((sum, toll) => sum + toll.amountEur, 0) * 2);
    const parkingEur = round2(parkingPerDay * nights);

    return {
        originCity: params.originCity.trim(),
        departureAirport: airport,
        returnAirport,
        splitAirport,
        distanceKm: route.distanceKm,
        driveMinutesOneWay: route.driveMinutesOneWay,
        addedMinutesRoundTrip: route.driveMinutesOneWay * 2,
        fuelEur,
        tolls: route.tolls,
        tollsEur,
        parkingPerDayEur: parkingPerDay,
        nights,
        parkingEur,
        // Strict-round the compiled sum so no float leak reaches the package total.
        totalEur: round2(fuelEur + tollsEur + parkingEur),
        currency: 'EUR',
    };
};
