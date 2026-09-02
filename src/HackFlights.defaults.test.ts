import {
    CACHED_FARE_WINDOW_DAYS,
    DEFAULT_DEPARTURE_OFFSET_DAYS,
    defaultDepartureDate,
    defaultReturnDate,
} from './HackFlights';

/**
 * The free search reads Ryanair's cheapest-per-day cache, which only ever
 * covers the next ~13 days. The form used to default to today + 21 — always
 * past the end of that window — so the first search a visitor ever ran could
 * not match its own date and always degraded to "no cached fare departs exactly
 * on…". These lock the defaults inside the window.
 */

const daysBetween = (from: string, to: string): number => {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
};

const today = (): string => new Date().toISOString().slice(0, 10);

describe('hack flights default dates', () => {
    it('puts the default departure inside the cached fare window', () => {
        const offset = daysBetween(today(), defaultDepartureDate());

        expect(offset).toBeGreaterThan(0);
        expect(offset).toBeLessThan(CACHED_FARE_WINDOW_DAYS);
    });

    it('puts the default return inside the window too', () => {
        const departure = defaultDepartureDate();
        const offset = daysBetween(today(), defaultReturnDate(departure));

        // A round trip queries both legs against the same cache, so a return
        // that falls off the end is the same bug wearing a different hat.
        expect(offset).toBeLessThan(CACHED_FARE_WINDOW_DAYS);
    });

    it('leaves room for the return leg after the departure', () => {
        expect(DEFAULT_DEPARTURE_OFFSET_DAYS).toBeLessThan(CACHED_FARE_WINDOW_DAYS - 3);
    });

    it('returns ISO date-only strings', () => {
        expect(defaultDepartureDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(defaultReturnDate('2026-08-26')).toBe('2026-08-29');
    });
});
