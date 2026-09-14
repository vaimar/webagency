// The trip cart — the flights someone has picked, and what they have booked.
//
// This app takes no payment: the ticket is bought on the airline's own site.
// What it can do is hold the plan together while that happens — outbound here,
// return there, one running total — and then let the traveller tick off what
// they have actually paid for, so a half-booked trip is not something they
// have to keep in their head across four browser tabs.
//
// Two rules follow from that, and they are what the shape below is for:
//
//   · One flight per direction. A round trip is an outbound and a return, so
//     picking a second outbound REPLACES the first rather than stacking up —
//     the same thing every booking site does when you change your mind.
//   · A price keeps its provenance all the way into the total. The results
//     list is careful to distinguish a fare that belongs to this exact
//     departure from the day's cheapest fare sitting on a routing that merely
//     shares its day, and a total that quietly mixed the two would be the most
//     misleading number on the page. Once a leg is booked the amount actually
//     charged replaces the estimate — that one is not an estimate at all.
//
// Kept in localStorage: a trip being assembled outlives the tab it started in.

import { cityName } from './airportLabels';
import { AirportRef, HackerFlightLeg, HackerItinerary, HackerItineraryType } from './hackerRoutes';
import { LegSchedule, itinerarySchedule } from './itinerarySchedule';

const STORAGE_KEY = 'travelhub.flightCart.v1';

export type CartDirection = 'outbound' | 'return';

/** Reading order, and the order a booking flow asks for them in. */
export const DIRECTION_ORDER: CartDirection[] = ['outbound', 'return'];

export const directionLabel = (direction: CartDirection): string => (
    direction === 'outbound' ? 'Outbound' : 'Return'
);

/**
 * How much a price is worth — carried from the results card into the total.
 *
 * · `exact`    — the fare is for these very departures.
 * · `floor`    — the cheapest fare on the route that day, which may belong to
 *                a different flight. A floor makes the whole total a "from".
 * · `observed` — a number the traveller looked up and typed in themselves.
 * · `unknown`  — no price at all; the flight is in the cart but not the total.
 */
export type FareBasis = 'exact' | 'floor' | 'observed' | 'unknown';

export interface CartEstimate {
    /** Bare fare, as quoted. */
    fare: number | null;
    /** Fare plus the cabin bag and transfer nobody quotes, when it is known. */
    honest: number | null;
    basis: FareBasis;
}

export interface CartLeg {
    origin: string;
    destination: string;
    /**
     * The cities these codes stand for, resolved when the flight was picked.
     *
     * Stored rather than looked up later: the routing carried what the backend
     * knew about every airport on it, including the hubs the curated table has
     * never heard of, and that is gone by the time someone reopens their trip.
     * Absent on entries saved before this existed — the code is the fallback.
     */
    originCity?: string;
    destinationCity?: string;
    /** The leg's OWN date — leg 2 of an overnight self-transfer is tomorrow. */
    date: string;
    departureTime: string | null;
    arrivalTime: string | null;
    carriers: string[];
}

export interface CartFlight {
    /** Stable across re-selections of the same departures — see `cartFlightId`. */
    id: string;
    direction: CartDirection;
    origin: string;
    destination: string;
    /** The searched departure date for this direction. */
    date: string;
    type: HackerItineraryType;
    /** null on a direct flight. */
    hub: string | null;
    /** One entry for a direct flight, two for a self-transfer. */
    legs: CartLeg[];
    layoverMinutes: number | null;
    totalJourneyMinutes: number | null;
    estimate: CartEstimate;
    /** Ticked once the traveller has bought this one on the airline's site. */
    booked: boolean;
    /** What they were actually charged. Replaces the estimate in the total. */
    paid: number | null;
    /** Airline reference, so the confirmation email can be found again. */
    reference: string | null;
    addedAt: string;
}

export type FlightCart = CartFlight[];

export const cartFlightId = (
    direction: CartDirection,
    itinerary: Pick<HackerItinerary, 'origin' | 'hub' | 'destination'>,
    legs: CartLeg[],
): string => [
    direction,
    itinerary.origin,
    itinerary.hub ?? 'direct',
    itinerary.destination,
    ...legs.map((leg) => `${leg.date}T${leg.departureTime ?? '??'}`),
].join('|');

