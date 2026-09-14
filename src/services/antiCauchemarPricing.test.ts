import { getAntiCauchemarPricingSummary, getComparableFlightPrice, rebaseFare, stripCabinBag } from './antiCauchemarPricing';

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

describe('rebaseFare', () => {
    // Ryanair quotes the day's cheapest — €21.99 for the 08:35 — against a
    // 17:15 flight that really costs €34.78.
    const dayFloor = {
        ticketPrice: 21.99,
        cabinBagEstimate: 24,
        airportShuttleEstimate: 5,
        realCost: 50.99,
        realWorldEntryPrice: 50.99,
        auditedTotalCost: 110.99,
        theCatch: 'PRICE TRANSPARENCY: This flight advertised at 22 EUR really costs 111 EUR all-in.',
        currency: 'EUR',
    };

    it('moves every total by the fare difference and leaves the extras alone', () => {
        const rebased = rebaseFare(dayFloor, 34.78);

        expect(rebased.ticketPrice).toBe(34.78);
        expect(rebased.realCost).toBe(63.78);
        // +12.79 on the fare, and not a cent on the bag, transfer or markup.
        expect(rebased.auditedTotalCost).toBe(123.78);
        expect(rebased.cabinBagEstimate).toBe(24);
        expect(rebased.airportShuttleEstimate).toBe(5);
    });

    it('drops the catch, which quotes a fare that is no longer the fare', () => {
        expect(rebaseFare(dayFloor, 34.78).theCatch).toBeUndefined();
    });

    it('changes nothing when there is no fare to rebase from', () => {
        const noFare = { cabinBagEstimate: 24, currency: 'EUR' };
        expect(rebaseFare(noFare, 34.78)).toBe(noFare);
    });
});
