import { deriveClimateBand, RideSpot, unverified } from '../data/rideSpots';
import { normalizeTripIntent, ResolvedIntent } from './tripIntent';
import { defaultWindow, FANOUT_WIDTH, planSearch, sampleDates } from './tripPlanner';

const NOW = new Date('2026-09-11T09:00:00Z');

const intentOf = (overrides: Partial<ResolvedIntent> = {}): ResolvedIntent => ({
    ...normalizeTripIntent({ origin: 'DUB' }).intent,
    ...overrides,
});

/** Dates the user chose — the only case the season gate applies to. */
const datedIntentOf = (overrides: Partial<ResolvedIntent> = {}): ResolvedIntent => {
    const base = intentOf(overrides);
    return {
        ...base,
        dateWindow: base.dateWindow ?? { earliest: '2026-09-18', latest: '2026-09-21' },
        sources: { ...base.sources, dateWindow: 'user' },
    };
};

const verified = <T, >(value: T) => ({
    value,
    status: 'VERIFIED' as const,
    sourceUrl: 'https://example.test/v',
    checkedOn: '2026-09-01',
});

/** A venue a curator has fully signed off — the state the catalogue is heading for. */
const curated = (
    label: string,
    airport: string,
    surface: 'cable' | 'boat' | 'sea',
    climate: 'warm' | 'temperate' | 'cold' = 'warm',
): RideSpot => spotOf(label, airport, {
    surface: verified(surface),
    climateBand: verified(climate),
    openingSeason: verified('year_round' as const),
});

