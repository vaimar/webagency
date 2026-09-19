/**
 * TripTotalCard — criteria 14–23 of docs/specs/combined-trip-total.md (rev 4.1).
 *
 * The card is presentational, so every fixture is a hand-built TripTotal rather
 * than the output of combineTripTotal: a bug in the arithmetic must not be able
 * to hide a bug in what the card shows, or the other way round.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LineState, TotalComponent, TotalLineKind, TripTotal, TripTotalLine } from '../services/tripTotal';
import TripTotalCard from './TripTotalCard';

const EXCLUDED = [
    'Flight home',
    'Getting from NCE to the spot',
    'Riding (see the tariff above)',
    'Food and gear hire',
];

const flight = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
    id: 'DUB|NCE|2026-10-03T07:00:00|Ryanair',
    kind: 'outbound-flight',
    label: 'Ryanair DUB → NCE · Sat 3 Oct',
    unitAmount: 49.99,
    currency: 'EUR',
    basis: 'estimate',
    allInUnitAmount: 74.99,
    manualCheck: false,
    note: null,
    ...overrides,
});

const stay = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
    id: 'g1-d2',
    kind: 'stay',
    label: 'Hôtel Le Lac',
    unitAmount: 149.89,
    currency: 'EUR',
    basis: 'estimate',
    note: null,
    ...overrides,
});

const included = (component: TotalComponent, quantity: number, amountCents: number, allInCents = amountCents): TripTotalLine => ({
    kind: component.kind, state: 'included', component, quantity, amountCents, allInCents,
});

const notSummed = (component: TotalComponent, state: LineState, quantity: number): TripTotalLine => ({
    kind: component.kind, state, component, quantity, amountCents: null, allInCents: null,
});

const notChosen = (kind: TotalLineKind, quantity: number): TripTotalLine => ({
    kind, state: 'not-chosen', component: null, quantity, amountCents: null, allInCents: null,
});

/**
 * Kind-based line lookup, so fixtures built off V1 survive the line-order /
 * line-count changes coming with the return-flight slice (docs/specs/
 * return-flight-in-trip-total.md §7.4: outbound-flight, return-flight, stay).
 * Throws with the actual kinds present rather than returning undefined.
 */
const lineByKind = (total: TripTotal, kind: TotalLineKind): TripTotalLine => {
    const line = total.lines.find((candidate) => candidate.kind === kind);
    if (!line) {
        throw new Error(`no '${kind}' line in [${total.lines.map((candidate) => candidate.kind).join(', ')}]`);
    }
    return line;
};

/**
 * V1: €49.99 × 2 (all-in €74.99 × 2) + €149.89 × 3. No return chosen — every
 * fixture below carries a not-chosen return-flight line (return-flight-in-
 * trip-total.md §7.4's fixed 3-line order) purely for shape; these criteria
 * (14–23) predate that slice and are unaffected by it, so headlineLabel stays
 * the pre-existing "Flight out + stay" text (§7.3 table, row 3).
 */
const V1: TripTotal = {
    currency: 'EUR',
    lines: [included(flight(), 2, 9998, 14998), notChosen('return-flight', 2), included(stay(), 3, 44967)],
    totalCents: 54965,
    allInCents: 59965,
    prefix: '≈ ',
    allInPrefix: '≈ ',
    headlineLabel: 'Flight out + stay',
    excluded: EXCLUDED,
    nights: 3,
    travellers: 2,
};

/** V2: €10.40 × 1 + €10.40 × 1. */
const V2: TripTotal = {
    ...V1,
    lines: [
        included(flight({ unitAmount: 10.4, allInUnitAmount: 10.4 }), 1, 1040),
        notChosen('return-flight', 1),
        included(stay({ unitAmount: 10.4 }), 1, 1040),
    ],
    totalCents: 2080,
    allInCents: 2080,
    nights: 1,
    travellers: 1,
};

