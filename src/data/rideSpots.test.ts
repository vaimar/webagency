import {
    ALL_FACT_KEYS,
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

// Comfortably after RULE_APPLIED_ON, so derived facts are not 'in the future'.
const AT = new Date('2026-09-20T12:00:00Z');

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
    operating: unverified<boolean>(),
    ...overrides,
});

describe('rideSpots — the shipped catalogue', () => {
    it('passes every curation rule', () => {
        expect(validateRideSpots(RIDE_SPOTS, AT)).toEqual([]);
    });

    // Nothing is asserted about a venue that nobody has read. The single
    // exception is climateBand, which is derived from a documented geographic
    // rule rather than observed — see CLIMATE_RULE_NOTE.
    it('ships with no observed facts — only the derived climate is set', () => {
        for (const entry of RIDE_SPOTS) {
            for (const key of ALL_FACT_KEYS) {
                const fact = entry[key] as VenueFact<unknown>;
                // Two facts are reported rather than read: EXO 84's closure
                // and Ibiza's surface. Everything else is untouched.
                if (key === 'operating' && entry.label === 'EXO 84') {
                    expect(fact.value).toBe(false);
                    expect(fact.sourceKind).toBe('user_report');
                    continue;
                }
                // Spots we have been told about, or found in a listing,
                // carry real facts. Only the untouched ones stay blank.
                if (['Ibiza Wake', 'Wake Paradise', '313 Cable Park', 'Lakecity 33', 'Langenfeld'].includes(entry.label)) {
                    continue;
                }
                if (key === 'climateBand') {
                    expect(fact.status).toBe('VERIFIED');
                    expect(fact.sourceKind).toBe('derived');
                    expect(fact.verifiedBy).toBe('rule');
                    // A derived fact cites a rule, never a page it did not read.
                    expect(fact.sourceUrl).toBeNull();
                    continue;
                }
                expect(fact.status).toBe('UNVERIFIED');
                expect(fact.value).toBeNull();
            }
        }
    });

    it('derives a climate band for every venue from its region', () => {
        const byLabel = Object.fromEntries(RIDE_SPOTS.map((s) => [s.label, s.climateBand.value]));

        expect(byLabel['Ibiza Wake']).toBe('warm');           // Balearics
        expect(byLabel['Lakecity 33']).toBe('temperate');     // Atlantic
        expect(byLabel['Langenfeld']).toBe('temperate');      // continental
        expect(byLabel['313 Cable Park']).toBe('cold');       // Baltic, via Palanga
    });

    it('routes 313 Cable Park to Palanga, not Vilnius', () => {
        const spot313 = RIDE_SPOTS.find((s) => s.label === '313 Cable Park');
        expect(spot313?.arrivalAirport).toBe('PLQ');
    });

    it('carries the spot behind the Le Mans weekend', () => {
        const wp = RIDE_SPOTS.find((s) => s.label === 'Wake Paradise');

        expect(wp?.locality).toContain('Le Mans');
        expect(wp?.surface.value).toBe('cable');
        expect(wp?.amenities).toContain('restaurant');
        expect(wp?.point).toBeDefined();
        // The session price came from someone who was there; the cable
        // detail came from a listing. Those are not the same evidence.
        expect(wp?.sessionPrice.sourceKind).toBe('user_report');
        expect(wp?.surface.sourceKind).toBe('third_party');
    });

    it('has coordinates for every spot it knows where to find', () => {
        const placed = RIDE_SPOTS.filter((s) => s.point);
        expect(placed.map((s) => s.label).sort())
            .toEqual(['313 Cable Park', 'Ibiza Wake', 'Lakecity 33', 'Langenfeld', 'Wake Paradise']);
    });

    it('does not claim a cable park where there is none', () => {
        const ibiza = RIDE_SPOTS.find((s) => s.label === 'Ibiza Wake');

        expect(ibiza).toBeDefined();
        expect(ibiza?.surface.value).toBe('boat');
        expect(ibiza?.cableCount.status).toBe('NOT_APPLICABLE');
        expect(ibiza?.locality).toContain('Sant Antoni');
        // The old label asserted a facility that does not exist on the island.
        expect(RIDE_SPOTS.map((s) => s.label)).not.toContain('Ibiza Cable Park');
    });

    it('no longer lists a venue we cannot place', () => {
        // Hypnotics was mapped to Perpignan but is in Turkey.
        expect(RIDE_SPOTS.map((s) => s.label)).not.toContain('Hypnotics');
    });

    // Langenfeld is the first spot with every launch-critical fact filled.
    it('reports the first launch-ready venue', () => {
        const coverage = getCoverage(RIDE_SPOTS, AT);

        expect(coverage.totalSpots).toBe(7);
        expect(coverage.launchReady).toBe(2);   // Langenfeld and 313
        expect(coverage.byField.surface).toBe(5);
        expect(coverage.byField.openingSeason).toBe(2);
        expect(coverage.byField.beginnerFriendly).toBe(2);
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

    it('does not require a venue confirmed closed to resolve', () => {
        // The directory drops closed venues; the catalogue keeps the row so
        // nobody re-adds it. Only an open venue has to be routable.
        const closed = spot('Totally Made Up Park', { operating: verified(false) });
        expect(validateRideSpots([closed], AT).map((i) => i.rule)).not.toContain('R2-resolvable');
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

    it('distinguishes every reason a venue is missing from a result', () => {
        const result = shortlistRideSpots({ surface: 'cable', beginnerOnly: true }, RIDE_SPOTS, AT);

        // Two spots now answer the beginner question.
        expect(result.included.map((e) => e.spot.label).sort())
            .toEqual(['313 Cable Park', 'Langenfeld']);

        const reasons = new Set(result.excluded.map((e) => e.reason));
        expect(reasons.has('NOT_OPERATING')).toBe(true);        // EXO 84 has closed
        expect(reasons.has('SURFACE_MISMATCH')).toBe(true);     // Ibiza is boat-pulled
        expect(reasons.has('SURFACE_UNVERIFIED')).toBe(true);   // Paris Wakepark
        expect(reasons.has('BEGINNER_UNVERIFIED')).toBe(true);  // cable, no school listed

        // Only the unchecked ones are a gap in our data; the rest are answers.
        expect(result.hiddenForMissingData).toBe(3);
    });

    it('excludes Ibiza from a cable-only search, because it is boat-pulled', () => {
        const ibiza = RIDE_SPOTS.filter((s) => s.label === 'Ibiza Wake');

        const cableOnly = shortlistRideSpots({ surface: 'cable' }, ibiza, AT);
        expect(cableOnly.included).toEqual([]);
        expect(cableOnly.excluded[0].reason).toBe('SURFACE_MISMATCH');
        // A real mismatch, not a gap in our data.
        expect(cableOnly.excluded[0].dueToMissingData).toBe(false);

        const boatOk = shortlistRideSpots({ surface: 'boat' }, ibiza, AT);
        expect(boatOk.included.map((e) => e.spot.label)).toEqual(['Ibiza Wake']);
    });

    it('excludes a venue known to have closed, whatever else matches', () => {
        const closed = spot('Ibiza Cable Park', {
            surface: verified('cable'),
            openingSeason: verified('year_round'),
            operating: {
                value: false, status: 'VERIFIED', sourceUrl: null, checkedOn: '2026-09-12',
                sourceKind: 'user_report', verifiedBy: 'human', note: 'reported closed',
            },
        });
        const result = shortlistRideSpots({ surface: 'cable' }, [closed], AT);

        expect(result.included).toEqual([]);
        expect(result.excluded[0].reason).toBe('NOT_OPERATING');
        expect(result.excluded[0].dueToMissingData).toBe(false);
    });

    // Not knowing a venue closed is not evidence that it did.
    it('keeps a venue whose operating status nobody has checked', () => {
        const unchecked = spot('Ibiza Cable Park', {
            surface: verified('cable'),
            openingSeason: verified('year_round'),
        });
        const result = shortlistRideSpots({ surface: 'cable' }, [unchecked], AT);

        expect(result.included.map((e) => e.spot.label)).toEqual(['Ibiza Cable Park']);
    });
});
