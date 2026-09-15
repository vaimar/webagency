/**
 * Combined trip total — criteria 1–13 of docs/specs/combined-trip-total.md (rev 4.1).
 *
 * Every test name starts with its criterion number so a failure maps straight
 * back to the spec. Vector V1 (spec section 8) is the Ryanair DUB → NCE fare at
 * €49.99 with a €74.99 audited all-in for 2 travellers, plus a €149.89 room for
 * 3 nights: 9998 + 44967 = 54965 cents on the fare, 14998 + 44967 = 59965 all-in.
 */
import { describe, expect, it } from 'vitest';
import type { FlightAvailable } from './api';
import type { NearbyStay } from './stayGuide';
import type { TotalComponent, TripTotalInput } from './tripTotal';
import {
    combineTripTotal,
    flightPickId,
    outboundFromFlight,
    stayFromNearby,
} from './tripTotal';

const v1Flight = (overrides: Partial<FlightAvailable> = {}): FlightAvailable => ({
    origin: 'DUB',
    destination: 'NCE',
    airline: 'Ryanair',
    departureDate: '2026-10-03T07:00:00',
    price: 49.99,
    currency: 'EUR',
    antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, currency: 'EUR' },
    ...overrides,
});

const v1Stay = (overrides: Partial<NearbyStay> = {}): NearbyStay => ({
    id: 'g1-d2',
    name: 'Hôtel Le Lac',
    category: 'hotel',
    distanceKm: 2.4,
    pricePerNight: 149.89,
    priceCurrency: 'EUR',
    rating: 4.4,
    reviewsCount: 312,
    curated: true,
    ...overrides,
});

const v1Input = (overrides: Partial<TripTotalInput> = {}): TripTotalInput => ({
    outbound: outboundFromFlight(v1Flight()),
    stay: stayFromNearby(v1Stay()),
    nights: 3,
    travellers: 2,
    arrivalAirport: 'NCE',
    hasTariff: true,
    ...overrides,
});

/** A component built by hand rather than by an adapter, for the states adapters never emit. */
const handBuiltStay = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
    id: 'hand-built',
    kind: 'stay',
    label: 'Hand-built stay',
    unitAmount: 149.89,
    currency: 'EUR',
    basis: 'estimate',
    note: null,
    ...overrides,
});

const EXCLUDED_NCE_WITH_TARIFF = [
    'Flight home',
    'Getting from NCE to the spot',
    'Riding (see the tariff above)',
    'Food and gear hire',
];

