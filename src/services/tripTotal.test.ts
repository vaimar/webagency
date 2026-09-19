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
import type { TotalLineKind, TotalComponent, TripTotal, TripTotalInput, TripTotalLine } from './tripTotal';
import {
    combineTripTotal,
    flightPickId,
    outboundFromFlight,
    returnFromFlight,
    stayFromNearby,
} from './tripTotal';

/**
 * Kind-based line lookup, so assertions survive the line-order / line-count
 * changes coming with the return-flight slice (docs/specs/return-flight-in-trip-total.md
 * §7.4: outbound-flight, return-flight, stay). Throws with the actual kinds
 * present rather than returning undefined, so a real regression fails loudly
 * instead of as a confusing "Cannot read properties of undefined".
 */
const lineByKind = (total: TripTotal, kind: TotalLineKind): TripTotalLine => {
    const line = total.lines.find((candidate) => candidate.kind === kind);
    if (!line) {
        throw new Error(`no '${kind}' line in [${total.lines.map((candidate) => candidate.kind).join(', ')}]`);
    }
    return line;
};

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

/**
 * T0 prep for the return-flight slice: `returnFlight` isn't a `TripTotalInput`
 * field yet (that lands with FE1, contract §7.1) so it is carried as an inert
 * extra property here rather than threaded into `TripTotalInput` itself.
 * `combineTripTotal` ignores properties it doesn't destructure, so this has
 * zero effect on today's 2-line output — existing vectors keep their current
 * meaning. Once FE1 lands, `returnFlight` becomes a real field and this type
 * collapses back to plain `TripTotalInput`.
 */
type V1InputOverrides = Partial<TripTotalInput> & { returnFlight?: TotalComponent | null };

