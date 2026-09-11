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

import { getAntiCauchemarPricingSummary, rebaseFare, stripCabinBag } from './antiCauchemarPricing';
import { ObservedFares, isObservedFareFresh, observedFareKey } from './observedFares';
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
    /** The departure this fare is for, "HH:mm". */
    departureTime: string | null;
}

/** "17:15:00" / an ISO stamp → "17:15". */
const clockOf = (value?: string | null): string | null => (
    value?.match(/(?:^|T)(\d{2}:\d{2})/)?.[1] ?? null
);

/**
 * Identity of a fare: a route, a day AND a departure.
 *
 * It used to be route-and-day, which was right while Ryanair's daily feed was
 * the only source — one fare existed per route per day, so a second key would
 * have held the same number twice. Now that a departure can be priced on its
 * own, MAD → IBZ has €21.99 at 08:35 and €34.78 at 17:15 on the same day, and a
 * key that cannot tell them apart hands one flight the other's price.
 */
export const legPriceKey = (
    origin: string,
    destination: string,
    date: string,
    departureTime?: string | null,
): string => [
    origin.toUpperCase(),
    destination.toUpperCase(),
    date,
    clockOf(departureTime) ?? 'any',
].join('-');

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
            const key = legPriceKey(leg.origin, leg.destination, date, leg.departureTime);
            if (!byKey.has(key)) {
                byKey.set(key, {
                    origin: leg.origin,
                    destination: leg.destination,
                    date,
                    carriers: leg.airlineCodes ?? [],
                    departureTime: clockOf(leg.departureTime),
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
    /**
     * How many of the legs are priced from a fare the traveller entered
     * themselves rather than from the feed. Non-zero means the number on the
     * card is partly a sighting, and has to say so.
     */
    observedLegs: number;
    /** What the extras are made of — see HonestCost. */
    bagCost: number;
    transferCost: number;
    lateArrivalCost: number;
    frictionCost: number;
    /**
     * When these fares were fetched, if they were remembered from earlier in
     * the session rather than looked up for this search — the OLDEST of the
     * legs, because a total is only as current as its stalest part. Null when
     * anything in it has just come back from the feed.
     */
    seenAt: string | null;
}

export interface HonestCost {
    honestTotal: number | null;
    /** Everything above the fares: the part nobody quotes. */
    extras: number | null;
    /** How many separate cabin-bag fees the journey carries. */
    cabinBags: number;
    /** Of the extras, what the cabin bags cost. */
    bagCost: number;
    /** Of the extras, what getting to and from the airports costs. */
    transferCost: number;
    /**
     * The taxi a midnight landing forces on you, once the buses have stopped.
     * Routinely the BIGGEST line in the extras — €60 against a €15 fare — and
     * the one people cannot guess, so it is carried out separately rather than
     * left in an unexplained remainder.
     */
    lateArrivalCost: number;
    /** Risk margin for the airports that are famously a trap (BVA, BGY, STN). */
    frictionCost: number;
}

/**
 * Honest cost of a set of legs, or null unless all of them can be worked out.
 * A total missing one leg's extras understates exactly the thing it exists to
 * expose, so it is better withheld.
 *
 * The extras come back SPLIT as well as summed. "€15 fare + €89 extras" is a
 * number nobody can act on; "€40 of cabin bags and €49 of airport transfer" is
 * two facts, one of which the traveller can delete by not taking a bag —
 * which is what `smallBagOnly` does.
 */
export const honestCostOf = (
    fares: Array<{ price: number | null; antiCauchemar?: LegFare['antiCauchemar'] }>,
    { smallBagOnly = false }: { smallBagOnly?: boolean } = {},
): HonestCost => {
    let honest = 0;
    let fareSum = 0;
    let cabinBags = 0;
    let bagCost = 0;
    let transferCost = 0;
    let lateArrivalCost = 0;
    let frictionCost = 0;
    const empty = {
        honestTotal: null,
        extras: null,
        cabinBags: 0,
        bagCost: 0,
        transferCost: 0,
        lateArrivalCost: 0,
        frictionCost: 0,
    };
    const amount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    for (const fare of fares) {
        // Dropped per leg, not from the total: a self-transfer is two tickets
        // and therefore two bag fees, and the traveller carrying one small bag
        // is not paying either of them.
        const truth = smallBagOnly && fare.antiCauchemar
            ? stripCabinBag(fare.antiCauchemar)
            : fare.antiCauchemar;
        const summary = getAntiCauchemarPricingSummary(fare.price ?? undefined, truth);
        if (fare.price === null || typeof summary.estimatedEntryPrice !== 'number') {
            return empty;
        }
        honest += summary.estimatedEntryPrice;
        fareSum += fare.price;
        bagCost += summary.cabinBagEstimate ?? 0;
        transferCost += summary.airportShuttleEstimate ?? 0;
        lateArrivalCost += amount(truth?.priceBreakdown?.lateArrivalMarkup?.amount);
        // The structured line when there is one, the flat field when there is not.
        frictionCost += amount(truth?.priceBreakdown?.frictionPenalty?.amount)
            || amount(truth?.hiddenCostPenalty);
        if ((summary.cabinBagEstimate ?? 0) > 0) {
            cabinBags += 1;
        }
    }
    const round = (value: number): number => Math.round(value * 100) / 100;
    return {
        honestTotal: round(honest),
        extras: round(honest - fareSum),
        cabinBags,
        bagCost: round(bagCost),
        transferCost: round(transferCost),
        lateArrivalCost: round(lateArrivalCost),
        frictionCost: round(frictionCost),
    };
};

/**
 * The oldest "seen at" across a journey's fares, or null if any of them is
 * fresh. A remembered total is only as current as its stalest leg.
 */
const oldestSeenAt = (fares: LegFare[]): string | null => {
    if (fares.some((fare) => !fare.seenAt)) {
        return null;
    }
    return fares.map((fare) => fare.seenAt!).sort()[0];
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
    smallBagOnly = false,
    observedFares: ObservedFares = {},
): ItineraryPrice | null => {
    if (!isRyanairItinerary(itinerary)) {
        return null;
    }
    const schedule = itinerarySchedule(itinerary, searchDate);

    const fareFor = (leg: HackerItinerary['leg1'], date?: string): LegFare | null => {
        if (!leg.origin || !leg.destination || !date) return null;
        return legPrices[legPriceKey(leg.origin, leg.destination, date, leg.departureTime)] ?? null;
    };

    const leg1Fare = fareFor(itinerary.leg1, schedule.leg1.departure?.date);
    if (!leg1Fare || leg1Fare.price === null) {
        return null;
    }

    const farePoints: ItineraryPrice['farePoints'] = [];
    let observedLegs = 0;

    /**
     * The fare the traveller recorded for THIS exact departure, if it is still
     * fresh. Ryanair's feed cannot price a named flight — it publishes the
     * day's cheapest and nothing else — so a sighting of the flight on the card
     * is better evidence than a fetched fare for a different one.
     */
    const sighting = (leg: HackerItinerary['leg1'], date?: string): number | null => {
        if (!leg.origin || !leg.destination || !date) return null;
        const fare = observedFares[observedFareKey({
            origin: leg.origin,
            destination: leg.destination,
            date,
            carriers: leg.airlineCodes,
            departureTime: leg.departureTime,
        })];
        return isObservedFareFresh(fare) ? fare.price : null;
    };

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

    /**
     * A leg's fare as it should be counted: the sighting where the feed's fare
     * belongs to another departure and the traveller has supplied this one's.
     * The extras ride along unchanged — the bag and the taxi do not depend on
     * which departure the ticket is for.
     */
    const settle = (fare: LegFare, price: number | null, exact: boolean): { fare: LegFare; exact: boolean } => {
        if (exact || price === null) {
            return { fare, exact };
        }
        observedLegs += 1;
        return {
            fare: {
                ...fare,
                price,
                antiCauchemar: fare.antiCauchemar ? rebaseFare(fare.antiCauchemar, price) : fare.antiCauchemar,
            },
            exact: true,
        };
    };

    const leg1Settled = settle(
        leg1Fare,
        sighting(itinerary.leg1, schedule.leg1.departure?.date),
        matches(leg1Fare, itinerary.leg1.departureTime, 1),
    );
    const leg1Exact = leg1Settled.exact;

    if (!itinerary.leg2) {
        return {
            total: leg1Settled.fare.price!,
            leg1: leg1Settled.fare.price,
            leg2: null,
            exact: leg1Exact,
            farePoints,
            seenAt: oldestSeenAt([leg1Fare]),
            observedLegs,
            ...honestCostOf([leg1Settled.fare], { smallBagOnly }),
        };
    }

    const leg2Fare = fareFor(itinerary.leg2, schedule.leg2?.departure?.date);
    if (!leg2Fare || leg2Fare.price === null) {
        return null;
    }
    const leg2Settled = settle(
        leg2Fare,
        sighting(itinerary.leg2, schedule.leg2?.departure?.date),
        matches(leg2Fare, itinerary.leg2.departureTime, 2),
    );

    return {
        total: Math.round((leg1Settled.fare.price! + leg2Settled.fare.price!) * 100) / 100,
        leg1: leg1Settled.fare.price,
        leg2: leg2Settled.fare.price,
        exact: leg1Exact && leg2Settled.exact,
        farePoints,
        seenAt: oldestSeenAt([leg1Fare, leg2Fare]),
        observedLegs,
        ...honestCostOf([leg1Settled.fare, leg2Settled.fare], { smallBagOnly }),
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
            const key = legPriceKey(leg.origin, leg.destination, leg.date, leg.departureTime);
            try {
                prices[key] = await fetcher(leg.origin, leg.destination, leg.carriers, leg.date, leg.departureTime);
            } catch {
                // The lookup failed. That is NOT the feed saying the route does
                // not fly — recording it as such would let a momentary outage
                // delete perfectly good itineraries.
                prices[key] = { price: null, departure: null, status: 'error' };
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
    excused: (leg: HackerItinerary['leg1'], date: string) => boolean = () => false,
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
        const fare = legPrices[legPriceKey(leg.origin, leg.destination, date, leg.departureTime)];
        // Only the feed's own "nothing on that date" counts as evidence. A
        // failed request tells us nothing, so the route stays visible.
        if (!fare || fare.status !== 'unpriced') {
            return false;
        }
        // A fare the traveller entered themselves is proof they found the
        // flight, which outranks the feed's silence — but it has to be a
        // sighting of THIS flight, not of another carrier on the same route.
        return !excused(leg, date);
    });
};