describe('combineTripTotal', () => {
    it('C1: totals V1 to 54965 cents on the fare and 59965 all-in, both lines included, both prefixes ≈', () => {
        const total = combineTripTotal(v1Input());

        expect(total.currency).toBe('EUR');
        expect(total.lines.map((line) => line.kind)).toEqual(['outbound-flight', 'stay']);
        expect(total.lines.map((line) => line.state)).toEqual(['included', 'included']);
        expect(total.totalCents).toBe(54965);
        expect(total.allInCents).toBe(59965);
        expect(total.prefix).toBe('≈ ');
        expect(total.allInPrefix).toBe('≈ ');
    });

    describe('C2: a line not chosen', () => {
        it('leaves the flight out of both sums and marks the total a floor', () => {
            const total = combineTripTotal(v1Input({ outbound: null }));

            expect(total.lines[0]).toMatchObject({ kind: 'outbound-flight', state: 'not-chosen', component: null, amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(44967);
            expect(total.allInCents).toBe(44967);
            expect(total.prefix).toBe('from ');
        });

        it('leaves the stay out of both sums and marks the total a floor', () => {
            const total = combineTripTotal(v1Input({ stay: null }));

            expect(total.lines[1]).toMatchObject({ kind: 'stay', state: 'not-chosen', component: null, amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });

        it('has no total at all when nothing is chosen', () => {
            const total = combineTripTotal(v1Input({ outbound: null, stay: null }));

            expect(total.lines.map((line) => line.state)).toEqual(['not-chosen', 'not-chosen']);
            expect(total.totalCents).toBeNull();
            expect(total.allInCents).toBeNull();
        });
    });

    describe('C3: a stay with no usable nightly rate is never priced by default', () => {
        it.each([
            ['null', null],
            ['0', 0],
            ['negative', -20],
            ['NaN', Number.NaN],
        ])('pricePerNight %s → manual-check, unpriced, not summed', (_label, pricePerNight) => {
            const stay = stayFromNearby(v1Stay({ pricePerNight }));
            expect(stay.basis).toBe('manual-check');
            expect(stay.unitAmount).toBeNull();

            const total = combineTripTotal(v1Input({ stay }));
            expect(total.lines[1]).toMatchObject({ state: 'unpriced', amountCents: null, allInCents: null });
            // Only the flight is in either sum: no nightly amount was substituted.
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });
    });

    describe('C4: currency', () => {
        it.each(['GBP', 'CHF'])('a priced %s stay is not converted and stays out of both sums', (currency) => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency, unitAmount: 150 }) }));

            expect(total.lines[1]).toMatchObject({ state: 'not-converted', amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });

        it('a GBP flight is excluded from the all-in too, not only the headline', () => {
            const total = combineTripTotal(v1Input({ outbound: outboundFromFlight(v1Flight({ currency: 'GBP' })) }));

            expect(total.lines[0].state).toBe('not-converted');
            expect(total.totalCents).toBe(44967);
            expect(total.allInCents).toBe(44967);
            expect(total.prefix).toBe('from ');
            expect(total.allInPrefix).toBe('from ');
        });

        it('reads a missing flight currency and a missing stay currency as EUR and sums both', () => {
            const outbound = outboundFromFlight(v1Flight({ currency: undefined }));
            const stay = stayFromNearby(v1Stay({ priceCurrency: undefined }));
            expect(outbound.currency).toBe('EUR');
            expect(stay.currency).toBe('EUR');

            const total = combineTripTotal(v1Input({ outbound, stay }));
            expect(total.lines.map((line) => line.state)).toEqual(['included', 'included']);
            expect(total.totalCents).toBe(54965);
        });

        it('sums a hand-built component with currency "" as EUR', () => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency: '' }) }));

            expect(total.lines[1].state).toBe('included');
            expect(total.totalCents).toBe(54965);
        });

        it('compares currency case-insensitively', () => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency: 'eur' }) }));

            expect(total.lines[1].state).toBe('included');
        });

        it('takes the flight currency from flight.currency, never from antiCauchemar.currency', () => {
            const euroFare = outboundFromFlight(v1Flight({
                currency: 'EUR',
                antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, currency: 'GBP' },
            }));
            const sterlingFare = outboundFromFlight(v1Flight({
                currency: 'GBP',
                antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, currency: 'EUR' },
            }));

            expect(euroFare.currency).toBe('EUR');
            expect(sterlingFare.currency).toBe('GBP');
        });
    });

    it('C5: leads with the fare — the V1 flight line is 9998 cents, and the all-in uses auditedTotalCost', () => {
        const outbound = outboundFromFlight(v1Flight());
        expect(outbound.unitAmount).toBe(49.99);
        expect(outbound.allInUnitAmount).toBe(74.99);

        const flightLine = combineTripTotal(v1Input()).lines[0];
        expect(flightLine.amountCents).toBe(9998);
        expect(flightLine.amountCents).not.toBe(14998);
        expect(flightLine.allInCents).toBe(14998);
    });

    describe('C6: all-in precedence', () => {
        it('recomputes fare + cabin bag + shuttle when there is no auditedTotalCost', () => {
            const outbound = outboundFromFlight(v1Flight({
                antiCauchemar: { ticketPrice: 49.99, cabinBagEstimate: 24, airportShuttleEstimate: 5, currency: 'EUR' },
            }));

            expect(outbound.allInUnitAmount).toBeCloseTo(78.99, 9);
            expect(combineTripTotal(v1Input({ outbound })).lines[0].allInCents).toBe(7899 * 2);
        });

        it('never uses doorToTripPrice, even when it is present', () => {
            const outbound = outboundFromFlight(v1Flight({
                doorToTripPrice: 999,
                antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, doorToTripPrice: 999, currency: 'EUR' },
            }));

            expect(outbound.allInUnitAmount).toBe(74.99);
            expect(combineTripTotal(v1Input({ outbound })).lines[0].allInCents).toBe(14998);
        });
    });

    it('C7: with no antiCauchemar the flight all-in is unknown, falls back to the fare, and only the all-in reads "from"', () => {
        const outbound = outboundFromFlight(v1Flight({ antiCauchemar: undefined }));
        expect(outbound.allInUnitAmount).toBeNull();

        const total = combineTripTotal(v1Input({ outbound }));
        expect(total.lines[0].allInCents).toBe(total.lines[0].amountCents);
        expect(total.allInCents).toBe(9998 + 44967);
        expect(total.prefix).toBe('≈ ');
        expect(total.allInPrefix).toBe('from ');
    });

    describe('C8: MANUAL_CHECK_REQUIRED', () => {
        it('flags manualCheckRequired and makes the all-in a floor', () => {
            const outbound = outboundFromFlight(v1Flight({
                antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, manualCheckRequired: true, currency: 'EUR' },
            }));
            expect(outbound.manualCheck).toBe(true);

            const total = combineTripTotal(v1Input({ outbound }));
            expect(total.allInPrefix).toBe('from ');
            expect(total.prefix).toBe('≈ ');
        });

        it('flags a shuttle fee the backend could not validate', () => {
            const outbound = outboundFromFlight(v1Flight({
                antiCauchemar: {
                    ticketPrice: 49.99,
                    auditedTotalCost: 74.99,
                    currency: 'EUR',
                    priceBreakdown: { shuttleFee: { amount: null, currency: 'EUR', status: 'MANUAL_CHECK_REQUIRED' } },
                },
            }));
            expect(outbound.manualCheck).toBe(true);

            expect(combineTripTotal(v1Input({ outbound })).allInPrefix).toBe('from ');
        });

        it('does not flag a V1 flight', () => {
            expect(outboundFromFlight(v1Flight()).manualCheck).toBeFalsy();
        });
    });

    describe('C9: integer-cent arithmetic', () => {
        it('V2: €10.40 fare for 1 plus €10.40 for 1 night is exactly 2080 cents', () => {
            const total = combineTripTotal(v1Input({
                outbound: outboundFromFlight(v1Flight({ price: 10.4, antiCauchemar: undefined })),
                stay: stayFromNearby(v1Stay({ pricePerNight: 10.4 })),
                travellers: 1,
                nights: 1,
            }));

            expect(total.totalCents).toBe(2080);
        });

        it('adds 0.10 and 0.20 to exactly 30 cents, with no float residue', () => {
            const total = combineTripTotal(v1Input({
                outbound: outboundFromFlight(v1Flight({ price: 0.1, antiCauchemar: undefined })),
                stay: stayFromNearby(v1Stay({ pricePerNight: 0.2 })),
                travellers: 1,
                nights: 1,
            }));

            expect(total.totalCents).toBe(30);
            expect(Number.isInteger(total.totalCents)).toBe(true);
        });
    });

    describe('C10: clamping nights to 1..14 and travellers to 1..9', () => {
        it.each([
            [0, 1, 1],
            [20, 14, 9],
            [2.5, 3, 3],
            [2.6, 3, 3],
            [Number.NaN, 1, 1],
            [Number.POSITIVE_INFINITY, 1, 1],
        ])('%s → %s nights and %s travellers, and the amounts use the clamped values', (raw, nights, travellers) => {
            const total = combineTripTotal(v1Input({ nights: raw, travellers: raw }));

            expect(total.nights).toBe(nights);
            expect(total.travellers).toBe(travellers);
            expect(total.lines[0].quantity).toBe(travellers);
            expect(total.lines[1].quantity).toBe(nights);
            expect(total.lines[0].amountCents).toBe(4999 * travellers);
            expect(total.lines[1].amountCents).toBe(14989 * nights);
        });
    });

    describe('C11: the excluded list', () => {
        it('always lists the four exclusions in order, with the arrival airport substituted', () => {
            expect(combineTripTotal(v1Input()).excluded).toEqual(EXCLUDED_NCE_WITH_TARIFF);
            expect(combineTripTotal(v1Input({ outbound: null, stay: null })).excluded).toEqual(EXCLUDED_NCE_WITH_TARIFF);
            expect(combineTripTotal(v1Input({ arrivalAirport: 'BCN' })).excluded[1]).toBe('Getting from BCN to the spot');
        });

        it('says there is no tariff on file when the spot has none', () => {
            expect(combineTripTotal(v1Input({ hasTariff: false })).excluded).toEqual([
                'Flight home',
                'Getting from NCE to the spot',
                'Riding (no tariff on file yet)',
                'Food and gear hire',
            ]);
        });
    });

    describe('C12: FlightAvailable.price as a string', () => {
        it('parses "49.99" to 49.99 and sums it', () => {
            const outbound = outboundFromFlight(v1Flight({ price: '49.99' }));
            expect(outbound.unitAmount).toBe(49.99);

            const total = combineTripTotal(v1Input({ outbound }));
            expect(total.lines[0]).toMatchObject({ state: 'included', amountCents: 9998 });
        });

        it('treats an unparseable price as no price, so the line is unpriced', () => {
            const outbound = outboundFromFlight(v1Flight({ price: 'call us' }));
            expect(outbound.unitAmount).toBeNull();

            expect(combineTripTotal(v1Input({ outbound })).lines[0].state).toBe('unpriced');
        });
    });
});

