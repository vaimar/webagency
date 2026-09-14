import { euro, formatClock, formatDuration, formatLocalClock } from './flightFormat';

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
