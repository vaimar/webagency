// Fares the traveller saw with their own eyes.
//
// Ryanair legs price themselves from a free API; every other carrier needs the
// paid aggregator, so those legs show "?" and the journey has no total. But the
// person looking at the card has just clicked through to Iberia and can see the
// number — €148 — and that is better information than we have. This records it.
//
// Stored per LEG, not per itinerary, for the same reason the fetching is:
// one Madrid–Málaga hop is shared by a dozen routings, so a price entered once
// completes all of them.
//
// Kept in localStorage, on this device only. These are one person's sightings,
// not a price feed: never presented as a quoted fare, always attributed and
// dated, because a fare seen last week may be nothing like today's.

/**
 * v2: entries are keyed by the FLIGHT (route, date, carriers, departure), where
 * v1 keyed only route and date. A v1 entry can never be matched or removed
 * under the new scheme, so it is discarded once rather than left to sit in
 * storage forever. Nothing of value is lost — a sighting only counts for 24
 * hours, so anything still in v1 had already stopped counting.
 */
const STORAGE_KEY = 'travelhub.observedFares.v2';
const LEGACY_STORAGE_KEYS = ['travelhub.observedFares.v1'];

/**
 * How long a sighting is allowed to count.
 *
 * Airline pricing moves daily, and a sighting is one person's glance at one
 * moment. Left indefinite it does real damage: an entry from three weeks ago
 * still completes a journey total, and — worse — still excuses a leg Ryanair
 * now publishes no fare for, quietly keeping a route alive on the strength of
 * a fare that has expired. Kept SHORT for that reason. Expired entries are not
 * deleted, so the traveller can see what they typed and refresh it rather than
 * wondering where it went.
 */
export const OBSERVED_FARE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ObservedFare {
    /** What the traveller saw, in EUR. */
    price: number;
    /** ISO timestamp of when they entered it — a fare is only as good as its age. */
    savedAt: string;
}

export type ObservedFares = Record<string, ObservedFare>;

/** Is this sighting recent enough to count towards a price? */
export const isObservedFareFresh = (fare: ObservedFare | null | undefined, now: Date = new Date()): boolean => {
    if (!fare) {
        return false;
    }
    const savedAt = Date.parse(fare.savedAt);
    if (!Number.isFinite(savedAt)) {
        return false;
    }
    const age = now.getTime() - savedAt;
    // A clock that has gone backwards is not a fresh fare, it is a broken clock.
    return age >= 0 && age < OBSERVED_FARE_TTL_MS;
};

/**
 * The flight a sighting belongs to.
 *
 * Route and date are not enough. A hub pair like Madrid → Málaga is flown
 * several times a day by different airlines, and keying on the route alone made
 * one entered price appear on every one of them — a Vueling fare shown against
 * an Air Europa departure three hours later. What the traveller actually saw
 * was ONE flight, so the carrier and the departure time are part of its
 * identity.
 */
export interface ObservedFlight {
    origin: string;
    destination: string;
    /** The leg's own date, YYYY-MM-DD. */
    date: string;
    /** Operating carriers as the schedule lists them. */
    carriers?: string[] | null;
    /** Departure clock — what separates two flights on the same route and day. */
    departureTime?: string | null;
}

/** "HH:mm" out of "HH:mm:ss" or an ISO stamp; '' when there is no time. */
const clockOf = (value?: string | null): string => value?.match(/(?:^|T)(\d{2}:\d{2})/)?.[1] ?? '';

export const observedFareKey = (flight: ObservedFlight): string => [
    flight.origin.toUpperCase(),
    flight.destination.toUpperCase(),
    flight.date,
    // Sorted so a codeshare listed in a different order is still the same flight.
    (flight.carriers ?? []).map((code) => code.trim().toUpperCase()).sort().join('+'),
    clockOf(flight.departureTime),
].join('-');

export const loadObservedFares = (): ObservedFares => {
    try {
        for (const legacy of LEGACY_STORAGE_KEYS) {
            window.localStorage.removeItem(legacy);
        }
    } catch {
        // Storage unavailable — nothing to clean up.
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as ObservedFares;
        // Anything that is not a usable number is dropped rather than trusted:
        // a corrupted entry would otherwise surface as a confident price.
        //
        // EXPIRED ENTRIES ARE KEPT. They stop counting towards totals and stop
        // excusing a missing fare, but the traveller still needs to see what
        // they typed, labelled as spent, so they can refresh or remove it.
        // Deleting them here would make an entry silently disappear instead.
        return Object.fromEntries(
            Object.entries(parsed ?? {}).filter(([, fare]) => (
                fare && typeof fare.price === 'number' && Number.isFinite(fare.price) && fare.price > 0
            )),
        );
    } catch {
        return {};
    }
};

const persist = (fares: ObservedFares): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fares));
    } catch {
        // Storage unavailable (private mode) — the entry just won't outlive the tab.
    }
};

/** Records a sighting, replacing any earlier one for the same leg and day. */
export const saveObservedFare = (
    fares: ObservedFares,
    flight: ObservedFlight,
    price: number,
    now: Date = new Date(),
): ObservedFares => {
    if (!Number.isFinite(price) || price <= 0) {
        return fares;
    }
    const next = {
        ...fares,
        [observedFareKey(flight)]: {
            price: Math.round(price * 100) / 100,
            savedAt: now.toISOString(),
        },
    };
    persist(next);
    return next;
};

export const forgetObservedFare = (fares: ObservedFares, flight: ObservedFlight): ObservedFares => {
    const next = { ...fares };
    delete next[observedFareKey(flight)];
    persist(next);
    return next;
};

/**
 * "seen today", "expired — seen 6 days ago". How much to trust a fresh one is
 * the reader's call; an expired one has already stopped counting, and the label
 * has to say so rather than implying it is still in the total.
 */
export const describeFareAge = (savedAt: string, now: Date = new Date()): string => {
    const saved = Date.parse(savedAt);
    if (!Number.isFinite(saved)) {
        return 'saved earlier';
    }
    const days = Math.floor((now.getTime() - saved) / 86_400_000);
    const age = days <= 0 ? 'seen today' : days === 1 ? 'seen yesterday' : `seen ${days} days ago`;
    return isObservedFareFresh({ price: 0, savedAt }, now) ? age : `expired · ${age}`;
};

/**
 * Parses what someone typed into a fare.
 *
 * Accepts "148", "€148", "148,50" and "148.50" — people copy prices out of
 * booking sites in whatever shape the site wrote them, and rejecting a comma
 * would just look broken.
 */
export const parseFareInput = (value: string): number | null => {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
    if (!cleaned) {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};
