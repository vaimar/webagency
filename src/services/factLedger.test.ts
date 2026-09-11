import { UnifiedFlightOption } from '../types/tripExploration';
import {
    createLedger,
    Ledger,
    renderLedgerForPrompt,
    validateNarrative,
} from './factLedger';

const flight: UnifiedFlightOption = {
    flightNumber: 'FR1234',
    airline: 'Ryanair',
    departureAirport: 'DUB',
    arrivalAirport: 'IBZ',
    scheduledArrival: '2026-07-10T16:10:00',
    ticketPrice: 89,
    stops: 0,
    antiCauchemar: {
        ticketPrice: 89,
        auditedTotalCost: 312,
        currency: 'EUR',
        manualCheckRequired: false,
    },
};

const buildLedger = (): Ledger => {
    const builder = createLedger();
    builder.addFlightFacts('Ibiza', flight, {
        endpoint: 'POST /api/trips/explore',
        basePath: 'unifiedFlights[0]',
        fetchedAt: '2026-09-11T07:00:00Z',
    });
    return builder.build();
};

describe('createLedger', () => {
    it('records the honest total, not the marketing fare, as the price fact', () => {
        const ledger = buildLedger();
        const honest = Object.values(ledger).find((f) => f.label.startsWith('honest total'));

        expect(honest?.raw).toBe(312);
        expect(honest?.display).toContain('312');
        expect(honest?.source.path).toBe('unifiedFlights[0].antiCauchemar.auditedTotalCost');
    });

    it('attributes every fact to an endpoint and a path', () => {
        for (const fact of Object.values(buildLedger())) {
            expect(fact.source.endpoint).toBe('POST /api/trips/explore');
            expect(fact.source.path).toContain('unifiedFlights[0]');
            expect(fact.id).toMatch(/^f\d+$/);
        }
    });

    it('omits facts the backend did not provide rather than inventing them', () => {
        const builder = createLedger();
        builder.addFlightFacts('Bare', { flightNumber: 'XX1' }, {
            endpoint: 'POST /api/trips/explore', basePath: 'unifiedFlights[1]', fetchedAt: null,
        });

        expect(Object.keys(builder.build())).toHaveLength(0);
    });

    it('renders a prompt view carrying display values and statuses only', () => {
        const prompt = renderLedgerForPrompt(buildLedger());

        expect(prompt).toContain('honest total, Ibiza');
        expect(prompt).toContain('[ESTIMATED]');
        // The raw payload must never leak into the prompt.
        expect(prompt).not.toContain('auditedTotalCost');
    });
});

describe('validateNarrative', () => {
    const ledger = buildLedger();
    const priceId = Object.values(ledger).find((f) => f.label.startsWith('honest total'))!.id;
    const arrivalId = Object.values(ledger).find((f) => f.label.startsWith('arrival'))!.id;

    it('substitutes tokens into the final text', () => {
        const result = validateNarrative(`Ibiza comes to {{${priceId}}} all in.`, ledger);

        expect(result.ok).toBe(true);
        expect(result.text).toContain('312');
        expect(result.text).not.toContain('{{');
    });

    it('rejects a number the model wrote itself', () => {
        const result = validateNarrative('Ibiza comes to about €310 all in.', ledger);

        expect(result.ok).toBe(false);
        expect(result.violations[0].kind).toBe('BARE_NUMBER');
    });

    // The scan must run on the template with tokens removed. Checking after
    // substitution would see the substituted digits and reject everything.
    it('does not mistake a substituted value for a model-written number', () => {
        const result = validateNarrative(`Lands {{${arrivalId}}} and costs {{${priceId}}}.`, ledger);

        expect(result.ok).toBe(true);
        expect(result.violations).toEqual([]);
    });

    it('rejects a token that names no fact', () => {
        const result = validateNarrative('It costs {{f99}}.', ledger);

        expect(result.ok).toBe(false);
        expect(result.violations[0].kind).toBe('UNKNOWN_TOKEN');
    });

    it('rejects promises the backend never made', () => {
        expect(validateNarrative('Book now before it is sold out.', ledger).violations.map((v) => v.kind))
            .toContain('BANNED_PHRASE');
    });

    it('rejects talk of seasons when no season fact backs it', () => {
        const result = validateNarrative('The park is open all year, so any week works.', ledger);

        expect(result.ok).toBe(false);
        expect(result.violations.some((v) => v.kind === 'UNBACKED_TOPIC')).toBe(true);
    });

    it('allows season talk once a season fact is in the ledger', () => {
        const builder = createLedger();
        builder.add({
            label: 'season, Ibiza',
            display: 'April to October',
            raw: '04-01/10-31',
            topic: 'season',
            source: { endpoint: 'rideSpots.ts', path: 'openingSeason', fetchedAt: null },
        });

        const result = validateNarrative('The park is open across those dates.', builder.build());
        expect(result.ok).toBe(true);
    });

    it('rejects spelled-out magnitudes', () => {
        expect(validateNarrative('It costs a few hundred euro.', ledger).violations.map((v) => v.kind))
            .toContain('BARE_NUMBER');
    });

    it('leaves the template untouched when it fails, so nothing half-valid ships', () => {
        const result = validateNarrative(`Costs {{${priceId}}} but also about €99 more.`, ledger);

        expect(result.ok).toBe(false);
        expect(result.text).toContain('{{');
    });
});
