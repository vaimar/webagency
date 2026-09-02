import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import HackFlights from './HackFlights';
import { FlightAvailable } from './services/api';

const fare = (over: Partial<FlightAvailable>): FlightAvailable => ({
    origin: 'SNN',
    destination: 'AGP',
    price: 100,
    airline: 'Ryanair',
    ...over,
});

const searchFlights = vi.fn();
const refreshFlights = vi.fn();
const fetchHackerRoutes = vi.fn();

/** A two-leg Ryanair routing through `hub`, priced so nothing gets hidden. */
const hackerRoute = (hub: string, dep1: string, arr1: string, dep2: string, arr2: string) => ({
    type: 'SELF_TRANSFER' as const,
    origin: 'SNN',
    hub,
    destination: 'AGP',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: hub, departureTime: dep1, arrivalTime: arr1, date: '2026-09-06', durationMinutes: 90 },
    leg2: { airlineCodes: ['FR'], origin: hub, destination: 'AGP', departureTime: dep2, arrivalTime: arr2, date: '2026-09-06', durationMinutes: 180 },
    layoverMinutes: 135,
    totalJourneyMinutes: 405,
    status: 'SCHEDULE_ONLY',
});

vi.mock('./services/hackerRoutes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./services/hackerRoutes')>()),
    fetchHackerRoutes: (...args: unknown[]) => fetchHackerRoutes(...args),
    // Every leg prices, so the Ryanair validity check keeps them all.
    fetchLegPrice: async () => ({ price: 20, departure: null }),
}));

vi.mock('./services/api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./services/api')>()),
    searchFlights: (...args: unknown[]) => searchFlights(...args),
    refreshFlights: (...args: unknown[]) => refreshFlights(...args),
}));

const airportInput = (label: string): HTMLInputElement => (
    screen.getByLabelText(label) as HTMLInputElement
);

