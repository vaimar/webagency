import { TripExplorationResponse, TripExploreRequestPayload } from '../types/tripExploration';
import { ExecutionPlan, PlannedCall } from './tripPlanner';
import { buildConfidence, executePlan, ExploreFetcher, hasRealBacking } from './tripSearch';

const call = (spotLabel: string, travelDate = '2026-07-10'): PlannedCall => ({
    spotLabel,
    travelDate,
    request: { origin: 'DUB', destination: spotLabel, travelDate } as TripExploreRequestPayload,
});

const planOf = (labels: string[]): ExecutionPlan => ({
    strategy: 'SHORTLIST_FANOUT',
    calls: labels.map((l) => call(l)),
    warnings: [],
    blocked: null,
    sampledDates: ['2026-07-10'],
});

const payload = (overrides: Partial<TripExplorationResponse> = {}): TripExplorationResponse => ({
    originAirport: 'DUB',
    resolvedArrivalAirport: 'IBZ',
    routeAvailable: true,
    orchestrationStatus: 'OK',
    unifiedFlights: [{
        flightNumber: 'FR1',
        scheduledArrival: '2026-07-10T16:10:00',
        ticketPrice: 89,
        stops: 0,
        antiCauchemar: { ticketPrice: 89, auditedTotalCost: 312, currency: 'EUR' },
    }],
    primaryActivity: { name: 'Cable', distanceKm: 4.2 },
    ...overrides,
});

const fetcherFor = (byDestination: Record<string, TripExplorationResponse | Error>): ExploreFetcher =>
    async (request) => {
        const result = byDestination[request.destination];
        if (result instanceof Error) {
            throw result;
        }
        if (!result) {
            throw new Error(`no fixture for ${request.destination}`);
        }
        return result;
    };

describe('hasRealBacking', () => {
    it('rejects a zero ticket price — the Java primitive default, not a free seat', () => {
        expect(hasRealBacking({ ticketPrice: 0 })).toBe(false);
    });

    it('rejects an empty flight', () => {
        expect(hasRealBacking({})).toBe(false);
        expect(hasRealBacking(null)).toBe(false);
    });

    it('accepts a flight the backend actually priced', () => {
        expect(hasRealBacking({ ticketPrice: 89 })).toBe(true);
        expect(hasRealBacking({ antiCauchemar: { auditedTotalCost: 312 } })).toBe(true);
    });
});