describe('C13: adapters, label and precedence', () => {
    it('gives the flight a stable pick id, the same one flightPickId computes', () => {
        const flight = v1Flight();

        expect(outboundFromFlight(flight).id).toBe('DUB|NCE|2026-10-03T07:00:00|Ryanair');
        expect(outboundFromFlight(flight).id).toBe(flightPickId(flight));
        expect(outboundFromFlight(flight).kind).toBe('outbound-flight');
    });

    it('keeps the stay id and name from NearbyStay', () => {
        const stay = stayFromNearby(v1Stay());

        expect(stay.id).toBe('g1-d2');
        expect(stay.kind).toBe('stay');
        expect(stay.label).toBe('Hôtel Le Lac');
    });

    it('labels the V1 flight exactly "Ryanair DUB → NCE · Sat 3 Oct", with no comma', () => {
        expect(outboundFromFlight(v1Flight()).label).toBe('Ryanair DUB → NCE · Sat 3 Oct');
    });

    it('drops the parts it does not have, including a date it cannot read', () => {
        expect(outboundFromFlight(v1Flight({ airline: undefined, departureDate: undefined })).label).toBe('DUB → NCE');
        expect(outboundFromFlight(v1Flight({ airline: undefined, departureDate: 'not a date' })).label).toBe('DUB → NCE');
    });

    it('carries the stale-fare disclaimer as the note, and null when there is none', () => {
        const disclaimer = 'Estimated (Cached): this fare was fetched more than 12 hours ago.';

        expect(outboundFromFlight(v1Flight({ priceLabel: 'Estimated (Cached)', priceDisclaimer: disclaimer })).note).toBe(disclaimer);
        expect(outboundFromFlight(v1Flight()).note).toBeNull();
        expect(outboundFromFlight(v1Flight()).basis).toBe('estimate');
        expect(stayFromNearby(v1Stay()).basis).toBe('estimate');
    });

    it('calls a GBP component with no amount unpriced, not not-converted', () => {
        const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency: 'GBP', unitAmount: null }) }));

        expect(total.lines[1].state).toBe('unpriced');
    });
});
