import { euro, formatCents, formatClock, formatDuration, formatLocalClock, formatShortDate } from './flightFormat';

describe('flightFormat', () => {
    it('reduces any time it is handed to a wall clock', () => {
        expect(formatClock('19:00:00')).toBe('19:00');
        expect(formatClock('2026-09-06T06:35:00')).toBe('06:35');
        expect(formatClock(null)).toBe('—');
    });

    it('writes a duration the way a timetable does', () => {
        expect(formatDuration(870)).toBe('14h30');
        expect(formatDuration(180)).toBe('3h');
        // Not a span: an unknown duration must not read as an instant trip.
        expect(formatDuration(null)).toBe('—');
        expect(formatDuration(-5)).toBe('—');
    });

    it('puts a stored timestamp on the reader\'s own clock', () => {
        // Stamps are stored in UTC; a fare "seen at 13:20" that the reader saw
        // at 14:20 their time would look like someone else's price.
        const at = new Date(2026, 8, 10, 14, 20);
        expect(formatLocalClock(at.toISOString())).toBe('14:20');
        expect(formatLocalClock(null)).toBe('—');
        expect(formatLocalClock('not a date')).toBe('—');
    });

    it('rounds fares to whole euros — cents are noise when comparing', () => {
        expect(euro(26.5)).toBe('€27');
        expect(euro(1234)).toBe('€1,234');
    });
});

// Criteria 13 and 34 of docs/specs/combined-trip-total.md (rev 4.1).
describe('formatCents (C34)', () => {
    it.each([
        [54965, 'EUR', '€549.65'],
        [2080, 'eur', '€20.80'],
        [123456, 'EUR', '€1,234.56'],
        [15000, 'GBP', '£150.00'],
        [2080, '', '€20.80'],
    ])('formatCents(%s, %j) is %s', (cents, currency, expected) => {
        expect(formatCents(cents, currency)).toBe(expected);
    });

    it('falls back to "amount CODE" for a malformed currency code instead of throwing', () => {
        expect(() => formatCents(2080, 'EURO')).not.toThrow();
        expect(formatCents(2080, 'EURO')).toBe('20.80 EURO');
    });

    it('leaves the flight cart formatter on whole euros', () => {
        expect(euro(49.99)).toBe('€50');
    });
});

describe('formatShortDate (C13)', () => {
    /** Runs `check` with the process clock in `zone`, then restores the original zone. */
    const inTimeZone = (zone: string, check: () => void): void => {
        const original = process.env.TZ;
        process.env.TZ = zone;
        try {
            check();
        } finally {
            if (original === undefined) delete process.env.TZ;
            else process.env.TZ = original;
        }
    };

    it('writes a departure as "Sat 3 Oct", built by hand with no comma', () => {
        expect(formatShortDate('2026-10-03T07:00:00')).toBe('Sat 3 Oct');
    });

    it('reads a bare date as that calendar day', () => {
        expect(formatShortDate('2026-10-03')).toBe('Sat 3 Oct');
    });

    it('keeps a bare date on its own day west of UTC, where Date.parse would make it the day before', () => {
        inTimeZone('America/Los_Angeles', () => {
            expect(formatShortDate('2026-10-03')).toBe('Sat 3 Oct');
            expect(formatShortDate('2026-10-03T07:00:00')).toBe('Sat 3 Oct');
        });
    });

    it('returns null for a missing or unreadable date', () => {
        expect(formatShortDate(null)).toBeNull();
        expect(formatShortDate(undefined)).toBeNull();
        expect(formatShortDate('')).toBeNull();
        expect(formatShortDate('not a date')).toBeNull();
    });
});