const cartLeg = (
    leg: HackerFlightLeg,
    schedule: LegSchedule | null,
    fallbackDate: string,
    placeFor: (iata?: string | null) => AirportRef | null,
): CartLeg => ({
    origin: leg.origin ?? '',
    destination: leg.destination ?? '',
    originCity: cityName(leg.origin, placeFor(leg.origin)),
    destinationCity: cityName(leg.destination, placeFor(leg.destination)),
    // Every leg books on its own date, and a cart that forgets that is how
    // someone ends up searching tomorrow's connection under today's date.
    date: schedule?.departure?.date ?? leg.date ?? fallbackDate,
    departureTime: schedule?.departure?.clock ?? leg.departureTime ?? null,
    arrivalTime: schedule?.arrival?.clock ?? leg.arrivalTime ?? null,
    carriers: leg.airlineCodes ?? [],
});

/**
 * The legs of an itinerary as the cart stores them. The clocks and dates come
 * from the resolved schedule rather than the raw legs, so what lands in the
 * cart is what the card showed — including the overnight leg that departs the
 * next morning.
 */
const cartLegsOf = (itinerary: HackerItinerary, date: string): CartLeg[] => {
    const schedule = itinerarySchedule(itinerary, date);
    // The airports the backend resolved for this routing, which is where the
    // name of an uncurated hub comes from.
    const placeFor = (iata?: string | null): AirportRef | null => (
        iata
            ? [itinerary.originAirport, itinerary.hubAirport, itinerary.destinationAirport]
                .find((airport) => airport?.iata?.toUpperCase() === iata.toUpperCase()) ?? null
            : null
    );
    const legs = [cartLeg(itinerary.leg1, schedule.leg1, date, placeFor)];
    if (itinerary.leg2) {
        legs.push(cartLeg(itinerary.leg2, schedule.leg2, date, placeFor));
    }
    return legs;
};

/**
 * What this itinerary's id WOULD be in the cart — so a results list can mark
 * the route it already holds without building a whole entry to compare.
 */
export const cartFlightIdFor = (
    direction: CartDirection,
    itinerary: HackerItinerary,
    date: string,
): string => cartFlightId(direction, itinerary, cartLegsOf(itinerary, date));

export const buildCartFlight = (
    direction: CartDirection,
    itinerary: HackerItinerary,
    date: string,
    estimate: CartEstimate,
    now: Date = new Date(),
): CartFlight => {
    const legs = cartLegsOf(itinerary, date);
    return {
        id: cartFlightId(direction, itinerary, legs),
        direction,
        origin: itinerary.origin,
        destination: itinerary.destination,
        date,
        type: itinerary.type,
        hub: itinerary.hub,
        legs,
        layoverMinutes: itinerary.type === 'DIRECT' ? null : itinerary.layoverMinutes,
        totalJourneyMinutes: itinerary.totalJourneyMinutes ?? null,
        estimate,
        booked: false,
        paid: null,
        reference: null,
        addedAt: now.toISOString(),
    };
};

// ── Storage ──────────────────────────────────────────────────────────────────

const isCartFlight = (value: unknown): value is CartFlight => {
    const flight = value as CartFlight | null;
    return Boolean(
        flight
        && typeof flight.id === 'string'
        && DIRECTION_ORDER.includes(flight.direction)
        && Array.isArray(flight.legs)
        && flight.legs.length > 0
        && flight.estimate != null,
    );
};

const byDirection = (left: CartFlight, right: CartFlight): number => (
    DIRECTION_ORDER.indexOf(left.direction) - DIRECTION_ORDER.indexOf(right.direction)
);

export const loadCart = (): FlightCart => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        // Anything not shaped like a flight is dropped rather than rendered:
        // a half-parsed entry here would surface as a price in a total.
        return Array.isArray(parsed) ? parsed.filter(isCartFlight).sort(byDirection) : [];
    } catch {
        // Storage unavailable, or something else wrote to the key.
        return [];
    }
};

const persist = (cart: FlightCart): FlightCart => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
        // Private mode or a full quota: the cart simply does not outlive the tab.
    }
    return cart;
};