const spotOf = (label: string, airport: string, overrides: Partial<RideSpot> = {}): RideSpot => ({
    label,
    arrivalAirport: airport,
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

describe('sampleDates', () => {
    it('prefers weekends, then adds a midweek date for contrast', () => {
        // 2026-09-11 is a Friday.
        const dates = sampleDates('2026-09-07', '2026-09-30', 2);

        expect(dates).toHaveLength(3);
        expect(dates).toContain('2026-09-11');
        expect(dates.every((d) => d >= '2026-09-07' && d <= '2026-09-30')).toBe(true);
    });

    it('only picks departures whose whole trip fits the window', () => {
        const dates = sampleDates('2026-09-07', '2026-09-12', 3);
        expect(dates.every((d) => d <= '2026-09-09')).toBe(true);
    });

    it('falls back to the first day when the window is too tight', () => {
        expect(sampleDates('2026-09-07', '2026-09-08', 5)).toEqual(['2026-09-07']);
    });

    it('is deterministic', () => {
        expect(sampleDates('2026-09-01', '2026-10-01', 2))
            .toEqual(sampleDates('2026-09-01', '2026-10-01', 2));
    });
});

describe('planSearch — strategy selection', () => {
    it('blocks with no origin rather than picking one', () => {
        const plan = planSearch(intentOf({ origin: null }), { now: NOW });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_ORIGIN');
        expect(plan.calls).toEqual([]);
    });

    it('searches a named destination directly on a tight window', () => {
        const plan = planSearch(intentOf({
            destinationHints: ['Ibiza'],
            dateWindow: { earliest: '2026-07-10', latest: '2026-07-13' },
            nights: 3,
        }), { now: NOW });

        expect(plan.strategy).toBe('SINGLE_SPOT');
        expect(plan.calls).toHaveLength(1);
        expect(plan.calls[0].request.destination).toBe('Ibiza');
        expect(plan.calls[0].request.origin).toBe('DUB');
    });

    it('sweeps sampled dates on an open window and says it sampled', () => {
        const plan = planSearch(intentOf({
            destinationHints: ['Ibiza'],
            dateWindow: { earliest: '2026-09-01', latest: '2026-09-30' },
            nights: 2,
        }), { now: NOW });

        expect(plan.strategy).toBe('DATE_SWEEP');
        expect(plan.calls).toHaveLength(3);
        expect(plan.warnings.map((w) => w.kind)).toContain('DATE_SAMPLED');
        // Never claims to have checked the whole month.
        expect(plan.warnings.find((w) => w.kind === 'DATE_SAMPLED')?.message).toMatch(/not all/);
    });

    it('attaches arrivalAirport only for destinations the backend cannot resolve', () => {
        const hinted = planSearch(intentOf({ destinationHints: ['Geneva'] }), { now: NOW });
        expect(hinted.calls[0].request.arrivalAirport).toBe('GVA');

        const curated = planSearch(intentOf({ destinationHints: ['Ibiza'] }), { now: NOW });
        expect(curated.calls[0].request.arrivalAirport).toBeUndefined();
    });

    it('reports assumptions instead of asking', () => {
        const plan = planSearch(intentOf({ destinationHints: ['Ibiza'] }), { now: NOW });

        const kinds = plan.warnings.map((w) => w.kind);
        expect(kinds).toContain('ASSUMPTION_APPLIED');
        expect(plan.calls).toHaveLength(1);
    });
});

describe('planSearch — catalogue fan-out fails closed', () => {
    const ibiza = curated('Ibiza', 'IBZ', 'cable', 'warm');
    const unknown = spotOf('EXO 84', 'MRS');

    it('fans out over matching venues, bounded by FANOUT_WIDTH', () => {
        const many = [
            curated('Ibiza', 'IBZ', 'cable'),
            curated('EXO 84', 'MRS', 'cable'),
            curated('Hypnotics', 'PGF', 'cable'),
            curated('Lakecity 33', 'BOD', 'cable'),
        ];

        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW, spots: many });

        expect(plan.strategy).toBe('SHORTLIST_FANOUT');
        expect(plan.calls).toHaveLength(FANOUT_WIDTH);
        expect(plan.warnings.map((w) => w.kind)).toContain('FANOUT_TRUNCATED');
    });

    it('excludes unverified venues from a hard filter and says how many', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW, spots: [ibiza, unknown] });

        expect(plan.calls.map((c) => c.spotLabel)).toEqual(['Ibiza']);
        const hidden = plan.warnings.find((w) => w.kind === 'HIDDEN_FOR_MISSING_DATA');
        expect(hidden?.message).toContain('1 venue hidden');
    });

    // An unverified season must gate just as hard as an unverified surface —
    // sending someone to a closed park is the failure this prevents.
    it('excludes a venue whose season is unverified when the user chose the dates', () => {
        const seasonUnknown = spotOf('Hypnotics', 'PGF', { surface: verified('cable') });
        const plan = planSearch(datedIntentOf({ rideSurface: 'cable' }), { now: NOW, spots: [seasonUnknown] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
    });

    it('blocks when nothing is verified, and offers the nearest relaxation', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW, spots: [unknown] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
        expect(plan.blocked?.relaxation?.dropFilter).toBe('rideSurface');
        expect(plan.blocked?.relaxation?.wouldYield).toBe(1);
    });

    // With user-chosen dates the season gate is live again, so no single drop
    // is enough and the last resort is what keeps the user from a dead end.
    it('falls back to dropping every unverifiable filter when no single drop helps', () => {
        const plan = planSearch(datedIntentOf({ rideSurface: 'cable' }), { now: NOW, spots: [unknown] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.relaxation?.dropFilter).toBe('allVenueFacts');
        expect(plan.blocked?.relaxation?.wouldYield).toBe(1);
    });

    it('says when it skipped the season check rather than staying silent', () => {
        const plan = planSearch(intentOf({}), { now: NOW, spots: [ibiza] });

        expect(plan.warnings.map((w) => w.kind)).toContain('SEASON_UNCHECKED');
    });

    it('reports no relaxation when dropping a filter would not help', () => {
        const plan = planSearch(
            intentOf({ rideSurface: 'cable', activity: 'snowboard' }),
            { now: NOW, spots: [unknown] },
        );

        // Activity mismatch is a real mismatch, not missing data — dropping
        // venue-fact filters cannot conjure a snowboard venue from a wake park.
        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.relaxation).toBeNull();
    });

    it('lets climate order the shortlist without trimming it', () => {
        const cold = curated('313 Cable Park', 'PLQ', 'cable', 'cold');
        const plan = planSearch(
            intentOf({ rideSurface: 'cable', climate: 'warm' }),
            { now: NOW, spots: [cold, ibiza] },
        );

        expect(plan.calls).toHaveLength(2);
        expect(plan.calls[0].spotLabel).toBe('Ibiza');
    });

    // Was BLOCKED until the catalogue had real surfaces in it. Now three
    // spots are known cable parks, so the flagship intent actually returns
    // something — while the unchecked ones stay hidden and counted.
    it('returns cable parks now that the catalogue knows which ones they are', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW });

        expect(plan.strategy).toBe('SHORTLIST_FANOUT');
        expect(plan.calls.length).toBeGreaterThan(0);
        expect(plan.blocked).toBeNull();

        // Ibiza is boat-pulled, so it is correctly absent from a cable search.
        expect(plan.calls.map((c) => c.spotLabel)).not.toContain('Ibiza Wake');

        // And the ones nobody has checked are still hidden, and still counted.
        expect(plan.warnings.map((w) => w.kind)).toContain('HIDDEN_FOR_MISSING_DATA');
    });

    it('still blocks a beginner search, because no spot lists a school yet', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable', skillLevel: 'none' }), { now: NOW });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
    });
});

