// Client for the Route Hacker engine — schedule-only self-transfer itineraries
// assembled from the backend's local timetable graph (GET /api/trips/hacker-routes,
// zero paid API calls) plus on-demand live pricing (POST /api/trips/fetch-price).

import { AntiCauchemarAnalysis } from './api';
import { trackedFetch } from './serviceStatus';

export interface HackerFlightLeg {
    /** Every marketing carrier on the merged physical flight, e.g. ["IB","VY"]. */
    airlineCodes?: string[] | null;
    flightNumbers?: string[] | null;
    origin?: string | null;
    destination?: string | null;
    /**
     * LocalTime "HH:mm" or "HH:mm:ss", each in ITS OWN airport's zone — so the
     * two can be displayed but never subtracted from one another.
     */
    departureTime?: string | null;
    arrivalTime?: string | null;
    /** Local calendar date of this flight, YYYY-MM-DD, from the backend. */
    date?: string | null;
    /**
     * Real minutes in the air, computed by the backend where both zones are
     * known. Shannon → Alicante is 165 of these and 225 by the clock.
     */
    durationMinutes?: number | null;
}

/**
 * Airport reference the backend resolves from the full airport table — far
 * wider than the ~100 airports the frontend curates by hand, which is why it is
 * worth carrying: it lets a partner link be built for a hub nobody has written
 * metadata for yet.
 */
export interface AirportRef {
    iata: string;
    name?: string | null;
    /** e.g. "Ibiza (Eivissa)", "London, Essex" — a place, loosely punctuated. */
    municipality?: string | null;
    /** ISO 3166-1 alpha-2, e.g. "ES". */
    isoCountry?: string | null;
}

export type HackerItineraryType = 'DIRECT' | 'SELF_TRANSFER';

export interface HackerItinerary {
    type: HackerItineraryType;
    origin: string;
    /** null for a direct itinerary. */
    hub: string | null;
    destination: string;
    leg1: HackerFlightLeg;
    /** null for a direct itinerary. */
    leg2: HackerFlightLeg | null;
    originAirport?: AirportRef | null;
    /** null for a direct itinerary. */
    hubAirport?: AirportRef | null;
    destinationAirport?: AirportRef | null;
    layoverMinutes: number;
    totalJourneyMinutes: number;
    status: string;
    price?: number | null;
}

export interface HackerLegPrice {
    origin: string;
    destination: string;
    price: number | null;
    /**
     * ISO date-time of the flight this fare is actually for.
     *
     * Ryanair publishes one cheapest fare per route per day, so the price alone
     * cannot tell you whether it belongs to the flight on the card or to another
     * departure that day. Null when the price is an aggregate across flights.
     */
    departure?: string | null;
    /**
     * The honest-cost breakdown for this leg — fare plus the cabin bag and
     * airport transfer nobody quotes. Per LEG, because a self-transfer is two
     * separate tickets and so carries two of everything.
     */
    antiCauchemar?: AntiCauchemarAnalysis | null;
}

export interface HackerPriceResponse {
    leg1: HackerLegPrice;
    leg2: HackerLegPrice;
    combinedPrice: number | null;
    currency: string;
    status: 'PRICED' | 'PRICE_UNAVAILABLE' | string;
}

export const fetchHackerRoutes = async (
    origin: string,
    destination: string,
    date: string,
): Promise<HackerItinerary[]> => {
    const params = new URLSearchParams({ origin, destination, date });
    const response = await trackedFetch(`/api/trips/hacker-routes?${params.toString()}`);
    if (!response.ok) {
        throw new Error(`Hacker routes request failed with status ${response.status}`);
    }
    return (await response.json()) as HackerItinerary[];
};

/** "17:15:00" or an ISO stamp → "17:15"; null when there is no time to send. */
const clockOf = (value?: string | null): string | null => (
    value?.match(/(?:^|T)(\d{2}:\d{2})/)?.[1] ?? null
);

export const fetchHackerRoutePrice = async (
    itinerary: HackerItinerary,
    date: string,
): Promise<HackerPriceResponse> => {
    const response = await trackedFetch('/api/trips/fetch-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            leg1Origin: itinerary.leg1.origin,
            leg1Destination: itinerary.leg1.destination,
            // Direct itineraries have no second leg — the backend prices leg 1 alone.
            leg2Origin: itinerary.leg2?.origin ?? null,
            leg2Destination: itinerary.leg2?.destination ?? null,
            // Carriers let the backend price Ryanair legs directly from Ryanair.
            leg1Carriers: itinerary.leg1.airlineCodes ?? [],
            leg2Carriers: itinerary.leg2?.airlineCodes ?? [],
            // …and the clocks let it price the flights on this card rather
            // than whichever departure was cheapest that day.
            leg1DepartureTime: clockOf(itinerary.leg1.departureTime),
            leg2DepartureTime: clockOf(itinerary.leg2?.departureTime),
            date,
        }),
    });
    if (!response.ok) {
        throw new Error(`Price fetch failed with status ${response.status}`);
    }
    return (await response.json()) as HackerPriceResponse;
};

/**
 * How a fare lookup ended.
 *
 * `unpriced` and `error` are BOTH a null price and mean opposite things. The
 * feed answering "nothing on that date" is evidence a flight does not operate;
 * the request failing is evidence of nothing at all. Collapsing them let a
 * timeout delete a real itinerary, so they stay apart all the way to the caller.
 */
export type LegFareStatus = 'priced' | 'unpriced' | 'error';

/** A leg's fare, and the departure that fare is for. */
export interface LegFare {
    price: number | null;
    /** ISO date-time, or null when no single flight owns the price. */
    departure: string | null;
    antiCauchemar?: AntiCauchemarAnalysis | null;
    status: LegFareStatus;
    /**
     * When this answer came back — stamped on the way into the session memory,
     * absent on one that has just arrived from the API. It is what lets a card
     * say "price seen 14:20" instead of presenting an hour-old number as if it
     * had been fetched for this search. See `sessionFares`.
     */
    seenAt?: string;
}

/**
 * Price ONE leg on its own.
 *
 * The backend prices a whole itinerary, but passing no second leg makes it
 * price leg 1 alone — which is what lets the caller dedupe. A 27-itinerary
 * result is only ~13 distinct legs, because the same Shannon departure feeds a
 * dozen different hubs, so pricing legs instead of itineraries cuts the work by
 * three quarters and every itinerary sharing a leg gets it for free.
 */
export const fetchLegPrice = async (
    origin: string,
    destination: string,
    carriers: string[] | null | undefined,
    date: string,
    /**
     * The flight's own departure clock, "HH:mm". With it a Ryanair leg is
     * priced for THAT departure; without it the backend answers with the day's
     * cheapest, which on a twice-daily route is somebody else's flight.
     */
    departureTime?: string | null,
): Promise<LegFare> => {
    const response = await trackedFetch('/api/trips/fetch-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            leg1Origin: origin,
            leg1Destination: destination,
            leg2Origin: null,
            leg2Destination: null,
            leg1Carriers: carriers ?? [],
            leg2Carriers: [],
            leg1DepartureTime: departureTime ?? null,
            date,
        }),
    });
    if (!response.ok) {
        throw new Error(`Leg price fetch failed with status ${response.status}`);
    }
    const body = (await response.json()) as HackerPriceResponse;
    const price = body.leg1?.price ?? null;
    return {
        price,
        departure: body.leg1?.departure ?? null,
        antiCauchemar: body.leg1?.antiCauchemar ?? null,
        // The request came back, so a null price is the feed's answer rather
        // than our failure to ask.
        status: price === null ? 'unpriced' : 'priced',
    };
};
