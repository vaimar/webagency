import {
    ALL_FACT_KEYS,
    LAUNCH_CRITICAL_FACTS,
    RIDE_SPOTS,
    RideSpot,
    VenueFact,
    getCoverage,
    isOpenOn,
    notApplicable,
    resolveFact,
    shortlistRideSpots,
    unverified,
    validateRideSpots,
} from './rideSpots';

const AT = new Date('2026-09-11T12:00:00Z');

const verified = <T, >(value: T, checkedOn = '2026-09-01'): VenueFact<T> => ({
    value,
    status: 'VERIFIED',
    sourceUrl: 'https://example.test/venue',
    checkedOn,
});

const spot = (label: string, overrides: Partial<RideSpot> = {}): RideSpot => ({
    label,
    arrivalAirport: 'IBZ',
    activity: 'wakeboard',
    surface: unverified(),
    beginnerFriendly: unverified(),
    climateBand: unverified(),
    openingSeason: unverified(),
    cableCount: unverified(),
    skillFloor: unverified(),
    sessionPrice: unverified(),
    ...overrides,
});

describe('rideSpots — the shipped catalogue', () => {
    it('passes every curation rule', () => {
        expect(validateRideSpots(RIDE_SPOTS, AT)).toEqual([]);
    });

    it('ships with no invented facts — every fact starts UNVERIFIED', () => {
        for (const entry of RIDE_SPOTS) {
            for (const key of ALL_FACT_KEYS) {
                const fact = entry[key] as VenueFact<unknown>;
                expect(fact.status).toBe('UNVERIFIED');
                expect(fact.value).toBeNull();
            }
        }
    });

    it('reports zero launch-ready venues until a human fills them in', () => {
        const coverage = getCoverage(RIDE_SPOTS, AT);
        expect(coverage.totalSpots).toBe(7);
        expect(coverage.launchReady).toBe(0);
        for (const key of LAUNCH_CRITICAL_FACTS) {
            expect(coverage.byField[key]).toBe(0);
        }
    });
});