// Proves the wiring end to end: the day a curator verifies the three observed
// facts, the hard filters start returning venues with no code change.
describe('planSearch — once a venue is genuinely curated', () => {
    const humanVerified = <T, >(value: T) => ({
        value,
        status: 'VERIFIED' as const,
        sourceUrl: 'https://the-venue.example/park',
        checkedOn: '2026-09-01',
        sourceKind: 'venue' as const,
        verifiedBy: 'human' as const,
    });

    const fullyCurated = (label: string, airport: string): RideSpot => spotOf(label, airport, {
        surface: humanVerified('cable' as const),
        beginnerFriendly: humanVerified(true),
        skillFloor: humanVerified('none' as const),
        openingSeason: humanVerified({ from: '04-01', to: '10-31' }),
        climateBand: deriveClimateBand(airport, '2026-09-12'),
    });

    it('returns the venue for a surface + beginner + season query', () => {
        const plan = planSearch(
            datedIntentOf({ rideSurface: 'cable', skillLevel: 'none' }),
            { now: NOW, spots: [fullyCurated('Ibiza Cable Park', 'IBZ')] },
        );

        expect(plan.strategy).toBe('SHORTLIST_FANOUT');
        expect(plan.calls.map((c) => c.spotLabel)).toEqual(['Ibiza Cable Park']);
        expect(plan.blocked).toBeNull();
    });

    it('still excludes it when the user travels out of season', () => {
        const winter: ResolvedIntent = {
            ...datedIntentOf({ rideSurface: 'cable' }),
            dateWindow: { earliest: '2026-12-20', latest: '2026-12-23' },
        };
        const plan = planSearch(winter, { now: NOW, spots: [fullyCurated('Ibiza Cable Park', 'IBZ')] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_CANDIDATES_MATCH');
    });

    it('ranks a warm venue above a cold one on a warmth preference', () => {
        const plan = planSearch(
            datedIntentOf({ rideSurface: 'cable', climate: 'warm' }),
            {
                now: NOW,
                spots: [fullyCurated('313 Cable Park', 'PLQ'), fullyCurated('Ibiza Cable Park', 'IBZ')],
            },
        );

        expect(plan.calls).toHaveLength(2);
        expect(plan.calls[0].spotLabel).toBe('Ibiza Cable Park');
    });

    // Climate is rule-derived, so the user is told it was inferred.
    it('says which facts it inferred rather than read from the venue', () => {
        const plan = planSearch(
            datedIntentOf({ rideSurface: 'cable', climate: 'warm' }),
            { now: NOW, spots: [fullyCurated('Ibiza Cable Park', 'IBZ')] },
        );

        const inferred = plan.warnings.find((w) => w.kind === 'INFERRED_FACT_USED');
        expect(inferred?.message).toContain('climateBand');
        expect(inferred?.message).toMatch(/confirm before booking/i);
    });

    it('raises no inferred warning when every fact used came from the venue', () => {
        const plan = planSearch(
            datedIntentOf({ rideSurface: 'cable', skillLevel: 'none' }),
            { now: NOW, spots: [fullyCurated('Ibiza Cable Park', 'IBZ')] },
        );

        expect(plan.warnings.map((w) => w.kind)).not.toContain('INFERRED_FACT_USED');
    });
});

describe('defaultWindow', () => {
    it('starts a week out and leaves room for the trip', () => {
        const window = defaultWindow(NOW, 2);
        expect(window.earliest).toBe('2026-09-18');
        expect(window.latest > window.earliest).toBe(true);
    });
});