const EMPTY: TripTotal = {
    ...V1,
    lines: [notChosen('outbound-flight', 1), notChosen('return-flight', 1), notChosen('stay', 2)],
    totalCents: null,
    allInCents: null,
    prefix: 'from ',
    allInPrefix: 'from ',
    headlineLabel: '',
    nights: 2,
    travellers: 1,
};

/** V1 at the lower bounds: one traveller, one night. */
const ONE_AND_ONE: TripTotal = {
    ...V1,
    lines: [included(flight(), 1, 4999, 7499), notChosen('return-flight', 1), included(stay(), 1, 14989)],
    totalCents: 19988,
    allInCents: 22488,
    nights: 1,
    travellers: 1,
};

/** V1 at the upper bounds: nine travellers, fourteen nights. */
const AT_MAX: TripTotal = {
    ...V1,
    lines: [included(flight(), 9, 44991, 67491), notChosen('return-flight', 9), included(stay(), 14, 209846)],
    totalCents: 254837,
    allInCents: 277337,
    nights: 14,
    travellers: 9,
};

const renderCard = (total: TripTotal) => {
    const handlers = {
        onNightsChange: vi.fn(),
        onTravellersChange: vi.fn(),
        onRemove: vi.fn(),
    };
    render(<TripTotalCard total={total} {...handlers} />);
    return { card: screen.getByRole('region', { name: 'Rough trip cost' }), ...handlers };
};

/** The row element holding a figure label and its figure (spec 7.9). */
const rowOf = (label: string): HTMLElement => screen.getByText(label).parentElement as HTMLElement;

/** Plain line amounts such as "€99.98": no ≈ / from prefix, so never the headline or all-in figure. */
const lineAmounts = (card: HTMLElement): string[] => (
    within(card).queryAllByText(/^€[\d,]+\.\d{2}$/).map((element) => element.textContent ?? '')
);

const toCents = (text: string): number => Math.round(Number(text.replace(/[^\d.]/g, '')) * 100);