describe('Hack Flights search controls', () => {
    it('lands on Route hacker, with Live deals still reachable', () => {
        render(<HackFlights />);

        expect(screen.getByRole('tab', { name: 'Route hacker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Live deals' })).toHaveAttribute('aria-selected', 'false');
    });

    it('does not offer the paid extended search while its quota is spent', () => {
        render(<HackFlights />);

        // Live deals is where the checkbox lived.
        screen.getByRole('tab', { name: 'Live deals' }).click();

        expect(screen.queryByText(/Extend search/i)).not.toBeInTheDocument();
    });

    beforeEach(() => {
        searchFlights.mockReset();
        refreshFlights.mockReset();
        refreshFlights.mockResolvedValue(undefined);
        searchFlights.mockResolvedValue({ flights: [] });
        fetchHackerRoutes.mockReset();
        fetchHackerRoutes.mockResolvedValue([]);
    });

    it('searches both directions for a round trip', async () => {
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));

        // Coming home is its own search: mirrored route, on the return date.
        await screen.findByRole('region', { name: /Outbound results/i });
        expect(screen.getByRole('region', { name: /Return results/i })).toBeInTheDocument();

        const calls = fetchHackerRoutes.mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0].slice(0, 2)).toEqual(['SNN', 'AGP']);
        expect(calls[1].slice(0, 2)).toEqual(['AGP', 'SNN']);
        // Each direction on its own date.
        expect(calls[0][2]).not.toBe(calls[1][2]);
    });

    it('searches one direction only when one-way is ticked', async () => {
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('checkbox', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));

        await screen.findByRole('region', { name: /Route Hacker results/i });
        expect(fetchHackerRoutes.mock.calls).toHaveLength(1);
        expect(screen.queryByRole('region', { name: /Return results/i })).not.toBeInTheDocument();
    });

    it('filters the routes down to the hubs left ticked', async () => {
        const routes = [
            hackerRoute('STN', '06:20', '07:50', '10:05', '13:40'),
            hackerRoute('STN', '07:30', '09:00', '18:00', '21:55'),
            hackerRoute('MAD', '11:50', '15:05', '19:05', '20:20'),
        ];
        fetchHackerRoutes.mockResolvedValue(routes);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('checkbox', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by stops/i });

        // One checkbox per hub, carrying how many routes go through it.
        const stn = screen.getByRole('checkbox', { name: /STN/ });
        const mad = screen.getByRole('checkbox', { name: /MAD/ });
        expect(stn).toBeChecked();
        expect(mad).toBeChecked();
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(3);

        await user.click(stn);

        // The two Stansted routings go; Madrid stays.
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(1);
        expect(screen.getByRole('button', { name: /Show all hubs/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Show all hubs/i }));
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(3);
    });

    it('says so when every remaining route is filtered out by hub', async () => {
        fetchHackerRoutes.mockResolvedValue([
            hackerRoute('STN', '06:20', '07:50', '10:05', '13:40'),
            hackerRoute('MAD', '11:50', '15:05', '19:05', '20:20'),
        ]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('checkbox', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by stops/i });

        await user.click(screen.getByRole('checkbox', { name: /STN/ }));
        await user.click(screen.getByRole('checkbox', { name: /MAD/ }));

        expect(screen.getByText(/every remaining route connects through a hub you have unticked/i))
            .toBeInTheDocument();
    });

    it('swaps origin and destination when the direction button is pressed', async () => {
        const user = userEvent.setup();
        render(<HackFlights />);

        const from = airportInput('From').value;
        const to = airportInput('To').value;
        expect(from).not.toBe(to);

        await user.click(screen.getByRole('button', { name: /swap direction/i }));

        expect(airportInput('From').value).toBe(to);
        expect(airportInput('To').value).toBe(from);
    });

    it('does not fire a search when the direction is swapped', async () => {
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('button', { name: /swap direction/i }));

        // The extended path bills a paid API per query — flipping the route is
        // an edit to the form, never a search.
        expect(searchFlights).not.toHaveBeenCalled();
        expect(refreshFlights).not.toHaveBeenCalled();
    });

    it('brands cached fares with the airline the free search actually queried', async () => {
        const user = userEvent.setup();
        // The cached feed stores no carrier field at all — the page knows it is
        // Ryanair because that is the only airline this path asks.
        searchFlights.mockResolvedValue({
            flights: [fare({ airline: undefined, departureDate: '2026-09-06T06:00:00' })],
        });
        render(<HackFlights />);
        await user.click(screen.getByRole('tab', { name: 'Live deals' }));

        await user.click(screen.getByRole('button', { name: /search cached fares/i }));

        // The logo sits beside the name, so it carries no alt text of its own —
        // a screen reader should hear "Ryanair" once, not twice.
        // Both legs of the round trip carry the same carrier — take the outbound one.
        const [brand] = await screen.findAllByText('Ryanair', { selector: '.flight-card__airline' });
        expect(brand.querySelector('img')).toHaveAttribute('src', 'https://images.kiwi.com/airlines/64/FR.png');
        expect(brand.querySelector('img')).toHaveAttribute('alt', '');
    });

    it('reorders cached fares by landing time when that sort is picked', async () => {
        const user = userEvent.setup();
        // Cheapest lands last; the earliest landing is the dearest fare.
        searchFlights.mockResolvedValue({
            flights: [
                fare({
                    flightNumber: 'FR 900',
                    price: 30,
                    departureDate: '2026-09-06T17:00:00',
                    arrivalDate: '2026-09-06T21:00:00',
                }),
                fare({
                    flightNumber: 'FR 100',
                    price: 250,
                    departureDate: '2026-09-06T06:00:00',
                    arrivalDate: '2026-09-06T09:30:00',
                }),
            ],
        });
        render(<HackFlights />);
        await user.click(screen.getByRole('tab', { name: 'Live deals' }));

        await user.click(screen.getByRole('button', { name: /search cached fares/i }));

        const outbound = await screen.findByRole('region', { name: /outbound results/i });
        await waitFor(() => {
            expect(within(outbound).getAllByText(/FR \d+/)).toHaveLength(2);
        });
        // Cards title themselves "Flight FR 900 to Málaga" — the number is what identifies the row.
        const numbers = () => within(outbound)
            .getAllByText(/FR \d+/)
            .map((node) => node.textContent?.match(/FR \d+/)?.[0]);

        expect(numbers()).toEqual(['FR 900', 'FR 100']);

        await user.click(screen.getAllByRole('button', { name: 'Landing time' })[0]);

        expect(numbers()).toEqual(['FR 100', 'FR 900']);
    });
});
