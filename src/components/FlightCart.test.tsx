import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    CartEstimate,
    FlightCart as Cart,
    buildCartFlight,
    clearCart,
    markBooked,
    recordPaid,
    recordReference,
    removeFlight,
    selectFlight,
} from '../services/flightCart';
import { HackerItinerary } from '../services/hackerRoutes';
import FlightCart from './FlightCart';

const direct = (origin: string, destination: string): HackerItinerary => ({
    type: 'DIRECT',
    origin,
    hub: null,
    destination,
    leg1: { airlineCodes: ['FR'], origin, destination, departureTime: '07:15', arrivalTime: '11:20' },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 245,
    status: 'SCHEDULE_ONLY',
});

const exact = (fare: number): CartEstimate => ({ fare, honest: null, basis: 'exact' });
const floor = (fare: number): CartEstimate => ({ fare, honest: null, basis: 'floor' });

const outbound = (estimate: CartEstimate = exact(47)) => (
    buildCartFlight('outbound', direct('SNN', 'AGP'), '2026-09-12', estimate)
);
const inbound = (estimate: CartEstimate = exact(52)) => (
    buildCartFlight('return', direct('AGP', 'SNN'), '2026-09-15', estimate)
);

/**
 * The panel is controlled by the page, so the test drives it through the same
 * cart functions the page uses — otherwise it would only be testing that props
 * render, never that ticking a box changes the total.
 */
const Harness: React.FC<{ initial: Cart; isOneWay?: boolean }> = ({ initial, isOneWay = false }) => {
    const [cart, setCart] = useState<Cart>(initial);
    return (
        <FlightCart
            cart={isOneWay ? cart.filter((flight) => flight.direction === 'outbound') : cart}
            isOneWay={isOneWay}
            activeStep="review"
            onChoose={() => undefined}
            onRemove={(id) => setCart((current) => removeFlight(current, id))}
            onBooked={(id, booked) => setCart((current) => markBooked(current, id, booked))}
            onPaid={(id, paid) => setCart((current) => recordPaid(current, id, paid))}
            onReference={(id, reference) => setCart((current) => recordReference(current, id, reference))}
            onClear={() => setCart(clearCart())}
        />
    );
};

/** One direction's row. Scoped to the list, because the step rail above it
    carries the same words. */
const row = (direction: string): HTMLElement => {
    const rows = document.querySelector('.flight-cart__rows') as HTMLElement;
    return within(rows).getByText(direction).closest('.flight-cart__row') as HTMLElement;
};

describe('FlightCart', () => {
    beforeEach(() => window.localStorage.clear());

    it('totals the two halves of the trip, and calls it an estimate until it is booked', () => {
        render(<Harness initial={selectFlight(selectFlight([], outbound()), inbound())} />);

        expect(screen.getByText('≈ €99')).toBeInTheDocument();
        expect(screen.getByText('Trip total')).toBeInTheDocument();
    });

    it('says "from" when part of the total is the day floor rather than this flight\'s fare', () => {
        render(<Harness initial={selectFlight([], outbound(floor(47)))} />);

        expect(screen.getByText('from €47')).toBeInTheDocument();
        expect(screen.getByText(/may belong to another departure/)).toBeInTheDocument();
    });

    it('asks what was paid only once a flight is ticked off, and puts that in the total', async () => {
        const user = userEvent.setup();
        render(<Harness initial={selectFlight(selectFlight([], outbound()), inbound())} />);

        expect(screen.queryByPlaceholderText('€')).not.toBeInTheDocument();

        await user.click(within(row('Outbound')).getByRole('checkbox'));
        await user.type(within(row('Outbound')).getByPlaceholderText('€'), '61');
        await user.tab();

        // 61 paid + 52 still estimated.
        expect(screen.getByText('≈ €113')).toBeInTheDocument();
        expect(screen.getByText('€61 paid · €52 still estimated')).toBeInTheDocument();
    });

    it('stops calling the total an estimate once every ticket has been bought', async () => {
        const user = userEvent.setup();
        render(<Harness initial={selectFlight(selectFlight([], outbound()), inbound())} />);

        for (const direction of ['Outbound', 'Return']) {
            await user.click(within(row(direction)).getByRole('checkbox'));
            await user.type(within(row(direction)).getByPlaceholderText('€'), '50');
            await user.tab();
        }

        expect(screen.getByText('Total paid')).toBeInTheDocument();
        expect(screen.getByText('€100')).toBeInTheDocument();
    });

    it('drops what was entered when a flight is un-ticked, rather than keeping a price nobody paid', async () => {
        const user = userEvent.setup();
        render(<Harness initial={selectFlight([], outbound())} />);

        await user.click(screen.getByRole('checkbox'));
        await user.type(screen.getByPlaceholderText('€'), '61');
        await user.tab();
        expect(within(row('Outbound')).getByText('€61')).toBeInTheDocument();

        await user.click(screen.getByRole('checkbox'));
        expect(within(row('Outbound')).getByText('€47')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('€')).not.toBeInTheDocument();
    });

    it('shows the half of the trip not chosen yet as an empty step', () => {
        render(<Harness initial={selectFlight([], outbound())} />);

        expect(within(row('Return')).getByText(/Not chosen yet/)).toBeInTheDocument();
    });

    it('says a flight nobody could price is missing from the total instead of counting it as nothing', () => {
        const unpriced = buildCartFlight(
            'return', direct('AGP', 'SNN'), '2026-09-15', { fare: null, honest: null, basis: 'unknown' },
        );
        render(<Harness initial={selectFlight(selectFlight([], outbound()), unpriced)} />);

        expect(screen.getByText('≈ €47')).toBeInTheDocument();
        expect(within(row('Return')).getByText('—')).toBeInTheDocument();
        expect(screen.getByText(/One flight has no price yet/)).toBeInTheDocument();
    });

    it('leaves the return out of a one-way trip entirely', () => {
        render(<Harness initial={selectFlight(selectFlight([], outbound()), inbound())} isOneWay />);

        expect(screen.queryByText('Return')).not.toBeInTheDocument();
        expect(screen.getByText('≈ €47')).toBeInTheDocument();
    });

    it('books each ticket on the airline site — a self-transfer carries two sets of links', () => {
        const selfTransfer: HackerItinerary = {
            type: 'SELF_TRANSFER',
            origin: 'SNN',
            hub: 'STN',
            destination: 'AGP',
            leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
            leg2: { airlineCodes: ['FR'], origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
            layoverMinutes: 605,
            totalJourneyMinutes: 870,
            status: 'SCHEDULE_ONLY',
        };
        const cart = selectFlight([], buildCartFlight('outbound', selfTransfer, '2026-09-12', floor(38)));
        render(<Harness initial={cart} />);

        // Named, not coded: "STN" is London Stansted and the row says so.
        expect(screen.getByText(/Ticket 1 · Shannon \(SNN\) → London Stansted \(STN\)/)).toBeInTheDocument();
        // Leg 2 leaves the morning AFTER the search date, and books on that day.
        expect(screen.getByText(/Ticket 2 · London Stansted \(STN\) → Málaga \(AGP\) · Sun 13 Sep/))
            .toBeInTheDocument();
    });
});
