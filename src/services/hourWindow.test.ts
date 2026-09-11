import { FULL_DAY, formatHour, isFullDay, withinWindow } from './hourWindow';

describe('hourWindow', () => {
    it('lets everything through until the window is narrowed', () => {
        expect(isFullDay(FULL_DAY)).toBe(true);
        expect(withinWindow(6 * 60, FULL_DAY)).toBe(true);
        // Including a flight whose time nothing could resolve: an untouched
        // filter is not a claim about anything.
        expect(withinWindow(null, FULL_DAY)).toBe(true);
    });

    it('holds both ends of a narrowed window', () => {
        const morning: [number, number] = [6, 12];
        expect(withinWindow(6 * 60, morning)).toBe(true);
        expect(withinWindow(12 * 60, morning)).toBe(true);
        expect(withinWindow(5 * 60 + 59, morning)).toBe(false);
        expect(withinWindow(12 * 60 + 1, morning)).toBe(false);
    });

    it('drops a flight whose time is unknown once the window means something', () => {
        // It cannot be shown to take off in the window, so it does not claim to.
        expect(withinWindow(null, [6, 12])).toBe(false);
    });

    it('writes the hours the way the slider label reads them', () => {
        expect(formatHour(0)).toBe('00:00');
        expect(formatHour(7)).toBe('07:00');
        expect(formatHour(24)).toBe('24:00');
    });
});
