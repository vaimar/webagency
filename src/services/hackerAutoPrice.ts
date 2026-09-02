// Pricing the Route Hacker list without anyone having to ask for it.
//
// Ryanair-operated legs price from Ryanair's own free JSON API in about 45ms,
// so the "Get Live Price" button was asking permission it did not need. What it
// WAS protecting against is volume: 27 itineraries is 52 leg lookups if you
// price them one itinerary at a time. Deduplicating first turns that into ~13
// distinct legs, because the same Shannon departure feeds a dozen hubs — and 13
// parallel calls at 45ms is under a second for the whole page.
//
// Only all-Ryanair itineraries are priced this way. Everything else needs the
// paid aggregator path, which has no free equivalent to lean on.

import { getAntiCauchemarPricingSummary } from './antiCauchemarPricing';
import { HackerItinerary, LegFare, fetchLegPrice } from './hackerRoutes';
import { clockMinutes } from './hackFlightSort';
import { itinerarySchedule } from './itinerarySchedule';

const RYANAIR_CODES = ['FR', 'RK'];

/** "2026-09-07T08:10:00" → "08:10". */
const formatClock = (value?: string | null): string => {
    const match = value?.match(/(?:^|T)(\d{2}:\d{2})/);
    return match ? match[1] : '—';
};

/** Legs Ryanair operates price for free; nothing else does. */
export const isRyanairLeg = (carriers?: string[] | null): boolean => (
    (carriers ?? []).some((code) => RYANAIR_CODES.includes(code.trim().toUpperCase()))
);

export const isRyanairItinerary = (itinerary: HackerItinerary): boolean => (
    isRyanairLeg(itinerary.leg1.airlineCodes)
    && (!itinerary.leg2 || isRyanairLeg(itinerary.leg2.airlineCodes))
);

export interface PricedLeg {
    origin: string;
    destination: string;
    /** The leg's OWN date — leg 2 of an overnight hop is the next day. */
    date: string;
    carriers: string[];
}

/** Identity of a leg as a fare: same route, same day. */
export const legPriceKey = (origin: string, destination: string, date: string): string => (
    `${origin.toUpperCase()}-${destination.toUpperCase()}-${date}`
);

/**
 * Every distinct Ryanair leg across the itineraries, once each.
 *
 * Collected from EVERY itinerary, not only the all-Ryanair ones. A Ryanair leg
 * inside a mixed itinerary is worth looking up even though the journey can
 * never be fully priced, because the answer tells us whether that flight exists
 * at all — see `ryanairLegUnpriced`.
 *
 * Dates come from the resolved schedule rather than the search date, so the
 * second leg of an overnight self-transfer is priced for the morning it
 * actually departs.
 */
export const uniqueRyanairLegs = (itineraries: HackerItinerary[], searchDate: string): PricedLeg[] => {
    const byKey = new Map<string, PricedLeg>();
    for (const itinerary of itineraries) {
        const schedule = itinerarySchedule(itinerary, searchDate);
        const legs: Array<[HackerItinerary['leg1'], string | undefined]> = [
            [itinerary.leg1, schedule.leg1.departure?.date],
        ];
        if (itinerary.leg2) {
            legs.push([itinerary.leg2, schedule.leg2?.departure?.date]);
        }
        for (const [leg, date] of legs) {
            if (!leg.origin || !leg.destination || !date || !isRyanairLeg(leg.airlineCodes)) {
                continue;
            }
            const key = legPriceKey(leg.origin, leg.destination, date);
            if (!byKey.has(key)) {
                byKey.set(key, {
                    origin: leg.origin,
                    destination: leg.destination,
                    date,
                    carriers: leg.airlineCodes ?? [],
                });
            }
        }
    }
    return Array.from(byKey.values());
};

export interface ItineraryPrice {
    total: number;
    leg1: number | null;
    leg2: number | null;
    /**
     * True when every leg's fare belongs to the very flight on this card.
     *
     * False means the number is the day's floor sitting on an itinerary that
     * did not earn it — 25 Shannon–Charleroi routings quoting the same €37 when
     * only the one built from both cheapest departures actually costs that.
     */
    exact: boolean;
    /** Departure times the fares are really for, when they are not this card's. */
    farePoints: Array<{ leg: 1 | 2; clock: string }>;
    /**
     * What the journey really costs: every leg's fare plus its own cabin bag
     * and airport transfer. Null unless every leg came with a breakdown.
     *
     * This is the number that decides whether a self-transfer is actually
     * cheaper than the direct, because two tickets means paying the cabin bag
     * twice — a €38 routing against a €60 direct stops looking clever once both
     * bags are counted.
     */
    honestTotal: number | null;
    /** Honest total minus the fares: the part nobody quotes you. */
    extras: number | null;
    /** How many separate cabin-bag fees this journey carries. */
    cabinBags: number;
}

/**
 * Honest cost of a set of legs, or null unless all of them can be worked out.
 * A total missing one leg's extras understates exactly the thing it exists to
 * expose, so it is better withheld.
 */
export const honestCostOf = (
    fares: Array<{ price: number | null; antiCauchemar?: LegFare['antiCauchemar'] }>,
): { honestTotal: number | null; extras: number | null; cabinBags: number } => {
    let honest = 0;
    let fareSum = 0;
    let cabinBags = 0;
    for (const fare of fares) {
        const summary = getAntiCauchemarPricingSummary(fare.price ?? undefined, fare.antiCauchemar);
        if (fare.price === null || typeof summary.estimatedEntryPrice !== 'number') {
            return { honestTotal: null, extras: null, cabinBags: 0 };
        }
        honest += summary.estimatedEntryPrice;
        fareSum += fare.price;
        if ((summary.cabinBagEstimate ?? 0) > 0) {
            cabinBags += 1;
        }
    }
    const round = (value: number): number => Math.round(value * 100) / 100;
    return { honestTotal: round(honest), extras: round(honest - fareSum), cabinBags };
};

