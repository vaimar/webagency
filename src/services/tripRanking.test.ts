import {
    getCandidateSpread,
    projectOption,
    RankableOption,
    rankOptions,
    scoreOptions,
    WEIGHT_VECTORS,
} from './tripRanking';

const option = (id: string, metrics: Partial<RankableOption['metrics']>): RankableOption => ({
    id,
    label: id,
    metrics: {
        honestTotal: null, transitMinutes: null, stops: null,
        arrivalRisk: null, unverifiedLines: null, rideDistanceKm: null, stayScore: null,
        ...metrics,
    },
});

describe('scoreOptions', () => {
    it('orients lower-is-better metrics so the cheapest scores highest', () => {
        const scored = scoreOptions(
            [option('cheap', { honestTotal: 200 }), option('dear', { honestTotal: 500 })],
            'cheapest_honest',
        );

        expect(scored.find((s) => s.id === 'cheap')!.components.honestCost).toBe(1);
        expect(scored.find((s) => s.id === 'dear')!.components.honestCost).toBe(0);
    });

    it('orients stay quality the other way — higher is better', () => {
        const scored = scoreOptions(
            [option('good', { stayScore: 9 }), option('poor', { stayScore: 3 })],
            'balanced',
        );

        expect(scored.find((s) => s.id === 'good')!.components.stayQuality).toBe(1);
        expect(scored.find((s) => s.id === 'poor')!.components.stayQuality).toBe(0);
    });

    it('drops a component no candidate has data for', () => {
        const scored = scoreOptions([option('a', { honestTotal: 200 })], 'balanced');

        expect(scored[0].missingComponents).toContain('stayQuality');
        expect(scored[0].components.stayQuality).toBeUndefined();
    });

    // The important one: an unknown must not be scored as the worst case.
    it('does not penalise a candidate for a field it simply lacks', () => {
        const withStay = option('withStay', { honestTotal: 300, stayScore: 9 });
        const noStay = option('noStay', { honestTotal: 300 });
        const scored = scoreOptions([withStay, noStay], 'balanced');

        const noStayScore = scored.find((s) => s.id === 'noStay')!;
        expect(noStayScore.components.stayQuality).toBeUndefined();
        // Equal on price, so the missing component leaves it at the same score,
        // not dragged to zero.
        expect(noStayScore.score).toBe(1);
    });

    it('treats a component every candidate ties on as non-separating', () => {
        const scored = scoreOptions(
            [option('a', { honestTotal: 300 }), option('b', { honestTotal: 300 })],
            'cheapest_honest',
        );

        expect(scored[0].score).toBe(scored[1].score);
    });

    it('counts a stop as extra friction beyond its clock time', () => {
        const direct = option('direct', { transitMinutes: 180, stops: 0 });
        const oneStop = option('oneStop', { transitMinutes: 180, stops: 1 });
        const scored = scoreOptions([direct, oneStop], 'least_friction');

        expect(scored.find((s) => s.id === 'direct')!.components.transitFriction).toBe(1);
        expect(scored.find((s) => s.id === 'oneStop')!.components.transitFriction).toBe(0);
    });

    it('scores zero when nothing at all is measurable', () => {
        expect(scoreOptions([option('empty', {})], 'balanced')[0].score).toBe(0);
    });
});

describe('the profile changes the winner, not the candidate set', () => {
    const cheapButGrim = option('cheapButGrim', {
        honestTotal: 180, transitMinutes: 400, stops: 2, arrivalRisk: 2, unverifiedLines: 3, rideDistanceKm: 30,
    });
    const pricierButEasy = option('pricierButEasy', {
        honestTotal: 340, transitMinutes: 150, stops: 0, arrivalRisk: 0, unverifiedLines: 0, rideDistanceKm: 4,
    });
    const candidates = [cheapButGrim, pricierButEasy];

    it('picks the cheap one on cheapest_honest', () => {
        expect(rankOptions(candidates, 'cheapest_honest')[0].id).toBe('cheapButGrim');
    });

    it('picks the calm one on least_friction — "even if it costs more"', () => {
        expect(rankOptions(candidates, 'least_friction')[0].id).toBe('pricierButEasy');
    });

    it('picks the close-to-the-water one on most_ride_time', () => {
        expect(rankOptions(candidates, 'most_ride_time')[0].id).toBe('pricierButEasy');
    });

    it('keeps both candidates whatever the profile', () => {
        expect(rankOptions(candidates, 'cheapest_honest')).toHaveLength(2);
        expect(rankOptions(candidates, 'least_friction')).toHaveLength(2);
    });
});

