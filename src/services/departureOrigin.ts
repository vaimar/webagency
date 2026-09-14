// The traveller's departure city, remembered across spot pages.
//
// This used to be `useState(DEPARTURES[0])` inside SpotDetailPage: local to one
// page, so picking an origin on one spot and clicking through to the next
// silently reset it. The reader either re-picked their home airport on every
// page, or — worse — did not notice and read Limerick fares believing they were
// their own.

export const DEPARTURES = [
    'Limerick, Ireland',
    'Dublin, Ireland',
    'Cork, Ireland',
    'Galway, Ireland',
] as const;

export type DepartureCity = typeof DEPARTURES[number];

/**
 * The cold-start default, for a reader who has never chosen.
 *
 * NOTE: it disagrees with the rest of the app — `LANDING_ORIGIN` in
 * `src/Home.tsx` and the fallback in `useFlightDestinations` are both Dublin,
 * and the beta-readiness evidence was measured from DUB. Persisting the choice
 * demotes this to a first-visit-only question, which is why it is left as it
 * was rather than changed in passing: which city a stranger sees first is a
 * product decision, and it is one line when someone wants to take it.
 */
export const DEFAULT_DEPARTURE: DepartureCity = DEPARTURES[0];

const STORAGE_KEY = 'travelhub.departureOrigin.v1';

/**
 * Anything not on the list becomes the default. The stored value is whatever a
 * previous build wrote, so a removed city or a hand-edited key must not be able
 * to put the page into a state where no option matches the select.
 */
export const normaliseDeparture = (value: string | null | undefined): DepartureCity => (
    DEPARTURES.includes(value as DepartureCity) ? (value as DepartureCity) : DEFAULT_DEPARTURE
);

export const loadDepartureOrigin = (): DepartureCity => {
    try {
        return normaliseDeparture(window.localStorage.getItem(STORAGE_KEY));
    } catch {
        // No storage (private mode, SSR) — the default is still a valid answer.
        return DEFAULT_DEPARTURE;
    }
};

export const saveDepartureOrigin = (city: string): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, normaliseDeparture(city));
    } catch {
        // Storage unavailable — the choice just will not outlive the tab.
    }
};
