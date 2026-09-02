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

const STORAGE_KEY = 'travelhub.observedFares.v1';

export interface ObservedFare {
    /** What the traveller saw, in EUR. */
    price: number;
    /** ISO timestamp of when they entered it — a fare is only as good as its age. */
    savedAt: string;
}

export type ObservedFares = Record<string, ObservedFare>;

/** Same shape as the fetched-price key: a fare belongs to a route on a day. */
export const observedFareKey = (origin: string, destination: string, date: string): string => (
    `${origin.toUpperCase()}-${destination.toUpperCase()}-${date}`
);

export const loadObservedFares = (): ObservedFares => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as ObservedFares;
        // Anything that is not a usable number is dropped rather than trusted:
        // a corrupted entry would otherwise surface as a confident price.
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
    origin: string,
    destination: string,
    date: string,
    price: number,
    now: Date = new Date(),
): ObservedFares => {
    if (!Number.isFinite(price) || price <= 0) {
        return fares;
    }
    const next = {
        ...fares,
        [observedFareKey(origin, destination, date)]: {
            price: Math.round(price * 100) / 100,
            savedAt: now.toISOString(),
        },
    };
    persist(next);
    return next;
};

export const forgetObservedFare = (
    fares: ObservedFares,
    origin: string,
    destination: string,
    date: string,
): ObservedFares => {
    const next = { ...fares };
    delete next[observedFareKey(origin, destination, date)];
    persist(next);
    return next;
};

/** "today", "yesterday", "6 days ago" — how much to trust it is the reader's call. */
export const describeFareAge = (savedAt: string, now: Date = new Date()): string => {
    const saved = Date.parse(savedAt);
    if (!Number.isFinite(saved)) {
        return 'saved earlier';
    }
    const days = Math.floor((now.getTime() - saved) / 86_400_000);
    if (days <= 0) return 'seen today';
    if (days === 1) return 'seen yesterday';
    return `seen ${days} days ago`;
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
