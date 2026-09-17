/**
 * T2, service half — docs/specs/sncf-rail-ways-in.md criterion 23, plus the
 * request shape `fetchRailWaysIn` owes criterion 33.
 *
 * Criterion 23's vectors are rev 5's, taken from R0's captured body: there is no
 * `TER` leg on this route (the regional brand is `Aléop P30 857065`), and the
 * single change at Le Mans is 170 minutes, which `waitText` renders as `2h50`
 * rather than letting a two-hour-fifty platform wait read as a small number.
 *
 * `formatDistanceKm` is pinned here at frontend's request: it is the single
 * source for both the station line and the alighting lines, so a regression in
 * it would move two strings at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RailLeg } from './railWaysIn';
import {
    alightingLabel,
    changeMinutes,
    changesText,
    fetchRailWaysIn,
    formatDistanceKm,
    legName,
    waitText,
} from './railWaysIn';
import { arnageOption, leMansOption, railEnvelope, v1Journey } from './railWaysIn.fixtures';

/** The response shape trackedFetch reads: ok, status, statusText, headers, json, text. */
const stubResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
});

/** A leg with only the fields these helpers read. */
const leg = (over: Partial<RailLeg>): RailLeg => ({
    ...v1Journey().legs[0],
    ...over,
});

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('changesText (C23)', () => {
    it('names a direct train rather than counting zero changes', () => {
        expect(changesText(0)).toBe('Direct');
    });

    it('is singular at one and plural above it', () => {
        expect(changesText(1)).toBe('1 change');
        expect(changesText(2)).toBe('2 changes');
        expect(changesText(3)).toBe('3 changes');
    });
});

describe('legName (C23)', () => {
    it('reads V1 leg 1 as its brand and train number, with no line segment', () => {
        // The captured leg's `code` is '' → line null, headsign 5210.
        expect(legName(v1Journey().legs[0])).toBe('TGV INOUI 5210');
    });

    it('reads V1 leg 2 as brand, line and number — the real regional train', () => {
        // Aléop, not TER: no TER-branded leg exists in the captured answer.
        expect(legName(v1Journey().legs[1])).toBe('Aléop P30 857065');
    });

    it('drops the parts the provider did not send, leaving just the mode', () => {
        expect(legName(leg({ mode: 'OUIGO', line: null, trainNumber: null }))).toBe('OUIGO');
    });

    it('does not leave a trailing space when the provider sends an empty code', () => {
        // Navitia sends display_informations.code as "" rather than omitting it.
        expect(legName(leg({ mode: 'OUIGO', line: '', trainNumber: null }))).toBe('OUIGO');
    });
});

describe('changeMinutes (C23)', () => {
    it('gives 170 for V1s single change, Le Mans 10:30 to 13:20', () => {
        const [tgv, aleop] = v1Journey().legs;
        expect(changeMinutes(tgv, aleop)).toBe(170);
    });

    it('subtracts across the offset rather than the reader clock', () => {
        // 13:20+02:00 is 11:20Z. Comparing wall-clock text alone would read 50.
        const [tgv] = v1Journey().legs;
        expect(changeMinutes(tgv, leg({ departure: '2026-10-03T11:20:00Z' }))).toBe(170);
    });

    it('is a whole number even when the provider sends seconds', () => {
        const arrive = leg({ arrival: '2026-10-03T10:30:20+02:00' });
        const depart = leg({ departure: '2026-10-03T10:47:10+02:00' });
        expect(changeMinutes(arrive, depart)).toBe(17);
    });
});

describe('waitText (C23)', () => {
    it('says a short wait in minutes', () => {
        expect(waitText(17)).toBe('17 min');
        expect(waitText(89)).toBe('89 min');
    });

    it('switches to hours at 90, inclusive', () => {
        // The boundary is the whole point: 89 is a gap, 90 is an errand.
        expect(waitText(90)).toBe('1h30');
    });

    it('says V1s real Le Mans wait as 2h50, not 170 min', () => {
        expect(waitText(170)).toBe('2h50');
    });
});