describe('validateRideSpots', () => {
    it('rejects a value parked behind an unverified status', () => {
        const rows = [spot('Ibiza Cable Park', {
            surface: { value: 'cable', status: 'UNVERIFIED', sourceUrl: null, checkedOn: null },
        })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R6-no-unverified-value');
    });

    it('requires an https source and a real check date on anything verified', () => {
        const rows = [spot('Ibiza Cable Park', {
            surface: { value: 'cable', status: 'VERIFIED', sourceUrl: 'http://insecure.test', checkedOn: null },
        })];
        const rules = validateRideSpots(rows, AT).map((i) => i.rule);
        expect(rules).toContain('R4-source-url');
        expect(rules).toContain('R5-checked-on');
    });

    it('rejects a check date in the future', () => {
        const rows = [spot('Ibiza Cable Park', { surface: verified('cable', '2027-01-01') })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R5-checked-on');
    });

    it('catches drift between the row and the routing directory', () => {
        const rows = [spot('Ibiza Cable Park', { arrivalAirport: 'BCN' })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R2-airport-agrees');
    });

    it('rejects a label the routing directory cannot resolve', () => {
        expect(validateRideSpots([spot('Totally Made Up Park')], AT).map((i) => i.rule))
            .toContain('R2-resolvable');
    });

    it('rejects cableCount on a non-cable venue', () => {
        const rows = [spot('Ibiza Cable Park', {
            surface: verified<'sea'>('sea'),
            cableCount: verified(2),
        })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R8-cable-only');
    });

    it('rejects beginnerFriendly that contradicts the skill floor', () => {
        const rows = [spot('Ibiza Cable Park', {
            beginnerFriendly: verified(true),
            skillFloor: verified<'confident'>('confident'),
        })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R9-beginner-consistent');
    });

    it('rejects an hourly rate above the day pass', () => {
        const rows = [spot('Ibiza Cable Park', {
            sessionPrice: verified({ hourlyEur: 90, dayPassEur: 45 }),
        })];
        expect(validateRideSpots(rows, AT).map((i) => i.rule)).toContain('R10-price-ordering');
    });

    it('accepts a fully and correctly curated row', () => {
        const rows = [spot('Ibiza Cable Park', {
            surface: verified<'cable'>('cable'),
            beginnerFriendly: verified(true),
            climateBand: verified<'warm'>('warm'),
            openingSeason: verified({ from: '04-01', to: '10-31' }),
            cableCount: verified(2),
            skillFloor: verified<'none'>('none'),
            sessionPrice: verified({ hourlyEur: 25, dayPassEur: 45 }),
        })];
        expect(validateRideSpots(rows, AT)).toEqual([]);
    });

    it('accepts notApplicable for cableCount on a sea venue', () => {
        const rows = [spot('Ibiza Cable Park', {
            surface: verified<'sea'>('sea'),
            cableCount: notApplicable('open sea, no cable'),
        })];
        expect(validateRideSpots(rows, AT)).toEqual([]);
    });
});

describe('resolveFact — staleness is derived, never stored', () => {
    it('marks a published season stale past its 180-day TTL', () => {
        const fact = verified<'year_round'>('year_round', '2025-01-01');
        expect(resolveFact(fact, 'openingSeason', AT).status).toBe('STALE');
    });

    it('keeps a physical fact fresh well past a season TTL', () => {
        const fact = verified<'cable'>('cable', '2025-01-01');
        expect(resolveFact(fact, 'surface', AT).status).toBe('VERIFIED');
    });

    it('never marks geography stale', () => {
        const fact = verified<'warm'>('warm', '2019-01-01');
        expect(resolveFact(fact, 'climateBand', AT).status).toBe('VERIFIED');
    });
});

describe('isOpenOn', () => {
    it('handles a normal summer season', () => {
        const season = { from: '04-01', to: '10-31' };
        expect(isOpenOn(season, '2026-07-10')).toBe(true);
        expect(isOpenOn(season, '2026-12-24')).toBe(false);
    });

    it('handles a season that wraps the new year', () => {
        const season = { from: '11-01', to: '03-31' };
        expect(isOpenOn(season, '2026-01-15')).toBe(true);
        expect(isOpenOn(season, '2026-12-15')).toBe(true);
        expect(isOpenOn(season, '2026-06-15')).toBe(false);
    });

    it('treats year_round as always open', () => {
        expect(isOpenOn('year_round', '2026-02-02')).toBe(true);
    });
});

describe('shortlistRideSpots — hard filters fail closed, soft ones fail open', () => {
    const cable = spot('Ibiza Cable Park', {
        surface: verified<'cable'>('cable'),
        beginnerFriendly: verified(true),
        climateBand: verified<'warm'>('warm'),
        openingSeason: verified({ from: '04-01', to: '10-31' }),
    });
    const unknownSurface = spot('EXO 84', { arrivalAirport: 'MRS' });

    it('excludes a venue whose surface is unverified rather than guessing', () => {
        const result = shortlistRideSpots({ surface: 'cable' }, [cable, unknownSurface], AT);

        expect(result.included.map((e) => e.spot.label)).toEqual(['Ibiza Cable Park']);
        expect(result.excluded[0].reason).toBe('SURFACE_UNVERIFIED');
        expect(result.hiddenForMissingData).toBe(1);
    });

    it('distinguishes a real mismatch from missing data', () => {
        const sea = spot('Hypnotics', { arrivalAirport: 'PGF', surface: verified<'sea'>('sea') });
        const result = shortlistRideSpots({ surface: 'cable' }, [sea, unknownSurface], AT);

        const byReason = Object.fromEntries(result.excluded.map((e) => [e.reason, e.dueToMissingData]));
        expect(byReason.SURFACE_MISMATCH).toBe(false);
        expect(byReason.SURFACE_UNVERIFIED).toBe(true);
        expect(result.hiddenForMissingData).toBe(1);
    });

    it('keeps a venue with unknown climate but forfeits the warm bonus', () => {
        const result = shortlistRideSpots({ climate: 'warm' }, [cable, unknownSurface], AT);

        expect(result.included.map((e) => e.spot.label)).toEqual(['Ibiza Cable Park', 'EXO 84']);
        expect(result.included[0].climateBonus).toBe(1);
        expect(result.included[1].climateBonus).toBe(0);
        expect(result.hiddenForMissingData).toBe(0);
    });

    it('excludes a venue closed on the chosen date', () => {
        const result = shortlistRideSpots({ openOn: '2026-12-20' }, [cable], AT);
        expect(result.excluded[0].reason).toBe('CLOSED_ON_DATE');
        expect(result.excluded[0].dueToMissingData).toBe(false);
    });

    it('still filters on a stale fact, but flags it', () => {
        const stale = spot('Lakecity 33', {
            arrivalAirport: 'BOD',
            openingSeason: verified({ from: '04-01', to: '10-31' }, '2025-01-01'),
        });
        const result = shortlistRideSpots({ openOn: '2026-07-10' }, [stale], AT);

        expect(result.included).toHaveLength(1);
        expect(result.included[0].staleFacts).toEqual(['openingSeason']);
    });

    it('returns nothing but reports why when the catalogue is entirely unverified', () => {
        const result = shortlistRideSpots({ surface: 'cable', beginnerOnly: true }, RIDE_SPOTS, AT);

        expect(result.included).toEqual([]);
        expect(result.hiddenForMissingData).toBe(RIDE_SPOTS.length);
    });
});
