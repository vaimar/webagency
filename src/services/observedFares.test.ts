import {
    OBSERVED_FARE_TTL_MS,
    describeFareAge,
    isObservedFareFresh,
    forgetObservedFare,
    loadObservedFares,
    observedFareKey,
    parseFareInput,
    saveObservedFare,
} from './observedFares';

const KEY = 'travelhub.observedFares.v2';

beforeEach(() => window.localStorage.clear());

describe('parseFareInput', () => {
    it('takes a price in whatever shape a booking site wrote it', () => {
        expect(parseFareInput('148')).toBe(148);
        expect(parseFareInput('€148')).toBe(148);
        expect(parseFareInput('148,50')).toBe(148.5);
        expect(parseFareInput('148.50 EUR')).toBe(148.5);
    });

    it('refuses anything that is not a positive number', () => {
        expect(parseFareInput('')).toBeNull();
        expect(parseFareInput('free')).toBeNull();
        expect(parseFareInput('0')).toBeNull();
    });
});

describe('saveObservedFare', () => {
    const vueling = {
        origin: 'MAD', destination: 'AGP', date: '2026-09-30',
        carriers: ['VY'], departureTime: '19:05',
    };
    const airEuropa = {
        origin: 'MAD', destination: 'AGP', date: '2026-09-30',
        carriers: ['UX'], departureTime: '07:10',
    };

    it('stores a sighting against the flight, with when it was seen', () => {
        const now = new Date('2026-09-01T10:00:00Z');
        const fares = saveObservedFare({}, vueling, 148, now);

        expect(fares[observedFareKey(vueling)]).toEqual({
            price: 148,
            savedAt: '2026-09-01T10:00:00.000Z',
        });
        expect(loadObservedFares()).toEqual(fares);
    });

    it('keeps two carriers on the same route and day apart', () => {
        // THE BUG: keyed on route and date alone, a price entered for the
        // Vueling 19:05 appeared on the Air Europa 07:10 as well.
        let fares = saveObservedFare({}, vueling, 148);
        fares = saveObservedFare(fares, airEuropa, 96);

        expect(Object.keys(fares)).toHaveLength(2);
        expect(fares[observedFareKey(vueling)].price).toBe(148);
        expect(fares[observedFareKey(airEuropa)].price).toBe(96);
    });

    it('keeps two departures by the same carrier apart', () => {
        const morning = { ...vueling, departureTime: '07:10' };
        let fares = saveObservedFare({}, vueling, 148);
        fares = saveObservedFare(fares, morning, 96);

        expect(Object.keys(fares)).toHaveLength(2);
    });

    it('treats a codeshare listed in another order as the same flight', () => {
        const asListed = { ...vueling, carriers: ['IB', 'VY'] };
        const reordered = { ...vueling, carriers: ['VY', 'IB'] };

        expect(observedFareKey(asListed)).toBe(observedFareKey(reordered));
    });

    it('reads a departure clock out of whatever shape it arrives in', () => {
        const withSeconds = { ...vueling, departureTime: '19:05:00' };
        expect(observedFareKey(withSeconds)).toBe(observedFareKey(vueling));
    });

    it('replaces an earlier sighting of the same flight', () => {
        const first = saveObservedFare({}, vueling, 148);
        const second = saveObservedFare(first, vueling, 132);

        expect(second[observedFareKey(vueling)].price).toBe(132);
        expect(Object.keys(second)).toHaveLength(1);
    });

    it('keeps different days apart', () => {
        let fares = saveObservedFare({}, vueling, 148);
        fares = saveObservedFare(fares, { ...vueling, date: '2026-10-01' }, 96);

        expect(Object.keys(fares)).toHaveLength(2);
    });

    it('ignores a price that is not usable', () => {
        expect(saveObservedFare({}, vueling, 0)).toEqual({});
        expect(saveObservedFare({}, vueling, Number.NaN)).toEqual({});
    });
});

