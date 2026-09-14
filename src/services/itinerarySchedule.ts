// Which DAY each flight of a hacker itinerary happens on, and how long it is.
//
// A leg 2 leaving at 06:35 after a leg 1 landing at 20:30 is tomorrow morning,
// and shown as a bare clock time it reads as a flight you have already missed.
// So every leg is resolved to a real calendar date.
//
// TIMEZONES. Each clock time is local to its own airport, which means the two
// cannot be subtracted: Shannon 08:25 → Alicante 12:10 is 2h45 in the air, not
// the 3h45 the clocks say, because Spain is an hour ahead. This module used to
// derive both the dates and the durations arithmetically from those clocks and
// got the phantom hour wrong in both — an Ibiza → Madrid leg came out as 20
// minutes. The backend knows every airport's zone, so it now sends each leg's
// date and real duration, and they are used in preference to anything derived
// here. The derivation survives only as a fallback for a leg that arrives
// without them.

import { clockMinutes } from './hackFlightSort';
import { HackerItinerary } from './hackerRoutes';

const MINUTES_PER_DAY = 1440;

/** Pushes `end` past `start` a day at a time — a clock that goes backwards has wrapped midnight. */
const forwardFrom = (start: number, end: number): number => (
    end >= start ? end : end + Math.ceil((start - end) / MINUTES_PER_DAY) * MINUTES_PER_DAY
);

export interface ScheduledPoint {
    /** "HH:mm" as flown. */
    clock: string;
    /** Calendar date, YYYY-MM-DD. */
    date: string;
    /** Whole days after the search date: 0 = the day you set out, 1 = tomorrow. */
    dayOffset: number;
}

export interface LegSchedule {
    departure: ScheduledPoint | null;
    arrival: ScheduledPoint | null;
    /**
     * How long this flight is, in minutes.
     *
     * Taken from the resolved times rather than the clock, so a leg that lands
     * after midnight measures as the hour and a half it is instead of the
     * twenty-two hours the clock difference would suggest.
     */
    durationMinutes: number | null;
}

export interface ItinerarySchedule {
    leg1: LegSchedule;
    leg2: LegSchedule | null;
}

/** Adds whole days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
export const addDays = (date: string, days: number): string => {
    const base = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(base)) return date;
    return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
};

/** Minutes between two resolved points, or null if either is unknown. */
const spanOf = (from: number | null, to: number | null): number | null => (
    from === null || to === null || to < from ? null : to - from
);

const point = (baseDate: string, minutes: number | null): ScheduledPoint | null => {
    if (minutes === null) return null;
    const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
    const inDay = minutes - dayOffset * MINUTES_PER_DAY;
    const clock = `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
    return { clock, date: addDays(baseDate, dayOffset), dayOffset };
};

/**
 * Resolves an itinerary's clock times to dates, counting from the search date.
 *
 * Leg 2 is placed by the backend's own numbers rather than by its clock: its
 * departure is leg 1's landing plus the stated layover, and its arrival is the
 * departure plus the stated total journey. That keeps the dates on the card and
 * the "9h layover · total journey 13h25" line telling the same story.
 */
/** Whole days from the search date to this leg's own date. */
const offsetFromBase = (baseDate: string, legDate: string): number => {
    const from = Date.parse(`${baseDate}T00:00:00Z`);
    const to = Date.parse(`${legDate}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        return 0;
    }
    return Math.round((to - from) / 86_400_000);
};

/**
 * A leg placed by the backend's own date and duration.
 *
 * Returns null when the backend did not supply them, leaving the caller to fall
 * back to deriving — which is only correct within a single timezone.
 */
const scheduleFromBackend = (leg: HackerItinerary['leg1'], baseDate: string): LegSchedule | null => {
    if (!leg.date) {
        return null;
    }
    const dayOffset = offsetFromBase(baseDate, leg.date);
    const at = (clock: number | null): ScheduledPoint | null => {
        if (clock === null) return null;
        return {
            clock: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
            date: leg.date as string,
            dayOffset,
        };
    };
    return {
        departure: at(clockMinutes(leg.departureTime)),
        // Upstream filters out legs that cross midnight, so an arrival shares
        // its departure's calendar day.
        arrival: at(clockMinutes(leg.arrivalTime)),
        durationMinutes: typeof leg.durationMinutes === 'number' && leg.durationMinutes >= 0
            ? leg.durationMinutes
            : null,
    };
};

export const itinerarySchedule = (itinerary: HackerItinerary, baseDate: string): ItinerarySchedule => {
    const leg1Departure = clockMinutes(itinerary.leg1.departureTime);
    const leg1Clock = clockMinutes(itinerary.leg1.arrivalTime);
    const leg1Arrival = leg1Departure !== null && leg1Clock !== null
        ? forwardFrom(leg1Departure, leg1Clock)
        : leg1Clock;

    const leg1: LegSchedule = scheduleFromBackend(itinerary.leg1, baseDate) ?? {
        departure: point(baseDate, leg1Departure),
        arrival: point(baseDate, leg1Arrival),
        durationMinutes: spanOf(leg1Departure, leg1Arrival),
    };

    if (!itinerary.leg2) {
        return { leg1, leg2: null };
    }

    const leg2FromBackend = scheduleFromBackend(itinerary.leg2, baseDate);
    if (leg2FromBackend) {
        return { leg1, leg2: leg2FromBackend };
    }

    const layover = Number.isFinite(itinerary.layoverMinutes) ? itinerary.layoverMinutes : null;
    const leg2Departure = leg1Arrival !== null && layover !== null
        ? leg1Arrival + layover
        : clockMinutes(itinerary.leg2.departureTime);

    const total = Number.isFinite(itinerary.totalJourneyMinutes) ? itinerary.totalJourneyMinutes : null;
    const fromTotal = leg1Departure !== null && total !== null ? leg1Departure + total : null;
    const leg2Clock = clockMinutes(itinerary.leg2.arrivalTime);
    // The total is the trustworthy figure; fall back to walking the clock
    // forward from leg 2's departure only when it is missing or nonsensical.
    const leg2Arrival = fromTotal !== null && (leg2Departure === null || fromTotal >= leg2Departure)
        ? fromTotal
        : (leg2Departure !== null && leg2Clock !== null ? forwardFrom(leg2Departure, leg2Clock) : leg2Clock);

    return {
        leg1,
        leg2: {
            departure: point(baseDate, leg2Departure),
            arrival: point(baseDate, leg2Arrival),
            durationMinutes: spanOf(leg2Departure, leg2Arrival),
        },
    };
};

/** "Sun 6 Sep" — short enough to sit on one line beside the times.
 *
 * Spelled out from fixed tables rather than toLocaleDateString: the runtime's
 * locale data drifts ("Sept" vs "Sep", a comma or not) and the rest of the page
 * is written in one voice, not the browser's.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatLegDate = (date: string): string => {
    const parsed = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed)) return date;
    const day = new Date(parsed);
    return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
};