describe('rankOptions', () => {
    it('returns best-first and honours the limit', () => {
        const ranked = rankOptions([
            option('mid', { honestTotal: 300 }),
            option('best', { honestTotal: 100 }),
            option('worst', { honestTotal: 900 }),
        ], 'cheapest_honest', 2);

        expect(ranked.map((r) => r.id)).toEqual(['best', 'mid']);
    });

    it('breaks ties stably by label', () => {
        const ranked = rankOptions([
            option('zulu', { honestTotal: 300 }),
            option('alpha', { honestTotal: 300 }),
        ], 'balanced');

        expect(ranked.map((r) => r.id)).toEqual(['alpha', 'zulu']);
    });
});

describe('projectOption', () => {
    it('takes the honest total, never the marketing fare', () => {
        const projected = projectOption({
            id: 'ibiza',
            label: 'Ibiza',
            flight: {
                ticketPrice: 89,
                stops: 0,
                antiCauchemar: { ticketPrice: 89, auditedTotalCost: 312, currency: 'EUR' },
            },
        });

        expect(projected.metrics.honestTotal).toBe(312);
    });

    it('counts non-EXACT cost lines as uncertainty', () => {
        const projected = projectOption({
            id: 'x',
            label: 'X',
            flight: {
                antiCauchemar: {
                    priceBreakdown: {
                        baseFare: { amount: 89, currency: 'EUR', status: 'EXACT', note: '' },
                        shuttleFee: { amount: null, currency: 'EUR', status: 'MANUAL_CHECK_REQUIRED', note: '' },
                        baggageEstimate: { amount: 25, currency: 'EUR', status: 'ESTIMATED', note: '' },
                    },
                },
            },
        });

        expect(projected.metrics.unverifiedLines).toBe(2);
    });

    it('flags a late arrival as risk', () => {
        const late = projectOption({
            id: 'late', label: 'Late', flight: { scheduledArrival: '2026-07-10T23:55:00' },
        });
        const fine = projectOption({
            id: 'fine', label: 'Fine', flight: { scheduledArrival: '2026-07-10T16:10:00' },
        });

        expect(late.metrics.arrivalRisk).toBe(1);
        expect(fine.metrics.arrivalRisk).toBe(0);
    });

    it('adds the drive to a fly-drive hub onto transit time', () => {
        const projected = projectOption({
            id: 'flydrive', label: 'Fly-drive',
            flight: { totalDurationMinutes: 150, originDriveMinutes: 90 },
        });

        expect(projected.metrics.transitMinutes).toBe(240);
    });

    it('reports an unknown rather than a zero when the backend gave nothing', () => {
        const projected = projectOption({ id: 'bare', label: 'Bare', flight: {} });

        expect(projected.metrics.honestTotal).toBeNull();
        expect(projected.metrics.unverifiedLines).toBeNull();
        expect(projected.metrics.stayScore).toBeNull();
    });
});

describe('getCandidateSpread', () => {
    it('measures dearest over cheapest for the materiality gate', () => {
        expect(getCandidateSpread([
            option('a', { honestTotal: 180 }),
            option('b', { honestTotal: 540 }),
        ])).toBe(3);
    });

    it('is undefined when there is nothing to compare', () => {
        expect(getCandidateSpread([option('a', { honestTotal: 180 })])).toBeUndefined();
        expect(getCandidateSpread([])).toBeUndefined();
    });
});

describe('weight vectors', () => {
    it('keeps least_friction weighted away from price and toward calm', () => {
        const calm = WEIGHT_VECTORS.least_friction;
        const cheap = WEIGHT_VECTORS.cheapest_honest;

        expect(calm.arrivalRisk).toBeGreaterThan(calm.honestCost);
        expect(cheap.honestCost).toBeGreaterThan(cheap.arrivalRisk);
    });
});