describe('forgetObservedFare', () => {
    const flight = {
        origin: 'MAD', destination: 'AGP', date: '2026-09-30',
        carriers: ['VY'], departureTime: '19:05',
    };

    it('removes the sighting from memory and storage', () => {
        const saved = saveObservedFare({}, flight, 148);
        const cleared = forgetObservedFare(saved, flight);

        expect(cleared).toEqual({});
        expect(loadObservedFares()).toEqual({});
    });
});

describe('loadObservedFares', () => {
    it('drops corrupted entries rather than trusting them as prices', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            'MAD-AGP-2026-09-30-VY-19:05': { price: 148, savedAt: '2026-09-01T10:00:00.000Z' },
            'BAD-KEY-1': { price: 'lots', savedAt: 'whenever' },
            'BAD-KEY-2': null,
        }));

        expect(Object.keys(loadObservedFares())).toEqual(['MAD-AGP-2026-09-30-VY-19:05']);
    });

    it('KEEPS an expired sighting so it can still be seen and refreshed', () => {
        // It stops counting towards totals, but deleting it here would make the
        // traveller's own entry vanish with no explanation.
        const weeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
        window.localStorage.setItem(KEY, JSON.stringify({
            'MAD-AGP-2026-09-30-VY-19:05': { price: 148, savedAt: weeksAgo },
        }));

        const loaded = loadObservedFares();
        expect(Object.keys(loaded)).toHaveLength(1);
        expect(isObservedFareFresh(loaded['MAD-AGP-2026-09-30-VY-19:05'])).toBe(false);
    });

    it('discards v1 entries, which the flight-level key can never match', () => {
        window.localStorage.setItem('travelhub.observedFares.v1', JSON.stringify({
            'MAD-AGP-2026-09-30': { price: 148, savedAt: new Date().toISOString() },
        }));

        expect(loadObservedFares()).toEqual({});
        expect(window.localStorage.getItem('travelhub.observedFares.v1')).toBeNull();
    });

    it('survives storage holding nonsense', () => {
        window.localStorage.setItem(KEY, 'not json');
        expect(loadObservedFares()).toEqual({});
    });
});

describe('describeFareAge', () => {
    const now = new Date('2026-09-08T12:00:00Z');

    it('says how stale a sighting is, because that is the reader\'s call', () => {
        expect(describeFareAge('2026-09-08T09:00:00Z', now)).toBe('seen today');
        expect(describeFareAge('nonsense', now)).toBe('saved earlier');
    });

    it('marks anything past its life as expired rather than merely old', () => {
        // "seen 6 days ago" reads like it still counts. It does not.
        expect(describeFareAge('2026-09-07T09:00:00Z', now)).toBe('expired · seen yesterday');
        expect(describeFareAge('2026-09-02T09:00:00Z', now)).toBe('expired · seen 6 days ago');
    });
});

describe('isObservedFareFresh', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const at = (savedAt: string) => ({ price: 148, savedAt });

    it('counts a sighting for its first day only', () => {
        expect(isObservedFareFresh(at('2026-09-08T11:00:00Z'), now)).toBe(true);
        expect(isObservedFareFresh(at('2026-09-07T13:00:00Z'), now)).toBe(true);
    });

    it('stops counting one past the limit', () => {
        const justInside = new Date(now.getTime() - OBSERVED_FARE_TTL_MS + 1000).toISOString();
        const justOutside = new Date(now.getTime() - OBSERVED_FARE_TTL_MS - 1000).toISOString();

        expect(isObservedFareFresh(at(justInside), now)).toBe(true);
        expect(isObservedFareFresh(at(justOutside), now)).toBe(false);
    });

    it('refuses a weeks-old sighting, whatever it says', () => {
        // The damage this prevents: an August entry completing a September
        // total, and excusing a leg Ryanair now has no fare for.
        expect(isObservedFareFresh(at('2026-08-15T09:00:00Z'), now)).toBe(false);
    });

    it('trusts nothing it cannot date, including a clock running backwards', () => {
        expect(isObservedFareFresh(at('nonsense'), now)).toBe(false);
        expect(isObservedFareFresh(at('2026-09-09T12:00:00Z'), now)).toBe(false);
        expect(isObservedFareFresh(null, now)).toBe(false);
    });
});
