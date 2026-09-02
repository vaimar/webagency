import {
    describeFareAge,
    forgetObservedFare,
    loadObservedFares,
    observedFareKey,
    parseFareInput,
    saveObservedFare,
} from './observedFares';

const KEY = 'travelhub.observedFares.v1';

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
    it('stores a sighting against the leg and day, with when it was seen', () => {
        const now = new Date('2026-09-01T10:00:00Z');
        const fares = saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', 148, now);

        expect(fares[observedFareKey('MAD', 'AGP', '2026-09-30')]).toEqual({
            price: 148,
            savedAt: '2026-09-01T10:00:00.000Z',
        });
        expect(loadObservedFares()).toEqual(fares);
    });

    it('replaces an earlier sighting for the same leg', () => {
        const first = saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', 148);
        const second = saveObservedFare(first, 'MAD', 'AGP', '2026-09-30', 132);

        expect(second[observedFareKey('MAD', 'AGP', '2026-09-30')].price).toBe(132);
        expect(Object.keys(second)).toHaveLength(1);
    });

    it('keeps different days apart', () => {
        let fares = saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', 148);
        fares = saveObservedFare(fares, 'MAD', 'AGP', '2026-10-01', 96);

        expect(Object.keys(fares)).toHaveLength(2);
    });

    it('ignores a price that is not usable', () => {
        expect(saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', 0)).toEqual({});
        expect(saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', Number.NaN)).toEqual({});
    });
});

describe('forgetObservedFare', () => {
    it('removes the sighting from memory and storage', () => {
        const saved = saveObservedFare({}, 'MAD', 'AGP', '2026-09-30', 148);
        const cleared = forgetObservedFare(saved, 'MAD', 'AGP', '2026-09-30');

        expect(cleared).toEqual({});
        expect(loadObservedFares()).toEqual({});
    });
});

describe('loadObservedFares', () => {
    it('drops corrupted entries rather than trusting them as prices', () => {
        window.localStorage.setItem(KEY, JSON.stringify({
            'MAD-AGP-2026-09-30': { price: 148, savedAt: '2026-09-01T10:00:00.000Z' },
            'BAD-KEY-1': { price: 'lots', savedAt: 'whenever' },
            'BAD-KEY-2': null,
        }));

        expect(Object.keys(loadObservedFares())).toEqual(['MAD-AGP-2026-09-30']);
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
        expect(describeFareAge('2026-09-07T09:00:00Z', now)).toBe('seen yesterday');
        expect(describeFareAge('2026-09-02T09:00:00Z', now)).toBe('seen 6 days ago');
        expect(describeFareAge('nonsense', now)).toBe('saved earlier');
    });
});
