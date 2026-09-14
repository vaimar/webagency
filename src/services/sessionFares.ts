// Fares this tab has already fetched today.
//
// Every mount of a results block prices its legs from scratch — switching to
// Live deals and back, re-running the same search, or reloading the page all
// threw away a dozen answers and asked for them again. The numbers had been on
// screen a moment earlier, so the second ask told nobody anything new.
//
// Kept in sessionStorage: this is a convenience for one sitting, not a price
// history. It dies with the tab, and it is thrown away the moment the calendar
// day turns over, because "the fare I saw today" is the most anyone should read
// into a remembered number — see `describeFareAge` in observedFares for the
// same rule applied to sightings the traveller typed in themselves.

import { LegFare, LegFareStatus } from './hackerRoutes';

const STORAGE_KEY = 'travelhub.sessionFares.v1';

/** A fare, plus when it came back. */
export interface RememberedFare extends LegFare {
    /** ISO timestamp of the moment this answer arrived. */
    seenAt: string;
}

export type RememberedFares = Record<string, RememberedFare>;

interface FareMemory {
    /** Local calendar day these were seen on, YYYY-MM-DD. */
    day: string;
    fares: RememberedFares;
}

/**
 * The traveller's own day, not UTC's.
 *
 * Someone searching at 00:30 in Dublin is on a different UTC date than the one
 * on their clock, and a memory that expired an hour before midnight — or an
 * hour after it — would look like a bug either way.
 */
export const localDay = (now: Date = new Date()): string => [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
].join('-');

/**
 * A failed lookup is not an answer.
 *
 * `unpriced` IS one — it is the fare feed saying it publishes nothing for that
 * route on that date, which is the evidence the list uses to hide flights that
 * do not operate. `error` is our request falling over, and remembering it would
 * freeze a momentary outage in place for the rest of the day.
 */
const worthKeeping = (status: LegFareStatus): boolean => status !== 'error';

const read = (): FareMemory | null => {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as FareMemory) : null;
    } catch {
        // Storage unavailable, or something else wrote nonsense to the key.
        return null;
    }
};

const write = (memory: FareMemory): void => {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch {
        // Private mode, or the quota is full. The fares simply do not outlive
        // this page — everything above still works, it just asks again.
    }
};

const forget = (): void => {
    try {
        window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to clean up.
    }
};

/** Everything seen today, or nothing at all once the day has turned over. */
export const recallSessionFares = (now: Date = new Date()): RememberedFares => {
    const memory = read();
    if (!memory || memory.day !== localDay(now)) {
        if (memory) forget();
        return {};
    }
    // A corrupted entry would surface as a confident price, so anything that is
    // not shaped like a fare is dropped rather than trusted.
    return Object.fromEntries(
        Object.entries(memory.fares ?? {}).filter(([, fare]) => (
            fare
            && typeof fare.seenAt === 'string'
            && (fare.price === null || (typeof fare.price === 'number' && Number.isFinite(fare.price)))
        )),
    );
};

/**
 * Files fares under the keys they were fetched with, and hands back everything
 * known today — so the caller can seed its state from one call.
 */
export const rememberSessionFares = (
    fares: Record<string, LegFare>,
    now: Date = new Date(),
): RememberedFares => {
    const seenAt = now.toISOString();
    const next: RememberedFares = { ...recallSessionFares(now) };
    for (const [key, fare] of Object.entries(fares)) {
        if (!worthKeeping(fare.status)) {
            continue;
        }
        next[key] = { ...fare, seenAt };
    }
    write({ day: localDay(now), fares: next });
    return next;
};

/**
 * Old enough to be worth saying out loud.
 *
 * A fare fetched seconds ago needs no timestamp — it is what the page just did.
 * One from earlier in the sitting is a remembered number, and the card should
 * say when it was true.
 */
export const SESSION_FARE_QUIET_MS = 5 * 60 * 1000;

export const isRecentlySeen = (seenAt?: string | null, now: Date = new Date()): boolean => {
    const at = seenAt ? Date.parse(seenAt) : NaN;
    if (!Number.isFinite(at)) {
        return false;
    }
    const age = now.getTime() - at;
    return age >= 0 && age < SESSION_FARE_QUIET_MS;
};
