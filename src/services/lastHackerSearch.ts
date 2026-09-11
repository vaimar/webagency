// The last Route Hacker search, so coming back to the page is coming back to
// where you were.
//
// The trip cart outliving the tab is exactly what made this necessary: someone
// returning to a half-booked trip found their flights still listed and the
// results they were picked from gone. "Change" then had a step to move to and
// no list to move it to, and the search bar had reset to its defaults — the
// question that produced the trip was the one thing not saved with it.
//
// Re-running it costs nothing that matters: the routes come from the local
// schedule graph and the Ryanair legs price from a free API, which is what the
// Route Hacker tab does on every mount anyway. The billed path is not on this
// journey at all.

// The traveller's own day, not UTC's — the same rule, and the same helper, the
// session fare memory expires on.
import { localDay } from './sessionFares';

const STORAGE_KEY = 'travelhub.hackerSearch.v1';

export interface RememberedSearch {
    origin: string;
    destination: string;
    departureDate: string;
    /** Kept even on a one-way search, so switching back does not lose it. */
    returnDate: string;
    isOneWay: boolean;
}

const isDate = (value: unknown): value is string => (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const isSearch = (value: unknown): value is RememberedSearch => {
    const search = value as RememberedSearch | null;
    return Boolean(
        search
        && typeof search.origin === 'string' && search.origin.length > 0
        && typeof search.destination === 'string' && search.destination.length > 0
        && isDate(search.departureDate)
        && isDate(search.returnDate)
        && typeof search.isOneWay === 'boolean',
    );
};

export const forgetHackerSearch = (): void => {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable — nothing to clean up.
    }
};

export const rememberHackerSearch = (search: RememberedSearch): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(search));
    } catch {
        // Private mode or a full quota: the search simply does not outlive the tab.
    }
};

/**
 * The last search — unless it has already flown.
 *
 * Restoring a departure date in the past would re-run a query that can only
 * come back empty, and greet someone with "no routes for 2026-09-06" for a
 * search they ran weeks ago. A dead search is dropped rather than restored, so
 * the page falls back to its normal defaults.
 */
export const recallHackerSearch = (now: Date = new Date()): RememberedSearch | null => {
    let parsed: unknown;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        parsed = JSON.parse(raw);
    } catch {
        // Storage unavailable, or something else wrote to the key.
        return null;
    }
    if (!isSearch(parsed)) {
        forgetHackerSearch();
        return null;
    }
    if (parsed.departureDate < localDay(now)) {
        forgetHackerSearch();
        return null;
    }
    return parsed;
};