describe('formatDistanceKm (C23, C24, C46)', () => {
    it('drops a trailing .0 so the same station reads one way everywhere', () => {
        expect(formatDistanceKm(2.0)).toBe('2');
    });

    it('keeps a real decimal', () => {
        expect(formatDistanceKm(7.2)).toBe('7.2');
    });

    it('rounds to one decimal', () => {
        expect(formatDistanceKm(1.9506)).toBe('2');
        expect(formatDistanceKm(7.249)).toBe('7.2');
    });
});

describe('alightingLabel (C23)', () => {
    it('offers the earlier, farther station as "Off at"', () => {
        expect(alightingLabel(leMansOption()))
            .toBe('Off at Le Mans 10:30 · 1h42 · Direct · 7.2 km to the spot');
    });

    it('names the destination as "Stay to"', () => {
        expect(alightingLabel(arnageOption()))
            .toBe('Stay to Arnage 13:25 · 4h37 · 1 change · 2 km to the spot');
    });

    it('reads the options own duration and changes, not the journeys', () => {
        // Le Mans is 102 minutes into a 277-minute journey, and direct where the
        // journey has a change. Deriving from legs[] would give 277 and 1.
        const label = alightingLabel({ ...leMansOption(), durationMinutes: 200, changes: 3 });
        expect(label).toBe('Off at Le Mans 10:30 · 3h20 · 3 changes · 7.2 km to the spot');
    });
});

describe('fetchRailWaysIn request shape', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue(stubResponse(railEnvelope()));
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    const requestedUrl = (): string => String(fetchMock.mock.calls[0]?.[0]);

    it('asks for the sample with no query string at all', async () => {
        await fetchRailWaysIn('wake-paradise-spay-fr');
        expect(requestedUrl()).toBe('/api/spots/wake-paradise-spay-fr/rail');
    });

    it('builds the chained URL criterion 33 waits for, colons percent-encoded', async () => {
        await fetchRailWaysIn('wake-paradise-spay-fr', { airport: 'BVA', time: '2026-10-03T09:40:00' });

        expect(requestedUrl()).toBe(
            '/api/spots/wake-paradise-spay-fr/rail'
            + '?arrivalAirport=BVA&arrivalTime=2026-10-03T09%3A40%3A00',
        );
    });

    it('encodes a slug rather than pasting it into the path', async () => {
        await fetchRailWaysIn('a spot/with slashes');
        expect(requestedUrl()).toBe('/api/spots/a%20spot%2Fwith%20slashes/rail');
    });

    it('returns the parsed body, station included', async () => {
        const result = await fetchRailWaysIn('wake-paradise-spay-fr');

        expect(result.slug).toBe('wake-paradise-spay-fr');
        expect(result.station?.name).toBe('Arnage');
        expect(result.station?.distanceKm).toBe(2.0);
    });

    it('carries no price', async () => {
        const result = await fetchRailWaysIn('wake-paradise-spay-fr');

        expect(result.priceState).toBe('MANUAL_CHECK');
        expect(result.bookingUrl).toBe('https://www.sncf-connect.com/');
    });
});

describe('fetchRailWaysIn failures (the block renders these as PROVIDER_UNAVAILABLE)', () => {
    it('throws on a non-200 instead of returning a half-built response', async () => {
        global.fetch = vi.fn().mockResolvedValue(stubResponse({ message: 'nope' }, 503)) as unknown as typeof fetch;
        await expect(fetchRailWaysIn('wake-paradise-spay-fr')).rejects.toThrow(/503/);
    });

    it('propagates a network failure', async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
        await expect(fetchRailWaysIn('wake-paradise-spay-fr')).rejects.toThrow(/Failed to fetch/);
    });

    it('propagates an unparseable body', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ...stubResponse({}, 200),
            json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
        }) as unknown as typeof fetch;

        await expect(fetchRailWaysIn('wake-paradise-spay-fr')).rejects.toThrow(SyntaxError);
    });
});
