import { getAntiCauchemarPricingSummary, getComparableFlightPrice } from './antiCauchemarPricing';

describe('antiCauchemarPricing', () => {
    it('uses a concrete breakdown when the backend explains the extra cost', () => {
        const summary = getAntiCauchemarPricingSummary(99, {
            realWorldEntryPrice: 142,
            airportShuttleEstimate: 19,
            cabinBagEstimate: 24,
            currency: 'EUR',
        });

        expect(summary.hasConcreteBreakdown).toBe(true);
        expect(summary.estimatedEntryPrice).toBe(142);
        expect(getComparableFlightPrice(99, {
            realWorldEntryPrice: 142,
            airportShuttleEstimate: 19,
            cabinBagEstimate: 24,
            currency: 'EUR',
        })).toBe(142);
    });

    it('falls back to the ticket fare when the uplift is opaque', () => {
        const summary = getAntiCauchemarPricingSummary(99, {
            realWorldEntryPrice: 142,
            hiddenCostPenalty: 43,
            theCatch: 'Something might cost more later.',
            currency: 'EUR',
        });

        expect(summary.hasConcreteBreakdown).toBe(false);
        expect(summary.hasOpaquePenalty).toBe(true);
        expect(summary.estimatedEntryPrice).toBeUndefined();
        expect(getComparableFlightPrice(99, {
            realWorldEntryPrice: 142,
            hiddenCostPenalty: 43,
            currency: 'EUR',
        })).toBe(99);
    });
});

