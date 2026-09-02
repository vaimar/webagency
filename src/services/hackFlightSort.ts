// Ordering for the two Hack Flights result sets — cached Ryanair fares and
// schedule-graph hacker itineraries.
//
// Both lists arrive from the backend in one fixed order (cheapest-ish), which
// is only ever the right answer for one of the questions people actually ask:
// "what lands before dinner?", "what leaves after work?", "what is quickest?".
// The comparators live here, away from the view, so they can be tested and so
// both tabs order by the same rules.
//
// Unknown values always sort LAST, whichever key is active: a fare with no
// arrival stamp is not "the earliest landing", it is simply unknown, and
// floating it to the top would be a lie the visitor cannot see.

import { getComparableFlightPrice } from './antiCauchemarPricing';
import { FlightAvailable } from './api';
import { HackerItinerary } from './hackerRoutes';

export type FlightSortKey = 'cheapest' | 'departure' | 'arrival' | 'duration';

export const FLIGHT_SORT_OPTIONS: { key: FlightSortKey; label: string }[] = [
    { key: 'cheapest', label: 'Cheapest' },
    { key: 'departure', label: 'Take-off time' },
    { key: 'arrival', label: 'Landing time' },
    { key: 'duration', label: 'Shortest trip' },
];

/** Ascending, with nulls pushed to the end instead of sorting as 0. */
export const compareUnknownsLast = (left: number | null, right: number | null): number => {
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
};

/** "HH:mm", "HH:mm:ss" or an ISO date-time → minutes since midnight. */
export const clockMinutes = (value?: string | null): number | null => {
    const match = value?.match(/(?:^|T)(\d{2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

/** ISO date or date-time → epoch millis, or null when it does not parse. */
export const timestampOf = (value?: string | null): number | null => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};

// ── Cached fares ─────────────────────────────────────────────────────────────

const fareDeparture = (flight: FlightAvailable): number | null => (
    timestampOf(flight.departureDate ?? flight.departureTime)
);

const fareArrival = (flight: FlightAvailable): number | null => (
    timestampOf(flight.arrivalDate ?? flight.arrivalTime)
);

const fareDuration = (flight: FlightAvailable): number | null => {
    const from = fareDeparture(flight);
    const to = fareArrival(flight);
    if (from === null || to === null || to <= from) return null;
    return to - from;
};

/**
 * Sorted copy of a leg's cached fares. `cheapest` uses the honest price
 * (fare + mandatory shuttle + cabin bag), the same number the cards show, so
 * the ranking and the prices on screen can never disagree.
 */
export const sortCachedFares = (flights: FlightAvailable[], key: FlightSortKey): FlightAvailable[] => {
    const value = (flight: FlightAvailable): number | null => {
        switch (key) {
            case 'departure': return fareDeparture(flight);
            case 'arrival': return fareArrival(flight);
            case 'duration': return fareDuration(flight);
            case 'cheapest':
            default: return getComparableFlightPrice(flight.price, flight.antiCauchemar);
        }
    };
    return [...flights].sort((left, right) => compareUnknownsLast(value(left), value(right)));
};

// ── Hacker itineraries ───────────────────────────────────────────────────────

export interface HackerSortRow {
    itinerary: HackerItinerary;
    /** Live fare once the card has fetched one; null while unpriced. */
    price: number | null;
}

const itineraryDeparture = (itinerary: HackerItinerary): number | null => (
    clockMinutes(itinerary.leg1.departureTime)
);

/** Whole days between two YYYY-MM-DD dates, or 0 if either is unreadable. */
const daysBetween = (from?: string | null, to?: string | null): number => {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : 0;
};

/**
 * Landing time of the LAST leg, for ordering.
 *
 * The final leg's own clock, pushed forward by however many days later it flies
 * — so a self-transfer landing at 07:45 tomorrow sorts after one landing at
 * 21:00 tonight instead of jumping to the top.
 *
 * It used to be departure + total journey, which silently mixed a local clock
 * with real elapsed minutes and drifted by the timezone offset on any route
 * that crossed one. Every itinerary in a list departs on the same day, so
 * measuring from leg 1's date keeps the comparison valid without needing to
 * know the search date.
 */
const itineraryArrival = (itinerary: HackerItinerary): number | null => {
    const lastLeg = itinerary.leg2 ?? itinerary.leg1;
    const arrivalClock = clockMinutes(lastLeg.arrivalTime);
    if (arrivalClock !== null && itinerary.leg1.date && lastLeg.date) {
        return daysBetween(itinerary.leg1.date, lastLeg.date) * 1440 + arrivalClock;
    }
    // No dates on the legs: fall back to the old derivation, which is right
    // whenever the whole journey stays inside one timezone.
    const departure = itineraryDeparture(itinerary);
    if (departure !== null && Number.isFinite(itinerary.totalJourneyMinutes) && itinerary.totalJourneyMinutes >= 0) {
        return departure + itinerary.totalJourneyMinutes;
    }
    return arrivalClock;
};

const itineraryDuration = (itinerary: HackerItinerary): number | null => (
    Number.isFinite(itinerary.totalJourneyMinutes) && itinerary.totalJourneyMinutes >= 0
        ? itinerary.totalJourneyMinutes
        : null
);

/**
 * Sorted copy of the hacker rows. Hacker prices are fetched per card on demand,
 * so `cheapest` ranks whatever has been priced and leaves the rest below it —
 * see `hasKnownPrice` for the caller's hint about that.
 */
export const sortHackerRows = <T extends HackerSortRow>(rows: T[], key: FlightSortKey): T[] => {
    const value = (row: T): number | null => {
        switch (key) {
            case 'departure': return itineraryDeparture(row.itinerary);
            case 'arrival': return itineraryArrival(row.itinerary);
            case 'duration': return itineraryDuration(row.itinerary);
            case 'cheapest':
            default: return row.price;
        }
    };
    return [...rows].sort((left, right) => compareUnknownsLast(value(left), value(right)));
};

export const hasKnownPrice = (rows: HackerSortRow[]): boolean => rows.some((row) => row.price !== null);
