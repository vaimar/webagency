import { isRideFinderEnabled } from './featureFlags';

describe('isRideFinderEnabled', () => {
    const original = process.env.REACT_APP_RIDE_FINDER;
    afterEach(() => { process.env.REACT_APP_RIDE_FINDER = original; });

    it('is off by default — it ships before the data it needs', () => {
        delete process.env.REACT_APP_RIDE_FINDER;
        expect(isRideFinderEnabled('')).toBe(false);
    });

    it('reads the env var in its common spellings', () => {
        for (const on of ['1', 'true', 'on', 'YES']) {
            process.env.REACT_APP_RIDE_FINDER = on;
            expect(isRideFinderEnabled('')).toBe(true);
        }
        for (const off of ['0', 'false', 'off', 'NO']) {
            process.env.REACT_APP_RIDE_FINDER = off;
            expect(isRideFinderEnabled('')).toBe(false);
        }
    });

    it('ignores a value it does not understand rather than guessing', () => {
        process.env.REACT_APP_RIDE_FINDER = 'maybe';
        expect(isRideFinderEnabled('')).toBe(false);
    });

    it('lets a query param override the env either way', () => {
        process.env.REACT_APP_RIDE_FINDER = '0';
        expect(isRideFinderEnabled('?rideFinder=1')).toBe(true);

        process.env.REACT_APP_RIDE_FINDER = '1';
        expect(isRideFinderEnabled('?rideFinder=0')).toBe(false);
    });

    it('falls back to the env when the param is absent or junk', () => {
        process.env.REACT_APP_RIDE_FINDER = '1';
        expect(isRideFinderEnabled('?other=1')).toBe(true);
        expect(isRideFinderEnabled('?rideFinder=banana')).toBe(true);
    });
});