const v1Input = (overrides: V1InputOverrides = {}): TripTotalInput & { returnFlight: TotalComponent | null } => ({
    outbound: outboundFromFlight(v1Flight()),
    stay: stayFromNearby(v1Stay()),
    nights: 3,
    travellers: 2,
    arrivalAirport: 'NCE',
    hasTariff: true,
    returnFlight: null,
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
        // A return-flight-in-trip-total.md §7.4 line exists even though this
        // vector never sets one (backward-compat contract, criterion 2) —
        // checked by kind via lineByKind, not by position, so a future line
        // reorder or addition (e.g. F3's riding line) does not make this
        // assertion fail for the wrong reason.
        expect(total.lines).toHaveLength(3);
        expect(lineByKind(total, 'outbound-flight').state).toBe('included');
        expect(lineByKind(total, 'return-flight').state).toBe('not-chosen');
        expect(lineByKind(total, 'stay').state).toBe('included');
        expect(total.totalCents).toBe(54965);
        expect(total.allInCents).toBe(59965);
        expect(total.prefix).toBe('≈ ');
        expect(total.allInPrefix).toBe('≈ ');
    });

    describe('C2: a line not chosen', () => {
        it('leaves the flight out of both sums and marks the total a floor', () => {
            const total = combineTripTotal(v1Input({ outbound: null }));

            expect(lineByKind(total, 'outbound-flight')).toMatchObject({ state: 'not-chosen', component: null, amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(44967);
            expect(total.allInCents).toBe(44967);
            expect(total.prefix).toBe('from ');
        });

        it('leaves the stay out of both sums and marks the total a floor', () => {
            const total = combineTripTotal(v1Input({ stay: null }));

            expect(lineByKind(total, 'stay')).toMatchObject({ state: 'not-chosen', component: null, amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });

        it('has no total at all when nothing is chosen', () => {
            const total = combineTripTotal(v1Input({ outbound: null, stay: null }));

            // Per-kind, not positional: the return is also not-chosen here
            // (v1Input's default), same reasoning as C1 above.
            expect(lineByKind(total, 'outbound-flight').state).toBe('not-chosen');
            expect(lineByKind(total, 'return-flight').state).toBe('not-chosen');
            expect(lineByKind(total, 'stay').state).toBe('not-chosen');
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
            expect(lineByKind(total, 'stay')).toMatchObject({ state: 'unpriced', amountCents: null, allInCents: null });
            // Only the flight is in either sum: no nightly amount was substituted.
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });
    });

    describe('C4: currency', () => {
        it.each(['GBP', 'CHF'])('a priced %s stay is not converted and stays out of both sums', (currency) => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency, unitAmount: 150 }) }));

            expect(lineByKind(total, 'stay')).toMatchObject({ state: 'not-converted', amountCents: null, allInCents: null });
            expect(total.totalCents).toBe(9998);
            expect(total.allInCents).toBe(14998);
            expect(total.prefix).toBe('from ');
        });

        it('a GBP flight is excluded from the all-in too, not only the headline', () => {
            const total = combineTripTotal(v1Input({ outbound: outboundFromFlight(v1Flight({ currency: 'GBP' })) }));

            expect(lineByKind(total, 'outbound-flight').state).toBe('not-converted');
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
            expect(lineByKind(total, 'outbound-flight').state).toBe('included');
            expect(lineByKind(total, 'stay').state).toBe('included');
            expect(total.totalCents).toBe(54965);
        });

        it('sums a hand-built component with currency "" as EUR', () => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency: '' }) }));

            expect(lineByKind(total, 'stay').state).toBe('included');
            expect(total.totalCents).toBe(54965);
        });

        it('compares currency case-insensitively', () => {
            const total = combineTripTotal(v1Input({ stay: handBuiltStay({ currency: 'eur' }) }));

            expect(lineByKind(total, 'stay').state).toBe('included');
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

        const flightLine = lineByKind(combineTripTotal(v1Input()), 'outbound-flight');
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
            expect(lineByKind(combineTripTotal(v1Input({ outbound })), 'outbound-flight').allInCents).toBe(7899 * 2);
        });

        it('never uses doorToTripPrice, even when it is present', () => {
            const outbound = outboundFromFlight(v1Flight({
                doorToTripPrice: 999,
                antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, doorToTripPrice: 999, currency: 'EUR' },
            }));

            expect(outbound.allInUnitAmount).toBe(74.99);
            expect(lineByKind(combineTripTotal(v1Input({ outbound })), 'outbound-flight').allInCents).toBe(14998);
        });
    });

    it('C7: with no antiCauchemar the flight all-in is unknown, falls back to the fare, and only the all-in reads "from"', () => {
        const outbound = outboundFromFlight(v1Flight({ antiCauchemar: undefined }));
        expect(outbound.allInUnitAmount).toBeNull();

        const total = combineTripTotal(v1Input({ outbound }));
        const outboundLine = lineByKind(total, 'outbound-flight');
        expect(outboundLine.allInCents).toBe(outboundLine.amountCents);
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
            const outboundLine = lineByKind(total, 'outbound-flight');
            const stayLine = lineByKind(total, 'stay');
            expect(outboundLine.quantity).toBe(travellers);
            expect(stayLine.quantity).toBe(nights);
            expect(outboundLine.amountCents).toBe(4999 * travellers);
            expect(stayLine.amountCents).toBe(14989 * nights);
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
            expect(lineByKind(total, 'outbound-flight')).toMatchObject({ state: 'included', amountCents: 9998 });
        });

        it('treats an unparseable price as no price, so the line is unpriced', () => {
            const outbound = outboundFromFlight(v1Flight({ price: 'call us' }));
            expect(outbound.unitAmount).toBeNull();

            expect(lineByKind(combineTripTotal(v1Input({ outbound })), 'outbound-flight').state).toBe('unpriced');
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

        expect(lineByKind(total, 'stay').state).toBe('unpriced');
    });
});

/**
 * Return flight in trip total — criteria 1–10 of
 * docs/specs/return-flight-in-trip-total.md (rev 3), the pure-function half
 * (T1). Written from the spec's own V1/V2 vectors (§8), not from FE1's
 * implementation — FE1 (tripTotal.ts) is landing concurrently on this branch,
 * so these are expected to be red (missing `returnFromFlight` export, `'Flight
 * home'` still unconditionally excluded, no `headlineLabel`) until it does.
 *
 * V1 return leg: NCE → DUB, Ryanair, 2026-10-06T18:00:00, fare 39.99 EUR,
 * auditedTotalCost 63.99 EUR (spec §8 V1). V2 reuses it with travellers: 1.
 */