/**
 * Picks a flight for its direction, replacing whatever was there.
 *
 * A booking flow has one outbound and one return, so "select" means "this one
 * instead", never "one more" — the second half of a round trip is a different
 * direction, not a second item.
 */
export const selectFlight = (cart: FlightCart, flight: CartFlight): FlightCart => persist(
    [...cart.filter((entry) => entry.direction !== flight.direction), flight].sort(byDirection),
);

export const removeFlight = (cart: FlightCart, id: string): FlightCart => persist(
    cart.filter((entry) => entry.id !== id),
);

export const clearCart = (): FlightCart => persist([]);

const patch = (cart: FlightCart, id: string, change: Partial<CartFlight>): FlightCart => persist(
    cart.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
);

/**
 * Ticks a flight off as bought. Un-ticking drops the amount with it — an
 * "€63 paid" left behind on a flight nobody booked is a lie in the total.
 */
export const markBooked = (cart: FlightCart, id: string, booked: boolean): FlightCart => patch(
    cart,
    id,
    booked ? { booked } : { booked, paid: null, reference: null },
);

/** What the airline actually charged. null clears it back to the estimate. */
export const recordPaid = (cart: FlightCart, id: string, paid: number | null): FlightCart => patch(
    cart,
    id,
    { paid: paid != null && Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) / 100 : null },
);

export const recordReference = (cart: FlightCart, id: string, reference: string): FlightCart => patch(
    cart,
    id,
    { reference: reference.trim() || null },
);

/** The city an airport code stands for on this flight, if it was stored. */
export const cartCityFor = (flight: CartFlight, code?: string | null): string | undefined => {
    if (!code) return undefined;
    const upper = code.toUpperCase();
    for (const leg of flight.legs) {
        if (leg.origin.toUpperCase() === upper) return leg.originCity;
        if (leg.destination.toUpperCase() === upper) return leg.destinationCity;
    }
    return undefined;
};

export const flightFor = (cart: FlightCart, direction: CartDirection): CartFlight | null => (
    cart.find((entry) => entry.direction === direction) ?? null
);

// ── Totals ───────────────────────────────────────────────────────────────────

/**
 * The one number to show for a flight: what was paid if it has been bought,
 * otherwise the fare the airline is asking. Null means nothing is known — such
 * a flight sits in the cart but never in the total.
 *
 * The FARE rather than the all-in, so the trip total is comparable with what
 * the booking sites will charge; the all-in rides alongside it on the row,
 * which is where the bags and transfers are argued about.
 */
export const amountOf = (flight: CartFlight): number | null => (
    flight.paid ?? flight.estimate.fare ?? flight.estimate.honest ?? null
);

export interface CartTotals {
    count: number;
    bookedCount: number;
    /** Everything known, summed. */
    total: number;
    /** The part of the total that is money already spent. */
    paid: number;
    /** The part that is still somebody's estimate. */
    estimated: number;
    /** Flights carrying no price at all — the total is missing them. */
    unpricedCount: number;
    /** Every flight in the total was paid for: the number is exact. */
    allPaid: boolean;
    /**
     * Some unpaid amount is the day's route floor, which may belong to another
     * departure. The total is a floor too, and has to be labelled "from".
     */
    hasFloor: boolean;
}

export const cartTotals = (cart: FlightCart): CartTotals => {
    let total = 0;
    let paid = 0;
    let estimated = 0;
    let unpricedCount = 0;
    let hasFloor = false;
    let allPaid = cart.length > 0;

    for (const flight of cart) {
        const amount = amountOf(flight);
        if (amount == null) {
            unpricedCount += 1;
            allPaid = false;
            continue;
        }
        total += amount;
        if (flight.paid != null) {
            paid += amount;
        } else {
            estimated += amount;
            allPaid = false;
            if (flight.estimate.basis === 'floor' || flight.estimate.basis === 'unknown') {
                hasFloor = true;
            }
        }
    }

    const round = (value: number): number => Math.round(value * 100) / 100;
    return {
        count: cart.length,
        bookedCount: cart.filter((flight) => flight.booked).length,
        total: round(total),
        paid: round(paid),
        estimated: round(estimated),
        unpricedCount,
        allPaid,
        hasFloor,
    };
};