/**
 * An itinerary's fare, assembled from its legs' prices. Null unless EVERY leg
 * priced: a self-transfer showing only the half we could price would read as a
 * bargain that does not exist.
 */
export const itineraryPrice = (
    itinerary: HackerItinerary,
    searchDate: string,
    legPrices: Record<string, LegFare>,
): ItineraryPrice | null => {
    if (!isRyanairItinerary(itinerary)) {
        return null;
    }
    const schedule = itinerarySchedule(itinerary, searchDate);

    const fareFor = (leg: HackerItinerary['leg1'], date?: string): LegFare | null => {
        if (!leg.origin || !leg.destination || !date) return null;
        return legPrices[legPriceKey(leg.origin, leg.destination, date)] ?? null;
    };

    const leg1Fare = fareFor(itinerary.leg1, schedule.leg1.departure?.date);
    if (!leg1Fare || leg1Fare.price === null) {
        return null;
    }

    const farePoints: ItineraryPrice['farePoints'] = [];
    // Same minute = this fare is for this flight. Anything else is another
    // departure's price, and saying so is the whole point of carrying the time.
    const matches = (fare: LegFare, scheduled?: string | null, leg: 1 | 2 = 1): boolean => {
        const fareMinutes = clockMinutes(fare.departure);
        const flightMinutes = clockMinutes(scheduled);
        if (fareMinutes === null || flightMinutes === null) {
            return false;
        }
        if (fareMinutes === flightMinutes) {
            return true;
        }
        farePoints.push({ leg, clock: formatClock(fare.departure) });
        return false;
    };

    const leg1Exact = matches(leg1Fare, itinerary.leg1.departureTime, 1);

    if (!itinerary.leg2) {
        return {
            total: leg1Fare.price,
            leg1: leg1Fare.price,
            leg2: null,
            exact: leg1Exact,
            farePoints,
            ...honestCostOf([leg1Fare]),
        };
    }

    const leg2Fare = fareFor(itinerary.leg2, schedule.leg2?.departure?.date);
    if (!leg2Fare || leg2Fare.price === null) {
        return null;
    }
    const leg2Exact = matches(leg2Fare, itinerary.leg2.departureTime, 2);

    return {
        total: Math.round((leg1Fare.price + leg2Fare.price) * 100) / 100,
        leg1: leg1Fare.price,
        leg2: leg2Fare.price,
        exact: leg1Exact && leg2Exact,
        farePoints,
        ...honestCostOf([leg1Fare, leg2Fare]),
    };
};

/**
 * Fetches the legs a few at a time.
 *
 * Unbounded parallelism would fire every leg at Ryanair the instant a search
 * lands; a small pool keeps the page fast without turning one search into a
 * burst. A leg that fails is recorded as unpriced rather than retried — the
 * manual button is still there.
 */
export const fetchLegPrices = async (
    legs: PricedLeg[],
    concurrency = 4,
    fetcher = fetchLegPrice,
): Promise<Record<string, LegFare>> => {
    const prices: Record<string, LegFare> = {};
    let cursor = 0;
    const worker = async (): Promise<void> => {
        while (cursor < legs.length) {
            const leg = legs[cursor];
            cursor += 1;
            const key = legPriceKey(leg.origin, leg.destination, leg.date);
            try {
                prices[key] = await fetcher(leg.origin, leg.destination, leg.carriers, leg.date);
            } catch {
                prices[key] = { price: null, departure: null };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, legs.length) }, worker));
    return prices;
};

/**
 * Did a Ryanair leg of this itinerary come back with no fare?
 *
 * Ryanair's fare feed is DATE-ACCURATE in a way the schedule grid is not: it
 * answers per calendar day and stays silent on days a route does not fly. The
 * grid, built from a weekday pattern stamped valid for six months, will happily
 * offer Shannon → Alicante on a Tuesday when Ryanair only flies it on Sundays.
 * So an empty fare is the best evidence available that the flight is not real,
 * and it is worth more than the schedule row that produced it.
 *
 * Only legs actually looked up count. A leg with no entry was never asked
 * about — no evidence is not evidence of absence.
 */
export const ryanairLegUnpriced = (
    itinerary: HackerItinerary,
    searchDate: string,
    legPrices: Record<string, LegFare>,
    excused: (origin: string, destination: string, date: string) => boolean = () => false,
): boolean => {
    const schedule = itinerarySchedule(itinerary, searchDate);
    const legs: Array<[HackerItinerary['leg1'], string | undefined]> = [
        [itinerary.leg1, schedule.leg1.departure?.date],
    ];
    if (itinerary.leg2) {
        legs.push([itinerary.leg2, schedule.leg2?.departure?.date]);
    }
    return legs.some(([leg, date]) => {
        if (!leg.origin || !leg.destination || !date || !isRyanairLeg(leg.airlineCodes)) {
            return false;
        }
        const fare = legPrices[legPriceKey(leg.origin, leg.destination, date)];
        if (!fare || fare.price !== null) {
            return false;
        }
        // A fare the traveller entered themselves is proof they found the
        // flight, which outranks the feed's silence.
        return !excused(leg.origin, leg.destination, date);
    });
};
