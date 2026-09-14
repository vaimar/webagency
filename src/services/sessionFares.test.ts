import {
    isRecentlySeen,
    localDay,
    recallSessionFares,
    rememberSessionFares,
} from './sessionFares';
import { LegFare } from './hackerRoutes';

const priced = (price: number): LegFare => ({ price, departure: null, status: 'priced' });

describe('sessionFares', () => {
    beforeEach(() => window.sessionStorage.clear());

    it('hands back a fare it was given, stamped with when it arrived', () => {
        const now = new Date('2026-09-10T09:15:00Z');
        rememberSessionFares({ 'SNN-AGP-2026-09-12': priced(47) }, now);

        const recalled = recallSessionFares(now);
        expect(recalled['SNN-AGP-2026-09-12'].price).toBe(47);
        expect(recalled['SNN-AGP-2026-09-12'].seenAt).toBe(now.toISOString());
    });

    it('adds to what it already holds instead of replacing it', () => {
        const now = new Date('2026-09-10T09:15:00Z');
        rememberSessionFares({ 'SNN-STN-2026-09-12': priced(15) }, now);
        rememberSessionFares({ 'STN-AGP-2026-09-12': priced(32) }, now);

        expect(Object.keys(recallSessionFares(now)).sort())
            .toEqual(['SNN-STN-2026-09-12', 'STN-AGP-2026-09-12']);
    });

    it('keeps the feed saying "no fare on that date" — that is an answer', () => {
        // It is the evidence the list uses to hide flights that do not operate,
        // so losing it would put phantom routes back on screen.
        const now = new Date('2026-09-10T09:15:00Z');
        rememberSessionFares(
            { 'SNN-AGP-2026-09-12': { price: null, departure: null, status: 'unpriced' } },
            now,
        );

        expect(recallSessionFares(now)['SNN-AGP-2026-09-12'].status).toBe('unpriced');
    });

    it('refuses to remember a failed lookup', () => {
        // A momentary outage must not be frozen in place for the rest of the day.
        const now = new Date('2026-09-10T09:15:00Z');
        rememberSessionFares(
            { 'SNN-AGP-2026-09-12': { price: null, departure: null, status: 'error' } },
            now,
        );

        expect(recallSessionFares(now)).toEqual({});
    });

    it('forgets everything once the day has turned over', () => {
        const yesterday = new Date('2026-09-10T22:00:00');
        rememberSessionFares({ 'SNN-AGP-2026-09-12': priced(47) }, yesterday);

        // "The fare I saw today" is the most anyone should read into a
        // remembered number.
        expect(recallSessionFares(new Date('2026-09-11T08:00:00'))).toEqual({});
        // And it is dropped rather than left to sit in storage.
        expect(window.sessionStorage.getItem('travelhub.sessionFares.v1')).toBeNull();
    });

    it('reads the day off the traveller\'s clock, not UTC', () => {
        // 00:30 local in Dublin is still the 11th in UTC terms on some dates;
        // a memory that expired an hour either side of midnight looks broken.
        expect(localDay(new Date(2026, 8, 10, 0, 30))).toBe('2026-09-10');
        expect(localDay(new Date(2026, 8, 10, 23, 45))).toBe('2026-09-10');
    });

    it('treats a fare from moments ago as needing no timestamp', () => {
        const now = new Date('2026-09-10T09:15:00Z');
        expect(isRecentlySeen(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(true);
        expect(isRecentlySeen(new Date(now.getTime() - 40 * 60_000).toISOString(), now)).toBe(false);
        expect(isRecentlySeen(null, now)).toBe(false);
    });
});
