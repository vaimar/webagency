import { describe, expect, it } from 'vitest';
import { addDaysToDateOnly, nextScheduleProbeDate, normalizeTripDates } from './routeSearchDates';

describe('addDaysToDateOnly', () => {
    it('crosses a month boundary', () => {
        expect(addDaysToDateOnly('2026-01-30', 3)).toBe('2026-02-02');
    });

    it('leaves anything that is not a date-only string alone', () => {
        expect(addDaysToDateOnly('not-a-date', 3)).toBe('not-a-date');
    });
});

describe('normalizeTripDates', () => {
    it('pushes a return that is not after the departure', () => {
        expect(normalizeTripDates('2026-05-10', '2026-05-10')).toEqual({
            departureDate: '2026-05-10',
            returnDate: '2026-05-11',
        });
    });
});

describe('nextScheduleProbeDate', () => {
    const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

    it('always lands on a Saturday', () => {
        // Every weekday of one week, so no starting day is left untested.
        for (let offset = 0; offset < 7; offset += 1) {
            const from = new Date(Date.UTC(2026, 8, 1 + offset));
            expect(dayOfWeek(nextScheduleProbeDate(from))).toBe(6);
        }
    });

    it('is at least four weeks out, and never more than five', () => {
        const from = new Date(Date.UTC(2026, 8, 3));
        const probe = nextScheduleProbeDate(from);
        const days = (Date.parse(`${probe}T00:00:00Z`) - from.getTime()) / 86_400_000;
        expect(days).toBeGreaterThanOrEqual(28);
        expect(days).toBeLessThanOrEqual(34);
    });

    it('does not advance past a base date that is already a Saturday', () => {
        // 2026-09-04 + 28 = 2026-10-02, a Friday; from the 5th it is a Saturday.
        const from = new Date(Date.UTC(2026, 8, 5));
        expect(nextScheduleProbeDate(from)).toBe('2026-10-03');
    });
});
