import { RideSpot, unverified } from '../data/rideSpots';
import { normalizeTripIntent, ResolvedIntent } from './tripIntent';
import { defaultWindow, FANOUT_WIDTH, planSearch, sampleDates } from './tripPlanner';

const NOW = new Date('2026-09-11T09:00:00Z');

const intentOf = (overrides: Partial<ResolvedIntent> = {}): ResolvedIntent => ({
    ...normalizeTripIntent({ origin: 'DUB' }).intent,
    ...overrides,
});

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
    it('excludes a venue whose season is unverified, even when the surface matches', () => {
        const seasonUnknown = spotOf('Hypnotics', 'PGF', { surface: verified('cable') });
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW, spots: [seasonUnknown] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
    });

    it('blocks when nothing is verified, and offers the nearest relaxation', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW, spots: [unknown] });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
        // No single drop helps while everything is unverified, so the last
        // resort is offered instead of a dead end.
        expect(plan.blocked?.relaxation?.dropFilter).toBe('allVenueFacts');
        expect(plan.blocked?.relaxation?.wouldYield).toBe(1);
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
        const cold = curated('313 Cable Park', 'VNO', 'cable', 'cold');
        const plan = planSearch(
            intentOf({ rideSurface: 'cable', climate: 'warm' }),
            { now: NOW, spots: [cold, ibiza] },
        );

        expect(plan.calls).toHaveLength(2);
        expect(plan.calls[0].spotLabel).toBe('Ibiza');
    });

    it('treats the shipped all-unverified catalogue as blocked, not empty', () => {
        const plan = planSearch(intentOf({ rideSurface: 'cable' }), { now: NOW });

        expect(plan.strategy).toBe('BLOCKED');
        expect(plan.blocked?.reason).toBe('NO_VERIFIED_CANDIDATES');
    });
});

describe('defaultWindow', () => {
    it('starts a week out and leaves room for the trip', () => {
        const window = defaultWindow(NOW, 2);
        expect(window.earliest).toBe('2026-09-18');
        expect(window.latest > window.earliest).toBe(true);
    });
});