const v1ReturnFlight = (overrides: Partial<FlightAvailable> = {}): FlightAvailable => ({
    origin: 'NCE',
    destination: 'DUB',
    airline: 'Ryanair',
    departureDate: '2026-10-06T18:00:00',
    price: 39.99,
    currency: 'EUR',
    antiCauchemar: { ticketPrice: 39.99, auditedTotalCost: 63.99, currency: 'EUR' },
    ...overrides,
});

describe('Return flight in trip total (docs/specs/return-flight-in-trip-total.md)', () => {
    it('RF1 (criterion 1): V1 sums all three lines to 62963/72763 cents, ≈ prefixes, all included, headlineLabel "Flights + stay"', () => {
        const total = combineTripTotal(v1Input({ returnFlight: returnFromFlight(v1ReturnFlight()) }));

        expect(total.lines.map((line) => line.kind)).toEqual(['outbound-flight', 'return-flight', 'stay']);
        expect(total.lines.map((line) => line.state)).toEqual(['included', 'included', 'included']);
        expect(total.totalCents).toBe(62963);
        expect(total.allInCents).toBe(72763);
        expect(total.prefix).toBe('≈ ');
        expect(total.allInPrefix).toBe('≈ ');
        expect(total.headlineLabel).toBe('Flights + stay');
    });

    it('RF2 (criterion 2): backward compatible — returnFlight: null with base-spec V1 inputs keeps 54965/59965 cents, "Flight out + stay", and a not-chosen return at index 1', () => {
        const total = combineTripTotal(v1Input({ returnFlight: null }));

        // This is the one place order is asserted literally, because §7.4's
        // "fixed order: outbound-flight, return-flight, stay" and criterion
        // 2's "not-chosen line at index 1" are themselves the thing under
        // test here — not an incidental structural check.
        expect(total.lines.map((line) => line.kind)).toEqual(['outbound-flight', 'return-flight', 'stay']);
        expect(total.totalCents).toBe(54965);
        expect(total.allInCents).toBe(59965);
        expect(total.headlineLabel).toBe('Flight out + stay');
        expect(lineByKind(total, 'return-flight')).toMatchObject({ state: 'not-chosen', component: null });
        // Outbound and stay themselves are unchanged from the base-spec figures.
        expect(lineByKind(total, 'outbound-flight')).toMatchObject({ amountCents: 9998, allInCents: 14998 });
        expect(lineByKind(total, 'stay')).toMatchObject({ amountCents: 44967 });
        // §7.1: "No figure, PREFIX or state changes for outbound or stay when
        // returnFlight is null." A return that was never offered must not
        // drag the total's prefix down to "from " — only a return that is
        // chosen but not fully priced should do that (see BUG sent to
        // frontend: this currently regresses to 'from ' because the prefix
        // formula counts all 3 line slots instead of only the chosen ones).
        expect(total.prefix).toBe('≈ ');
        expect(total.allInPrefix).toBe('≈ ');
    });

    it('RF3 (criterion 3): V2 — return only, no outbound — is a floor: "from ", "Flight home + stay", 48966/51366 cents', () => {
        const total = combineTripTotal(v1Input({
            outbound: null,
            returnFlight: returnFromFlight(v1ReturnFlight()),
            travellers: 1,
            nights: 3,
        }));

        expect(total.prefix).toBe('from ');
        expect(total.headlineLabel).toBe('Flight home + stay');
        expect(total.totalCents).toBe(48966);
        expect(total.allInCents).toBe(51366);
    });

    describe('RF4 (criterion 4): headlineLabel — all eight rows of §7.3', () => {
        const outbound = () => outboundFromFlight(v1Flight());
        const back = () => returnFromFlight(v1ReturnFlight());
        const aStay = () => stayFromNearby(v1Stay());

        it.each([
            ['yes', 'yes', 'yes', 'Flights + stay'],
            ['yes', 'yes', 'no', 'Flights'],
            ['yes', 'no', 'yes', 'Flight out + stay'],
            ['yes', 'no', 'no', 'Flight out'],
            ['no', 'yes', 'yes', 'Flight home + stay'],
            ['no', 'yes', 'no', 'Flight home'],
            ['no', 'no', 'yes', 'Stay'],
            ['no', 'no', 'no', ''],
        ] as const)('outbound=%s return=%s stay=%s → %s', (hasOutbound, hasReturn, hasStay, expected) => {
            const total = combineTripTotal(v1Input({
                outbound: hasOutbound === 'yes' ? outbound() : null,
                returnFlight: hasReturn === 'yes' ? back() : null,
                stay: hasStay === 'yes' ? aStay() : null,
            }));

            expect(total.headlineLabel).toBe(expected);
        });
    });

    it('RF5 (criterion 5): returnFromFlight sets kind "return-flight" and otherwise agrees with outboundFromFlight on the same input', () => {
        // Same shape flight, swapped only in kind (adapters compute identically per §7.2).
        const sharedFlight: FlightAvailable = {
            origin: 'DUB',
            destination: 'NCE',
            airline: 'Ryanair',
            departureDate: '2026-10-03T07:00:00',
            price: 49.99,
            currency: 'EUR',
            antiCauchemar: { ticketPrice: 49.99, auditedTotalCost: 74.99, currency: 'EUR' },
        };

        const out = outboundFromFlight(sharedFlight);
        const back = returnFromFlight(sharedFlight);

        expect(back.kind).toBe('return-flight');
        expect(out.kind).toBe('outbound-flight');
        expect(back.id).toBe(out.id);
        expect(back.label).toBe(out.label);
        expect(back.unitAmount).toBe(out.unitAmount);
        expect(back.currency).toBe(out.currency);
        expect(back.basis).toBe(out.basis);
        expect(back.allInUnitAmount).toBe(out.allInUnitAmount);
        expect(back.manualCheck).toBe(out.manualCheck);
        expect(back.note).toBe(out.note);
    });

    it('§7.1/7.2 (supporting RF5): both adapters thread the raw departureDate onto TotalComponent; stayFromNearby sets it null', () => {
        const outbound = outboundFromFlight(v1Flight());
        const back = returnFromFlight(v1ReturnFlight());
        const stay = stayFromNearby(v1Stay());

        expect(outbound.departureDate).toBe('2026-10-03T07:00:00');
        expect(back.departureDate).toBe('2026-10-06T18:00:00');
        expect(stay.departureDate).toBeNull();

        // Missing departureDate on the source flight maps to null, not undefined,
        // so a strict-equality date-coherence check (T2, criterion 44) is safe.
        expect(returnFromFlight(v1ReturnFlight({ departureDate: undefined })).departureDate).toBeNull();
    });

    it('Late-landing return (§7.12.1, coordinator check): top-level manualCheckRequired is false, but priceBreakdown.lateArrivalMarkup is MANUAL_CHECK_REQUIRED — returnFromFlight must still flag manualCheck true via the disjunction, and the total must still read "from "', () => {
        // This is the exact shape BE1 promises for a late return (§7.12.1 / §7.13):
        // the top-level boolean stays false on purpose, so RyanairService's sort
        // is not disturbed — the caveat rides on the CostLine status instead.
        // A test that asserts the top-level boolean is true would re-encode the
        // very ranking bug the user decided against (rev 2 → rev 3, backend
        // blocker 1). This test must read `manualCheck` off the component
        // (which already ORs both channels via getAntiCauchemarPricingSummary,
        // unchanged per §7.13), never off a raw top-level flag directly.
        const lateReturn = v1ReturnFlight({
            antiCauchemar: {
                ticketPrice: 39.99,
                auditedTotalCost: 63.99,
                currency: 'EUR',
                manualCheckRequired: false,
                priceBreakdown: {
                    lateArrivalMarkup: { amount: null, currency: 'EUR', status: 'MANUAL_CHECK_REQUIRED' },
                },
            },
        });

        const back = returnFromFlight(lateReturn);
        expect(back.manualCheck).toBe(true);

        const total = combineTripTotal(v1Input({ returnFlight: back }));
        expect(total.allInPrefix).toBe('from ');
        // The sum itself is unaffected — auditedTotalCost already excludes the
        // markup per §7.12; only the badge/prefix react.
        expect(lineByKind(total, 'return-flight').allInCents).toBe(6399 * 2);
    });

    it('RF6 (criterion 6): return quantity is travellers, stay quantity is nights; V1 return line is 7998/12798 cents', () => {
        const total = combineTripTotal(v1Input({ returnFlight: returnFromFlight(v1ReturnFlight()) }));
        const returnLine = lineByKind(total, 'return-flight');
        const stayLine = lineByKind(total, 'stay');

        expect(returnLine.quantity).toBe(2); // travellers
        expect(stayLine.quantity).toBe(3); // nights
        expect(returnLine.amountCents).toBe(7998);
        expect(returnLine.allInCents).toBe(12798);
    });

    describe('RF7 (criterion 7): excluded list "Flight home"', () => {
        it('is present when returnFlight is null', () => {
            expect(combineTripTotal(v1Input({ returnFlight: null })).excluded).toEqual([
                'Flight home',
                'Getting from NCE to the spot',
                'Riding (see the tariff above)',
                'Food and gear hire',
            ]);
        });

        it.each([
            ['included', () => returnFromFlight(v1ReturnFlight())],
            ['unpriced', () => returnFromFlight(v1ReturnFlight({ price: 'call us', antiCauchemar: undefined }))],
            ['not-converted', () => returnFromFlight(v1ReturnFlight({ currency: 'GBP' }))],
        ] as const)('is omitted when a return is chosen in state %s, other three items unchanged', (_state, buildReturn) => {
            const total = combineTripTotal(v1Input({ returnFlight: buildReturn() }));

            expect(total.excluded).toEqual([
                'Getting from NCE to the spot',
                'Riding (see the tariff above)',
                'Food and gear hire',
            ]);
        });
    });

    describe('RF8 (criterion 8): return line state rules match the outbound', () => {
        it('a GBP return with a positive amount is not-converted and sets prefix "from "', () => {
            const total = combineTripTotal(v1Input({ returnFlight: returnFromFlight(v1ReturnFlight({ currency: 'GBP' })) }));

            expect(lineByKind(total, 'return-flight').state).toBe('not-converted');
            expect(total.prefix).toBe('from ');
        });

        it('a null allInUnitAmount makes the return\'s allInCents fall back to its amountCents', () => {
            const back = returnFromFlight(v1ReturnFlight({ antiCauchemar: undefined }));
            expect(back.allInUnitAmount).toBeNull();

            const total = combineTripTotal(v1Input({ returnFlight: back }));
            const returnLine = lineByKind(total, 'return-flight');
            expect(returnLine.allInCents).toBe(returnLine.amountCents);
        });
    });

    describe('RF9 (criterion 9): allInPrefix reacts to either flight line independently', () => {
        it('is "from " when the return\'s allInUnitAmount is null even though the outbound\'s is known and the stay is included', () => {
            const back = returnFromFlight(v1ReturnFlight({ antiCauchemar: undefined }));
            const total = combineTripTotal(v1Input({ returnFlight: back }));

            expect(total.allInPrefix).toBe('from ');
            expect(total.prefix).toBe('≈ ');
        });

        it('is "from " when the outbound\'s allInUnitAmount is null even though the return\'s is known and the stay is included', () => {
            const outbound = outboundFromFlight(v1Flight({ antiCauchemar: undefined }));
            const total = combineTripTotal(v1Input({ outbound, returnFlight: returnFromFlight(v1ReturnFlight()) }));

            expect(total.allInPrefix).toBe('from ');
            expect(total.prefix).toBe('≈ ');
        });
    });

    it('RF10 (criterion 10): integer cents across 3 lines — 10.40 × 1 + 10.40 × 1 + 10.40 × 1 = 3120 cents', () => {
        const total = combineTripTotal(v1Input({
            outbound: outboundFromFlight(v1Flight({ price: 10.4, antiCauchemar: undefined })),
            returnFlight: returnFromFlight(v1ReturnFlight({ price: 10.4, antiCauchemar: undefined })),
            stay: stayFromNearby(v1Stay({ pricePerNight: 10.4 })),
            travellers: 1,
            nights: 1,
        }));

        expect(total.totalCents).toBe(3120);
    });
});