describe('executePlan', () => {
    it('returns nothing but stays well-formed for an empty plan', async () => {
        const result = await executePlan(
            { strategy: 'BLOCKED', calls: [], warnings: [], blocked: null, sampledDates: [] },
        );

        expect(result.options).toEqual([]);
        expect(result.confidence.level).toBe('estimated');
        expect(result.confidence.drivers[0]).toContain('No candidates');
    });

    it('fans out in parallel and shapes each result', async () => {
        const result = await executePlan(planOf(['Ibiza', 'EXO 84']), {
            fetcher: fetcherFor({ Ibiza: payload(), 'EXO 84': payload() }),
        });

        expect(result.options).toHaveLength(2);
        expect(result.options[0].total.amount).toBe(312);
        expect(result.options[0].rideDistanceKm).toBe(4.2);
        expect(result.options[0].arrivalAirport).toBe('IBZ');
    });

    it('survives one failed call without losing the others', async () => {
        const result = await executePlan(planOf(['Ibiza', 'EXO 84']), {
            fetcher: fetcherFor({ Ibiza: payload(), 'EXO 84': new Error('boom') }),
        });

        expect(result.options).toHaveLength(1);
        expect(result.warnings.map((w) => w.kind)).toContain('CALL_FAILED');
        expect(result.warnings.map((w) => w.kind)).toContain('PARTIAL_FANOUT');
    });

    // Rule 5: unbacked options must never reach a card, a score, or a prompt.
    it('drops an option with no route before it can be ranked', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({ Ibiza: payload({ routeAvailable: false }) }),
        });

        expect(result.options).toEqual([]);
        expect(result.warnings.map((w) => w.kind)).toContain('NO_BACKING');
    });

    it('drops an option whose only flight has a zero fare', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({
                Ibiza: payload({ unifiedFlights: [{ flightNumber: 'FR1', ticketPrice: 0 }] }),
            }),
        });

        expect(result.options).toEqual([]);
        expect(result.warnings.find((w) => w.kind === 'NO_BACKING')?.message).toContain('No priced flight');
    });

    it('surfaces a degraded backend rather than hiding it', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({ Ibiza: payload({ orchestrationStatus: 'DEGRADED' }) }),
        });

        expect(result.warnings.map((w) => w.kind)).toContain('BACKEND_DEGRADED');
        expect(result.confidence.level).toBe('estimated');
    });

    it('labels a total by its weakest cost line', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({
                Ibiza: payload({
                    unifiedFlights: [{
                        ticketPrice: 89,
                        antiCauchemar: {
                            auditedTotalCost: 312,
                            priceBreakdown: {
                                baseFare: { amount: 89, currency: 'EUR', status: 'EXACT', note: '' },
                                shuttleFee: { amount: null, currency: 'EUR', status: 'MANUAL_CHECK_REQUIRED', note: '' },
                            },
                        },
                    }],
                }),
            }),
        });

        expect(result.options[0].total.status).toBe('MANUAL_CHECK_REQUIRED');
        expect(result.warnings.map((w) => w.kind)).toContain('MANUAL_CHECK_REQUIRED');
    });

    it('flags a cached price as stale', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({
                Ibiza: payload({
                    unifiedFlights: [{
                        ticketPrice: 89,
                        priceLabel: 'Estimated (Cached)',
                        antiCauchemar: { auditedTotalCost: 312 },
                    }],
                }),
            }),
        });

        expect(result.warnings.map((w) => w.kind)).toContain('STALE_PRICE');
        expect(result.confidence.staleQuotes).toBe(1);
    });

    it('ranks by the requested profile', async () => {
        const cheapGrim = payload({
            unifiedFlights: [{
                ticketPrice: 100, stops: 2, scheduledArrival: '2026-07-10T23:50:00',
                totalDurationMinutes: 400,
                antiCauchemar: { auditedTotalCost: 180 },
            }],
        });
        const pricierEasy = payload({
            unifiedFlights: [{
                ticketPrice: 300, stops: 0, scheduledArrival: '2026-07-10T15:00:00',
                totalDurationMinutes: 150,
                antiCauchemar: { auditedTotalCost: 340 },
            }],
        });
        const fetcher = fetcherFor({ Ibiza: cheapGrim, 'EXO 84': pricierEasy });

        const cheap = await executePlan(planOf(['Ibiza', 'EXO 84']), { fetcher, profile: 'cheapest_honest' });
        const calm = await executePlan(planOf(['Ibiza', 'EXO 84']), { fetcher, profile: 'least_friction' });

        expect(cheap.options[0].spotLabel).toBe('Ibiza');
        expect(calm.options[0].spotLabel).toBe('EXO 84');
    });

    it('reports the candidate spread for the budget question', async () => {
        const result = await executePlan(planOf(['Ibiza', 'EXO 84']), {
            fetcher: fetcherFor({
                Ibiza: payload({ unifiedFlights: [{ ticketPrice: 90, antiCauchemar: { auditedTotalCost: 180 } }] }),
                'EXO 84': payload({ unifiedFlights: [{ ticketPrice: 300, antiCauchemar: { auditedTotalCost: 540 } }] }),
            }),
        });

        expect(result.candidateSpread).toBe(3);
    });

    it('keeps raw payloads for the detail tabs', async () => {
        const result = await executePlan(planOf(['Ibiza']), {
            fetcher: fetcherFor({ Ibiza: payload() }),
        });

        expect(Object.keys(result.payloads)).toEqual(['Ibiza::2026-07-10']);
    });
});

describe('buildConfidence', () => {
    const opt = (status: 'EXACT' | 'ESTIMATED') => ({
        total: { status, amount: 1, currency: 'EUR' },
    }) as never;

    it('is live only when everything is exact, fresh and complete', () => {
        const confidence = buildConfidence({
            searched: 2, returned: 2, staleQuotes: 0, manualChecks: 0,
            orchestrationStatuses: ['OK', 'OK'], options: [opt('EXACT'), opt('EXACT')],
        });

        expect(confidence.level).toBe('live');
    });

    it('drops to estimated on any manual check', () => {
        expect(buildConfidence({
            searched: 1, returned: 1, staleQuotes: 0, manualChecks: 1,
            orchestrationStatuses: ['OK'], options: [opt('EXACT')],
        }).level).toBe('estimated');
    });

    it('explains itself in plain language', () => {
        const confidence = buildConfidence({
            searched: 3, returned: 1, staleQuotes: 1, manualChecks: 0,
            orchestrationStatuses: ['OK'], options: [opt('ESTIMATED')],
        });

        expect(confidence.drivers.join(' ')).toContain('2 of 3 searches returned nothing usable');
        expect(confidence.drivers.join(' ')).toContain('1 price came from cache');
    });
});
