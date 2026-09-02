import type { Mock } from 'vitest';
import { searchAirports } from './airports';

/**
 * Two defects found by probing the live backend, both in the airport picker
 * that every flight search starts from:
 *
 *  1. The server matches the stored name literally, so "Malaga" returned zero
 *     results while "Málaga" returned AGP — and AGP is this app's own default
 *     destination.
 *  2. An exact IATA hit was not ranked first: "dub" listed Dublin fifth,
 *     behind Dubai World Central and Dubbo.
 */

const remote = (...rows: Array<Partial<ReturnType<typeof row>>>) => rows.map((r) => ({ ...row(), ...r }));

const row = () => ({
    iata: 'XXX',
    icao: null as string | null,
    name: 'Somewhere Airport',
    municipality: 'Somewhere',
    isoCountry: 'ZZ',
    type: 'medium_airport',
    scheduledService: true,
    latitude: null as number | null,
    longitude: null as number | null,
});

const mockJson = (body: unknown, ok = true) => {
    (global.fetch as Mock).mockResolvedValueOnce({
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    });
};

describe('searchAirports', () => {
    it('finds an accented airport when the accent is not typed', async () => {
        mockJson([]); // what the backend really returns for "Malaga"

        const results = await searchAirports('Malaga');

        expect(results.map((a) => a.iata)).toContain('AGP');
        expect(results[0].municipality).toBe('Málaga');
    });

    it('still finds it when the accent is typed', async () => {
        mockJson([]);

        const results = await searchAirports('Málaga');
        expect(results.map((a) => a.iata)).toContain('AGP');
    });

    it('puts an exact IATA match first', async () => {
        // The real backend order for "dub": Dublin was fifth.
        mockJson(remote(
            { iata: 'DWC', municipality: 'Dubai(Jebel Ali)' },
            { iata: 'LIR', municipality: 'Liberia' },
            { iata: 'DXB', municipality: 'Dubai' },
            { iata: 'DBO', municipality: 'Dubbo' },
            { iata: 'DUB', municipality: 'Dublin' },
        ));

        const results = await searchAirports('dub');
        expect(results[0].iata).toBe('DUB');
    });

    it('is case-insensitive about the code', async () => {
        mockJson(remote({ iata: 'NAG' }, { iata: 'AGP' }));

        expect((await searchAirports('AGP'))[0].iata).toBe('AGP');
    });

    it('keeps the backend order when nothing matches exactly', async () => {
        mockJson(remote({ iata: 'AAA' }, { iata: 'BBB' }, { iata: 'CCC' }));

        const results = await searchAirports('coastal');
        expect(results.map((a) => a.iata)).toEqual(['AAA', 'BBB', 'CCC']);
    });

    it('does not list the same airport twice when both sources return it', async () => {
        mockJson(remote({ iata: 'AGP', municipality: 'Málaga', icao: 'LEMG' }));

        const results = await searchAirports('Malaga');
        expect(results.filter((a) => a.iata === 'AGP')).toHaveLength(1);
        // The server row wins the merge, so richer fields survive.
        expect(results.find((a) => a.iata === 'AGP')?.icao).toBe('LEMG');
    });

    it('derives the country badge for curated-only results', async () => {
        mockJson([]);

        const agp = (await searchAirports('Malaga')).find((a) => a.iata === 'AGP');
        expect(agp?.isoCountry).toBe('ES');
    });

    it('falls back to curated airports when the backend fails', async () => {
        (global.fetch as Mock).mockRejectedValueOnce(new Error('Failed to fetch'));

        const results = await searchAirports('Malaga');
        expect(results.map((a) => a.iata)).toContain('AGP');
    });

    it('surfaces a backend failure when there is nothing to fall back on', async () => {
        (global.fetch as Mock).mockRejectedValueOnce(new Error('Failed to fetch'));

        await expect(searchAirports('zzzzznotanairport')).rejects.toThrow('Failed to fetch');
    });

    it('never swallows a cancelled request', async () => {
        const aborted = new Error('The user aborted a request.');
        aborted.name = 'AbortError';
        (global.fetch as Mock).mockRejectedValueOnce(aborted);

        // Even though "Malaga" has a curated match, an abort is the caller's
        // own doing and must propagate.
        await expect(searchAirports('Malaga')).rejects.toThrow('The user aborted a request.');
    });

    it('respects the requested limit', async () => {
        mockJson(remote({ iata: 'AAA' }, { iata: 'BBB' }, { iata: 'CCC' }, { iata: 'DDD' }));

        expect(await searchAirports('a', { limit: 2 })).toHaveLength(2);
    });
});