describe('TripTotalCard', () => {
    it('C14: with no picks, shows only the heading and the empty-state text', () => {
        const { card } = renderCard(EMPTY);

        expect(within(card).getByText('Pick a flight and a place to stay to see a rough trip cost.')).toBeInTheDocument();
        expect(card).not.toHaveTextContent('€');
        expect(within(card).queryByText('Not chosen yet')).not.toBeInTheDocument();
        expect(within(card).queryByText('Not in this total')).not.toBeInTheDocument();
        expect(within(card).queryAllByRole('listitem')).toHaveLength(0);
        expect(within(card).queryAllByRole('group')).toHaveLength(0);
        expect(within(card).queryAllByRole('button')).toHaveLength(0);
    });

    // ── Return flight in trip total — criteria 11–20, 43–44, 50 of ──────────
    // docs/specs/return-flight-in-trip-total.md (rev 3), the card half (T2).
    // Written from the spec's own contract (§7.3–7.8, §7.14), not from FE2's
    // implementation, which is landing concurrently on this branch — these
    // are expected to be red (no 'return-flight' KIND_HEADING/REMOVE_LABEL/
    // UNPRICED_NOTE, no headlineLabel read, no data-testid, no date-coherence
    // note) until FE1/FE2 land. Per the standing rule, line/row lookups go
    // through data-testid ("trip-total-line-{kind}", spec criterion 50)
    // rather than role or text queries.

    describe('RF11–RF20, RF43–RF44, RF50 (return flight in trip total)', () => {
        const rfFlight = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
            id: 'DUB|NCE|2026-10-03T07:00:00|Ryanair',
            kind: 'outbound-flight',
            label: 'Ryanair DUB → NCE · Sat 3 Oct',
            unitAmount: 49.99,
            currency: 'EUR',
            basis: 'estimate',
            allInUnitAmount: 74.99,
            manualCheck: false,
            note: null,
            departureDate: '2026-10-03T07:00:00',
            ...overrides,
        });

        const rfReturn = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
            id: 'NCE|DUB|2026-10-06T18:00:00|Ryanair',
            kind: 'return-flight',
            label: 'Ryanair NCE → DUB · Tue 6 Oct',
            unitAmount: 39.99,
            currency: 'EUR',
            basis: 'estimate',
            allInUnitAmount: 63.99,
            manualCheck: false,
            note: null,
            departureDate: '2026-10-06T18:00:00',
            ...overrides,
        });

        const rfStay = (overrides: Partial<TotalComponent> = {}): TotalComponent => ({
            id: 'g1-d2',
            kind: 'stay',
            label: 'Hôtel Le Lac',
            unitAmount: 149.89,
            currency: 'EUR',
            basis: 'estimate',
            note: null,
            departureDate: null,
            ...overrides,
        });

        const EXCLUDED_NO_RETURN = [
            'Flight home',
            'Getting from NCE to the spot',
            'Riding (see the tariff above)',
            'Food and gear hire',
        ];
        const EXCLUDED_WITH_RETURN = [
            'Getting from NCE to the spot',
            'Riding (see the tariff above)',
            'Food and gear hire',
        ];

        /** V1: outbound 49.99×2 (9998/14998), return 39.99×2 (7998/12798), stay 149.89×3 (44967). */
        const V1_RF: TripTotal & { headlineLabel: string } = {
            currency: 'EUR',
            lines: [
                included(rfFlight(), 2, 9998, 14998),
                included(rfReturn(), 2, 7998, 12798),
                included(rfStay(), 3, 44967),
            ],
            totalCents: 62963,
            allInCents: 72763,
            prefix: '≈ ',
            allInPrefix: '≈ ',
            headlineLabel: 'Flights + stay',
            excluded: EXCLUDED_WITH_RETURN,
            nights: 3,
            travellers: 2,
        } as TripTotal & { headlineLabel: string };

        /** Only outbound and stay chosen — headlineLabel stays "Flight out + stay" (shipped behaviour). */
        const OUTBOUND_AND_STAY_ONLY: TripTotal & { headlineLabel: string } = {
            ...V1_RF,
            lines: [
                included(rfFlight(), 2, 9998, 14998),
                notChosen('return-flight', 2),
                included(rfStay(), 3, 44967),
            ],
            totalCents: 54965,
            allInCents: 59965,
            headlineLabel: 'Flight out + stay',
            excluded: EXCLUDED_NO_RETURN,
        };

        const testIdOf = (kind: string) => `trip-total-line-${kind}`;

        it('RF50 (criterion 50): the three card lines expose data-testid="trip-total-line-{kind}"', () => {
            renderCard(V1_RF);

            expect(screen.getByTestId('trip-total-line-outbound-flight')).toBeInTheDocument();
            expect(screen.getByTestId('trip-total-line-return-flight')).toBeInTheDocument();
            expect(screen.getByTestId('trip-total-line-stay')).toBeInTheDocument();
        });

        it('RF11 (criterion 11): V1 headline row reads "Flights + stay" / "≈ €629.63"; all-in row reads "With bags and airport extras" / "≈ €727.63"', () => {
            const { card } = renderCard(V1_RF);

            const headline = rowOf('Flights + stay');
            expect(headline).toHaveTextContent('Flights + stay');
            expect(headline).toHaveTextContent('≈ €629.63');

            const allIn = rowOf('With bags and airport extras');
            expect(within(card).getByText('With bags and airport extras')).toBeInTheDocument();
            expect(allIn).toHaveTextContent('≈ €727.63');
        });

        it('RF12 (criterion 12): three lines render in order — Flight out €99.98, Flight home €79.98, Stay €449.67', () => {
            renderCard(V1_RF);

            const outboundLine = screen.getByTestId(testIdOf('outbound-flight'));
            const returnLine = screen.getByTestId(testIdOf('return-flight'));
            const stayLine = screen.getByTestId(testIdOf('stay'));

            expect(within(outboundLine).getByText('Flight out')).toBeInTheDocument();
            expect(outboundLine).toHaveTextContent('€99.98');
            expect(within(returnLine).getByText('Flight home')).toBeInTheDocument();
            expect(returnLine).toHaveTextContent('€79.98');
            expect(within(stayLine).getByText('Stay')).toBeInTheDocument();
            expect(stayLine).toHaveTextContent('€449.67');

            // Order: outbound, return, stay (spec §7.4).
            const order = outboundLine.compareDocumentPosition(returnLine);
            expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            const order2 = returnLine.compareDocumentPosition(stayLine);
            expect(order2 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

        it('RF13 (criterion 13): return quantity text is "× 2 travellers" for V1', () => {
            renderCard(V1_RF);
            expect(screen.getByTestId(testIdOf('return-flight'))).toHaveTextContent('× 2 travellers');
        });

        it('RF13 (criterion 13): return quantity text is "× 1 traveller" for one', () => {
            renderCard({
                ...V1_RF,
                lines: [included(rfFlight(), 1, 4999, 7499), included(rfReturn(), 1, 3999, 6399), included(rfStay(), 3, 44967)],
                travellers: 1,
            });
            expect(screen.getByTestId(testIdOf('return-flight'))).toHaveTextContent('× 1 traveller');
        });

        it('RF14 (criterion 14): headline label reads "Flights + stay" with both flights chosen', () => {
            const { card } = renderCard(V1_RF);
            expect(within(card).getByText('Flights + stay')).toBeInTheDocument();
        });

        it('RF14 (criterion 14): headline label reads "Flight out + stay" with only outbound and stay chosen', () => {
            const { card } = renderCard(OUTBOUND_AND_STAY_ONLY);
            expect(within(card).getByText('Flight out + stay')).toBeInTheDocument();
        });

        it('RF15 (criterion 15): "Not in this total" omits "Flight home" when a return is chosen; other items stay in §7.5 order', () => {
            const { card } = renderCard(V1_RF);

            const heading = within(card).getByText('Not in this total');
            const list = heading.nextElementSibling as HTMLElement;
            expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(EXCLUDED_WITH_RETURN);
            expect(within(list).queryByText('Flight home')).not.toBeInTheDocument();
        });

        it('RF16 (criterion 16): "Not in this total" lists "Flight home" first when no return is chosen', () => {
            const { card } = renderCard(OUTBOUND_AND_STAY_ONLY);

            const heading = within(card).getByText('Not in this total');
            const list = heading.nextElementSibling as HTMLElement;
            const items = within(list).getAllByRole('listitem').map((item) => item.textContent);
            expect(items[0]).toBe('Flight home');
            expect(items).toEqual(EXCLUDED_NO_RETURN);
        });

        describe('RF17 (criterion 17): the return line\'s remove control and not-chosen state', () => {
            it('a chosen return has "Remove return flight from trip cost" calling onRemove(\'return-flight\')', async () => {
                const user = userEvent.setup();
                const { onRemove } = renderCard(V1_RF);

                const returnLine = screen.getByTestId(testIdOf('return-flight'));
                await user.click(within(returnLine).getByRole('button', { name: 'Remove return flight from trip cost' }));
                expect(onRemove).toHaveBeenLastCalledWith('return-flight');
            });

            it('a not-chosen return shows the "Flight home" heading, "Not chosen yet", and no remove button', () => {
                renderCard(OUTBOUND_AND_STAY_ONLY);

                const returnLine = screen.getByTestId(testIdOf('return-flight'));
                expect(within(returnLine).getByText('Flight home')).toBeInTheDocument();
                expect(within(returnLine).getByText('Not chosen yet')).toBeInTheDocument();
                expect(within(returnLine).queryByRole('button')).not.toBeInTheDocument();
            });
        });

        it('RF18 (criterion 18): "Bags and airport extras not known for this flight." renders when the return\'s extras are unknown and the outbound\'s are known', () => {
            const { card } = renderCard({
                ...V1_RF,
                lines: [
                    included(rfFlight(), 2, 9998, 14998),
                    included(rfReturn({ allInUnitAmount: null }), 2, 7998, 7998),
                    included(rfStay(), 3, 44967),
                ],
                allInCents: 9998 + 44967 + 7998,
                allInPrefix: 'from ',
            });

            expect(within(card).getByText('Bags and airport extras not known for this flight.')).toBeInTheDocument();
        });

        it('RF19 (criterion 19): an unpriced return shows "No usable fare. Check the fare before booking." and no amount', () => {
            renderCard({
                ...V1_RF,
                lines: [
                    included(rfFlight(), 2, 9998, 14998),
                    notSummed(rfReturn({ unitAmount: null, basis: 'manual-check' }), 'unpriced', 2),
                    included(rfStay(), 3, 44967),
                ],
                totalCents: 9998 + 44967,
                allInCents: 14998 + 44967,
                prefix: 'from ',
                allInPrefix: 'from ',
            });

            const returnLine = screen.getByTestId(testIdOf('return-flight'));
            expect(within(returnLine).getByText('No usable fare. Check the fare before booking.')).toBeInTheDocument();
            expect(returnLine).not.toHaveTextContent('€79.98');
        });

        it('RF20 (criterion 20): a not-converted return at unit 150 GBP with 2 travellers shows "£150.00 · In GBP, not converted, not in this total" — the unit, not 300', () => {
            renderCard({
                ...V1_RF,
                lines: [
                    included(rfFlight(), 2, 9998, 14998),
                    notSummed(rfReturn({ currency: 'GBP', unitAmount: 150, allInUnitAmount: null }), 'not-converted', 2),
                    included(rfStay(), 3, 44967),
                ],
                totalCents: 9998 + 44967,
                allInCents: 14998 + 44967,
                prefix: 'from ',
                allInPrefix: 'from ',
            });

            const returnLine = screen.getByTestId(testIdOf('return-flight'));
            expect(returnLine).toHaveTextContent('£150.00 · In GBP, not converted, not in this total');
            expect(returnLine).not.toHaveTextContent('£300.00');
        });

        it('Late-landing return (coordinator check, §7.12.1): badge and "from " prefix come from component.manualCheck, never from a raw top-level boolean — the card layer only ever sees the already-disjuncted flag', () => {
            const { card } = renderCard({
                ...V1_RF,
                lines: [
                    included(rfFlight(), 2, 9998, 14998),
                    included(rfReturn({ manualCheck: true }), 2, 7998, 12798),
                    included(rfStay(), 3, 44967),
                ],
                allInPrefix: 'from ',
            });

            const returnLine = screen.getByTestId(testIdOf('return-flight'));
            expect(within(returnLine).getByText('Manual check')).toBeInTheDocument();
            expect(within(card).getByText('Flights + stay')).toBeInTheDocument();
            expect(rowOf('With bags and airport extras')).toHaveTextContent('from €727.63');
        });

        describe('RF43–RF44 (criteria 43–44): date coherence (§7.14)', () => {
            const withDates = (outboundDate: string | null, returnDate: string | null) => ({
                ...V1_RF,
                lines: [
                    included(rfFlight({ departureDate: outboundDate }), 2, 9998, 14998),
                    included(rfReturn({ departureDate: returnDate }), 2, 7998, 12798),
                    included(rfStay(), 3, 44967),
                ],
            });

            const COHERENCE_NOTE = "These two fares aren't a round trip — the flight home leaves before the flight out. Check dates before booking.";

            it('RF43: shows the note when the return departs on or before the outbound, and the figures still render', () => {
                const { card } = renderCard(withDates('2026-10-06T07:00:00', '2026-10-06T07:00:00'));
                expect(within(card).getByText(COHERENCE_NOTE)).toBeInTheDocument();
                expect(within(card).getByText('Flights + stay')).toBeInTheDocument();
                expect(rowOf('Flights + stay')).toHaveTextContent('€629.63');
            });

            it('RF43b: shows the note when the return departs strictly before the outbound', () => {
                const { card } = renderCard(withDates('2026-10-06T07:00:00', '2026-10-03T07:00:00'));
                expect(within(card).getByText(COHERENCE_NOTE)).toBeInTheDocument();
            });

            it('RF44: V1 dates (return after outbound) show no note', () => {
                const { card } = renderCard(V1_RF);
                expect(within(card).queryByText(COHERENCE_NOTE)).not.toBeInTheDocument();
            });

            it('RF44b: no note when either flight is not chosen', () => {
                const { card } = renderCard(OUTBOUND_AND_STAY_ONLY);
                expect(within(card).queryByText(COHERENCE_NOTE)).not.toBeInTheDocument();
            });

            it('RF44c: no note when the outbound departureDate is missing', () => {
                const { card } = renderCard(withDates(null, '2026-10-06T18:00:00'));
                expect(within(card).queryByText(COHERENCE_NOTE)).not.toBeInTheDocument();
            });

            it('RF44c: no note when the return departureDate is unparseable', () => {
                const { card } = renderCard(withDates('2026-10-03T07:00:00', 'not a date'));
                expect(within(card).queryByText(COHERENCE_NOTE)).not.toBeInTheDocument();
            });

            it('RF44d (the New Year pin): outbound 2026-12-28 → return 2027-01-04 shows NO note — a formatted-label compare would get this wrong because flightLabel drops the year', () => {
                const { card } = renderCard(withDates('2026-12-28T07:00:00', '2027-01-04T18:00:00'));
                expect(within(card).queryByText(COHERENCE_NOTE)).not.toBeInTheDocument();
            });
        });
    });

    it('C15: shows the V1 headline, all-in and line figures, and the excluded list in the open', () => {
        const { card } = renderCard(V1);

        const headline = rowOf('Flight out + stay');
        expect(headline).toHaveTextContent('Flight out + stay');
        expect(headline).toHaveTextContent('≈ €549.65');

        const allIn = rowOf('With bags and airport extras');
        expect(allIn).toHaveTextContent('With bags and airport extras');
        expect(allIn).toHaveTextContent('≈ €599.65');

        expect(within(card).getByText('€99.98')).toBeInTheDocument();
        expect(within(card).getByText('€449.67')).toBeInTheDocument();

        // 'Flight home' now also appears as the not-chosen return line's own
        // heading (KIND_HEADING['return-flight']), so the excluded list has
        // to be located via its heading's sibling, not by the text inside it.
        const heading = within(card).getByText('Not in this total');
        const list = heading.nextElementSibling as HTMLElement;
        expect(list).not.toBeNull();
        expect(list.tagName).toBe('UL');
        expect(heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(EXCLUDED);
        expect(card.querySelector('details')).toBeNull();
    });

    describe('C16: amounts to the cent, and the lines add up to the headline', () => {
        it('V2 reads €10.40 + €10.40 = ≈ €20.80', () => {
            const { card } = renderCard(V2);

            expect(lineAmounts(card)).toEqual(['€10.40', '€10.40']);
            expect(rowOf('Flight out + stay')).toHaveTextContent('≈ €20.80');
        });

        it.each([
            ['V1', V1],
            ['V2', V2],
        ])('%s: the displayed line amounts, back in cents, sum exactly to the displayed headline', (_name, total) => {
            const { card } = renderCard(total);

            const headlineText = rowOf('Flight out + stay').textContent ?? '';
            const headline = headlineText.match(/€[\d,]+\.\d{2}/)?.[0] ?? '';
            const lines = lineAmounts(card);

            expect(lines).toHaveLength(2);
            expect(lines.reduce((sum, amount) => sum + toCents(amount), 0)).toBe(toCents(headline));
        });
    });

    describe('C17: quantities and stay notes', () => {
        it('uses plurals for V1', () => {
            renderCard(V1);

            expect(screen.getByText('× 2 travellers')).toBeInTheDocument();
            expect(screen.getByText('× 3 nights, 1 room')).toBeInTheDocument();
        });

        it('uses the singular for one traveller and one night', () => {
            renderCard(ONE_AND_ONE);

            expect(screen.getByText('× 1 traveller')).toBeInTheDocument();
            expect(screen.getByText('× 1 night, 1 room')).toBeInTheDocument();
        });

        it.each([
            ['priced', V1],
            ['unpriced', {
                ...V1,
                lines: [lineByKind(V1, 'outbound-flight'), notSummed(stay({ unitAmount: null, basis: 'manual-check' }), 'unpriced', 3)],
                totalCents: 9998,
                allInCents: 14998,
                prefix: 'from ',
                allInPrefix: 'from ',
            } as TripTotal],
        ])('shows the group-size and dates notes on a %s stay', (_name, total) => {
            renderCard(total);

            expect(screen.getByText('Price may vary for group size: the rate is for one room, not per person.')).toBeInTheDocument();
            expect(screen.getByText('Sample rate for one night about six weeks out, not your dates.')).toBeInTheDocument();
        });
    });

    describe('C18: line states', () => {
        it('shows an unpriced stay with the check-the-rate text and no amount', () => {
            const { card } = renderCard({
                ...V1,
                lines: [lineByKind(V1, 'outbound-flight'), notSummed(stay({ unitAmount: null, basis: 'manual-check' }), 'unpriced', 3)],
                totalCents: 9998,
                allInCents: 14998,
                prefix: 'from ',
                allInPrefix: 'from ',
            });

            expect(within(card).getByText('No live rate. Check the rate before booking.')).toBeInTheDocument();
            // Only the flight line carries a plain amount.
            expect(lineAmounts(card)).toEqual(['€99.98']);
        });

        it('shows a GBP stay at its unit amount in pounds, marked as not in the total', () => {
            const { card } = renderCard({
                ...V1,
                lines: [lineByKind(V1, 'outbound-flight'), notSummed(stay({ currency: 'GBP', unitAmount: 150 }), 'not-converted', 3)],
                totalCents: 9998,
                allInCents: 14998,
                prefix: 'from ',
                allInPrefix: 'from ',
            });

            expect(card).toHaveTextContent('£150.00 · In GBP, not converted, not in this total');
            expect(card).not.toHaveTextContent('£450.00');
        });

        it('badges a flight the backend could not validate', () => {
            renderCard({
                ...V1,
                lines: [included(flight({ manualCheck: true }), 2, 9998, 14998), lineByKind(V1, 'stay')],
                allInPrefix: 'from ',
            });

            expect(screen.getByText('Manual check')).toBeInTheDocument();
        });

        it('shows no badge on a V1 flight', () => {
            renderCard(V1);

            expect(screen.queryByText('Manual check')).not.toBeInTheDocument();
        });
    });

    it('C19: with picks but nothing priced, says so and shows no figure, while lines, steppers and exclusions stay', () => {
        const { card } = renderCard({
            ...V1,
            lines: [notChosen('outbound-flight', 1), notSummed(stay({ unitAmount: null, basis: 'manual-check' }), 'unpriced', 2)],
            totalCents: null,
            allInCents: null,
            prefix: 'from ',
            allInPrefix: 'from ',
            nights: 2,
            travellers: 1,
        });

        expect(within(card).getByText('Nothing picked has a price yet.')).toBeInTheDocument();
        expect(card).not.toHaveTextContent('€');
        expect(card).not.toHaveTextContent('≈');
        expect(within(card).queryByText('Flight out + stay')).not.toBeInTheDocument();
        expect(within(card).getByText('No live rate. Check the rate before booking.')).toBeInTheDocument();
        expect(within(card).getByRole('group', { name: 'Nights' })).toBeInTheDocument();
        expect(within(card).getByRole('group', { name: 'Travellers' })).toBeInTheDocument();
        expect(within(card).getByText('Not in this total')).toBeInTheDocument();
        expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual(expect.arrayContaining(EXCLUDED));
    });

    describe('C20: the stale-fare note', () => {
        it('shows the priceDisclaimer under the flight line', () => {
            const note = 'Estimated (Cached): this fare was fetched more than 12 hours ago.';
            renderCard({ ...V1, lines: [included(flight({ note }), 2, 9998, 14998), lineByKind(V1, 'stay')] });

            expect(screen.getByText(note)).toBeInTheDocument();
        });

        it('shows no note on a V1 flight', () => {
            renderCard(V1);

            expect(screen.queryByText(/Estimated \(Cached\)/)).not.toBeInTheDocument();
        });
    });

    it('C21: says when the flight all-in is unknown, and the all-in figure starts with "from"', () => {
        renderCard({
            ...V1,
            lines: [included(flight({ allInUnitAmount: null }), 2, 9998, 9998), lineByKind(V1, 'stay')],
            allInCents: 54965,
            allInPrefix: 'from ',
        });

        expect(screen.getByText('Bags and airport extras not known for this flight.')).toBeInTheDocument();
        expect(rowOf('With bags and airport extras')).toHaveTextContent('from €549.65');
    });

    describe('C22: steppers', () => {
        it('groups each stepper with its two buttons and a status holding the value', () => {
            renderCard(V1);

            const nights = screen.getByRole('group', { name: 'Nights' });
            expect(within(nights).getByRole('button', { name: 'One fewer night' })).toBeInTheDocument();
            expect(within(nights).getByRole('button', { name: 'One more night' })).toBeInTheDocument();
            expect(within(nights).getByRole('status')).toHaveTextContent(/^3$/);

            const travellers = screen.getByRole('group', { name: 'Travellers' });
            expect(within(travellers).getByRole('button', { name: 'One fewer traveller' })).toBeInTheDocument();
            expect(within(travellers).getByRole('button', { name: 'One more traveller' })).toBeInTheDocument();
            expect(within(travellers).getByRole('status')).toHaveTextContent(/^2$/);
        });

        it('calls the handlers with the value one up or one down', async () => {
            const user = userEvent.setup();
            const { onNightsChange, onTravellersChange } = renderCard(V1);

            await user.click(screen.getByRole('button', { name: 'One more night' }));
            expect(onNightsChange).toHaveBeenLastCalledWith(4);
            await user.click(screen.getByRole('button', { name: 'One fewer night' }));
            expect(onNightsChange).toHaveBeenLastCalledWith(2);

            await user.click(screen.getByRole('button', { name: 'One more traveller' }));
            expect(onTravellersChange).toHaveBeenLastCalledWith(3);
            await user.click(screen.getByRole('button', { name: 'One fewer traveller' }));
            expect(onTravellersChange).toHaveBeenLastCalledWith(1);
        });

        it('disables the decrement buttons at 1', () => {
            renderCard(ONE_AND_ONE);

            expect(screen.getByRole('button', { name: 'One fewer night' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'One fewer traveller' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'One more night' })).toBeEnabled();
            expect(screen.getByRole('button', { name: 'One more traveller' })).toBeEnabled();
        });

        it('disables the increment buttons at 14 nights and 9 travellers', () => {
            renderCard(AT_MAX);

            expect(screen.getByRole('button', { name: 'One more night' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'One more traveller' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'One fewer night' })).toBeEnabled();
            expect(screen.getByRole('button', { name: 'One fewer traveller' })).toBeEnabled();
        });
    });

    describe('C23: removing lines', () => {
        it('removes each chosen line by its kind', async () => {
            const user = userEvent.setup();
            const { onRemove } = renderCard(V1);

            await user.click(screen.getByRole('button', { name: 'Remove flight from trip cost' }));
            expect(onRemove).toHaveBeenLastCalledWith('outbound-flight');
            await user.click(screen.getByRole('button', { name: 'Remove stay from trip cost' }));
            expect(onRemove).toHaveBeenLastCalledWith('stay');
        });

        it('shows "Not chosen yet" and no remove button on a line that is not chosen', () => {
            renderCard({
                ...V1,
                lines: [notChosen('outbound-flight', 2), lineByKind(V1, 'stay')],
                totalCents: 44967,
                allInCents: 44967,
                prefix: 'from ',
                allInPrefix: 'from ',
            });

            expect(screen.getByText('Not chosen yet')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Remove flight from trip cost' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove stay from trip cost' })).toBeInTheDocument();
        });
    });
});
