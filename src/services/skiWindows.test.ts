import { LowCrowdWindowResponse, SkiWindow } from './api';
import {
    crowdBand,
    crowdLabel,
    eligibleWindows,
    excludedWindows,
    formatWindowRange,
    headlineReason,
    isSoft,
    monthSearchRange,
    priceIsIndicativeOnly,
    priceTierLabel,
    significantOverlaps,
} from './skiWindows';

const baseWindow = (overrides: Partial<SkiWindow> = {}): SkiWindow => ({
    rank: 1,
    start: '2027-03-13',
    end: '2027-03-20',
    nights: 7,
    eligible: true,
    totalScore: 90.2,
    components: { crowdScore: 98.2, priceScore: null, snowScore: 83.9, flexScore: 70.2 },
    metrics: {
        crowdIndex: 1.8,
        priceTier: 2,
        priceIndex: 0.81,
        priceResidual: null,
        priceSource: 'MODELLED',
        snowReliabilityBase: 0.56,
        snowReliabilityTop: 0.99,
        snowSource: 'MODELLED_CLIMATOLOGY',
    },
    holidayOverlap: [],
    explain: [],
    exclusions: [],
    ...overrides,
});

describe('formatWindowRange', () => {
    it('shows both ends of a Saturday-to-Saturday week', () => {
        // The end date is exclusive — it is the day you travel home — and showing
        // it matters: a let ending on the 20th is not the same as one ending
        // on the 19th.
        expect(formatWindowRange(baseWindow())).toBe('Sat 13 – Sat 20 Mar');
    });

    it('spells out the month on both sides when a week straddles one', () => {
        expect(formatWindowRange(baseWindow({ start: '2027-02-27', end: '2027-03-06' })))
            .toBe('Sat 27 Feb – Sat 6 Mar');
    });

    it('falls back to raw dates rather than rendering Invalid Date', () => {
        expect(formatWindowRange(baseWindow({ start: 'nonsense', end: 'also-nonsense' })))
            .toBe('nonsense → also-nonsense');
    });
});

describe('crowd banding', () => {
    it('maps the index onto plain language', () => {
        expect(crowdBand(1.8)).toBe('quiet');
        expect(crowdBand(18.6)).toBe('moderate');
        expect(crowdBand(58)).toBe('busy');
        expect(crowdBand(78.7)).toBe('packed');
    });

    it('labels every band', () => {
        expect(crowdLabel(1.8)).toBe('Quiet');
        expect(crowdLabel(78.7)).toBe('Packed');
    });
});

describe('significantOverlaps', () => {
    it('drops negligible calendars and sorts by weighted impact', () => {
        // Ireland carries a weight near zero for a French resort, so it must not
        // be shown as a crowd cause even though it technically overlaps.
        const window = baseWindow({
            holidayOverlap: [
                { authority: 'IE-NATIONAL', displayName: 'Ireland', overlap: 0.05, demandWeight: 0.02, weightedImpact: 0.001 },
                { authority: 'FR-ZONE-B', displayName: 'Zone B', overlap: 0.24, demandWeight: 0.45, weightedImpact: 0.107 },
                { authority: 'FR-ZONE-A', displayName: 'Zone A', overlap: 1.0, demandWeight: 0.95, weightedImpact: 0.95 },
            ],
        });
        expect(significantOverlaps(window).map((o) => o.authority)).toEqual(['FR-ZONE-A', 'FR-ZONE-B']);
    });
});

describe('headlineReason', () => {
    it('leads with the exclusion when a week is unavailable', () => {
        // A user scanning the list needs "you cannot go then" before anything else.
        const window = baseWindow({
            eligible: false,
            totalScore: null,
            rank: null,
            exclusions: [{
                code: 'PERSONAL_UNAVAILABLE',
                detail: 'Overlaps a home school break (Easter), which the requested policy avoids.',
                authority: 'IE-NATIONAL',
                confidence: 'STATED',
            }],
        });
        expect(headlineReason(window)).toContain('Easter');
    });

    it('states plainly when nothing overlaps', () => {
        expect(headlineReason(baseWindow())).toBe('No school break in any calendar that drives this resort');
    });

    it('names the calendars responsible when something does', () => {
        const window = baseWindow({
            holidayOverlap: [
                { authority: 'FR-ZONE-A', displayName: 'Zone A', overlap: 1, demandWeight: 0.95, weightedImpact: 0.95 },
                { authority: 'FR-ZONE-B', displayName: 'Zone B', overlap: 1, demandWeight: 0.45, weightedImpact: 0.45 },
            ],
        });
        expect(headlineReason(window)).toBe('Zone A and Zone B on holiday for part of the week');
    });
});

describe('confidence surfacing', () => {
    it('treats anything weaker than published as soft', () => {
        // Resort season dates and discretionary school closures are genuinely
        // uncertain; presenting them as fact would overstate the ranking.
        expect(isSoft('INFERRED')).toBe(true);
        expect(isSoft('LIKELY')).toBe(true);
        expect(isSoft('STATED')).toBe(false);
        expect(isSoft('CONFIRMED')).toBe(false);
    });
});

describe('price presentation', () => {
    it('flags the tier as indicative when price carries no weight', () => {
        const response = {
            weights: { crowd: 0.563, price: 0, snow: 0.313, flex: 0.125 },
        } as LowCrowdWindowResponse;
        expect(priceIsIndicativeOnly(response)).toBe(true);
    });

    it('does not flag it once real observations are weighted in', () => {
        const response = {
            weights: { crowd: 0.45, price: 0.2, snow: 0.25, flex: 0.1 },
        } as LowCrowdWindowResponse;
        expect(priceIsIndicativeOnly(response)).toBe(false);
    });

    it('labels tiers and tolerates a missing one', () => {
        expect(priceTierLabel(1)).toBe('Cheapest');
        expect(priceTierLabel(5)).toBe('Peak');
        expect(priceTierLabel(null)).toBe('Unknown');
    });
});

describe('window partitioning', () => {
    const response = {
        windows: [
            baseWindow(),
            baseWindow({ start: '2027-03-20', eligible: false, rank: null, totalScore: null }),
        ],
    } as LowCrowdWindowResponse;

    it('separates rankable weeks from ruled-out ones', () => {
        expect(eligibleWindows(response)).toHaveLength(1);
        expect(excludedWindows(response)).toHaveLength(1);
    });

    it('tolerates a null response', () => {
        expect(eligibleWindows(null)).toEqual([]);
        expect(excludedWindows(null)).toEqual([]);
    });
});

describe('monthSearchRange', () => {
    it('pads a week either side so boundary changeover weeks stay candidates', () => {
        // March 2027 starts on a Monday. Without padding, the Saturday week
        // running 27 Feb - 6 March would silently never be considered.
        const range = monthSearchRange(2027, 3);
        expect(range.from).toBe('2027-02-22');
        expect(range.to).toBe('2027-04-07');
    });
});
