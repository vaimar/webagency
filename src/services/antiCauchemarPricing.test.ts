import { getAntiCauchemarPricingSummary, getComparableFlightPrice, stripCabinBag } from './antiCauchemarPricing';

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

    describe('stripCabinBag (small bag only)', () => {
        const bvaTruth = {
            ticketPrice: 18.99,
            airportShuttleEstimate: 17,
            cabinBagEstimate: 24,
            realCost: 59.99,
            auditedTotalCost: 79.99,
            currency: 'EUR',
            theCatch: 'BEAUVAIS WARNING: far out. || PRICE TRANSPARENCY: This flight advertised at 19 EUR really costs 80 EUR all-in.',
            priceBreakdown: {
                baggageEstimate: { amount: 24, currency: 'EUR', status: 'ESTIMATED' as const, note: 'Average cabin-baggage surcharge.' },
            },
        };

        it('removes the bag from every total and zeroes the breakdown line', () => {
            const stripped = stripCabinBag(bvaTruth);
            expect(stripped.cabinBagEstimate).toBe(0);
            expect(stripped.realCost).toBe(35.99);
            expect(stripped.auditedTotalCost).toBe(55.99);
            expect(stripped.priceBreakdown?.baggageEstimate?.amount).toBe(0);
            // The stale with-bag transparency sentence goes; the airport warning stays.
            expect(stripped.theCatch).toContain('BEAUVAIS WARNING');
            expect(stripped.theCatch).not.toContain('PRICE TRANSPARENCY');
        });

        it('is a no-op when there is no bag estimate and never mutates the input', () => {
            expect(stripCabinBag({ ticketPrice: 20, currency: 'EUR' })).toEqual({ ticketPrice: 20, currency: 'EUR' });
            stripCabinBag(bvaTruth);
            expect(bvaTruth.auditedTotalCost).toBe(79.99);
            expect(bvaTruth.priceBreakdown.baggageEstimate.amount).toBe(24);
        });
    });
});

