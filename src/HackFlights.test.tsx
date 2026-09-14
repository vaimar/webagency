import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import HackFlights from './HackFlights';
import { FlightAvailable } from './services/api';
import { buildCartFlight, selectFlight } from './services/flightCart';
import { rememberHackerSearch } from './services/lastHackerSearch';

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
const fetchLegPrice = vi.fn();

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
    fetchLegPrice: (...args: unknown[]) => fetchLegPrice(...args),
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
        fetchLegPrice.mockReset();
        fetchLegPrice.mockResolvedValue({ price: 20, departure: null, status: 'priced' });
        // Fares are remembered for the tab and the day, so one test's prices
        // would otherwise answer the next test's lookups.
        window.sessionStorage.clear();
        // The last search and the trip cart outlive the tab by design, so one
        // test's search would otherwise be restored — and re-run — on the next
        // test's mount.
        window.localStorage.clear();
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

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
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

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
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

    it('keeps a fare it has already seen today instead of asking again', async () => {
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        // €20 a leg, and the fare is not tied to a departure, so it reads as
        // the route's floor rather than this itinerary's price.
        expect(await screen.findByText('from €40')).toBeInTheDocument();

        const asked = fetchLegPrice.mock.calls.length;
        expect(asked).toBeGreaterThan(0);

        // Leaving for Live deals and coming back unmounts the results. The
        // prices were on screen a moment ago; asking for them again would tell
        // nobody anything new.
        await user.click(screen.getByRole('tab', { name: 'Live deals' }));
        await user.click(screen.getByRole('tab', { name: 'Route hacker' }));

        expect(await screen.findByText('from €40')).toBeInTheDocument();
        expect(fetchLegPrice).toHaveBeenCalledTimes(asked);
    });

    it('counts the routes on show, and keeps counting as the filters bite', async () => {
        fetchHackerRoutes.mockResolvedValue([
            hackerRoute('STN', '06:20', '07:50', '10:05', '13:40'),
            hackerRoute('STN', '07:30', '09:00', '18:00', '21:55'),
            hackerRoute('MAD', '11:50', '15:05', '19:05', '20:20'),
        ]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by stops/i });

        const count = document.querySelector('.hack-flights__result-count') as HTMLElement;
        expect(count).toHaveTextContent('3 routes');

        // Untick Stansted and the headline follows the list, singular and all.
        await user.click(screen.getByRole('checkbox', { name: /STN/ }));
        expect(count).toHaveTextContent('1 route');
    });

    it('drops the routes flown by an airline that has been unticked', async () => {
        const viaEasyJet = {
            ...hackerRoute('MAD', '11:50', '15:05', '19:05', '20:20'),
            leg2: {
                airlineCodes: ['U2'], origin: 'MAD', destination: 'AGP',
                departureTime: '19:05', arrivalTime: '20:20', date: '2026-09-06', durationMinutes: 75,
            },
        };
        fetchHackerRoutes.mockResolvedValue([
            hackerRoute('STN', '06:20', '07:50', '10:05', '13:40'),
            viaEasyJet,
        ]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by stops/i });
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(2);

        // A self-transfer is out as soon as either of its carriers is: you
        // cannot fly the routing without flying both.
        await user.click(screen.getByRole('checkbox', { name: /easyJet/ }));
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(1);
        // Every other facet re-counts against it — and easyJet keeps its chip,
        // or there would be no way to tick it back on.
        expect(screen.getByRole('button', { name: /All \(1\)/ })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /easyJet/ })).not.toBeChecked();

        // And one button puts every filter back, whichever one is hiding things.
        await user.click(screen.getByRole('button', { name: /Reset filters/i }));
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(2);
    });

    it('offers both ends of the take-off and landing windows', async () => {
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by time/i });

        // Two handles each, named for the end of the window they move — a
        // keyboard user has to be able to say which one they are dragging.
        const takeOffFrom = screen.getByRole('slider', { name: 'Take-off from' });
        expect(takeOffFrom).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Take-off until' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Landing from' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Landing until' })).toBeInTheDocument();

        // The only route here takes off at 06:20. Walk the near handle to
        // 07:00 and it is outside the window the traveller asked for.
        takeOffFrom.focus();
        await user.keyboard('{ArrowRight>7/}');

        expect(document.querySelector('.time-range__value')).toHaveTextContent('07:00 – 24:00');
        expect(document.querySelectorAll('.hacker-route-card')).toHaveLength(0);
        expect(screen.getByText(/No route takes off and lands inside the hours you set/i))
            .toBeInTheDocument();
    });

    it('says so when every remaining route is filtered out by hub', async () => {
        fetchHackerRoutes.mockResolvedValue([
            hackerRoute('STN', '06:20', '07:50', '10:05', '13:40'),
            hackerRoute('MAD', '11:50', '15:05', '19:05', '20:20'),
        ]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('radio', { name: /One-way flight/i }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));
        await screen.findByRole('group', { name: /Filter routes by stops/i });

        await user.click(screen.getByRole('checkbox', { name: /STN/ }));
        await user.click(screen.getByRole('checkbox', { name: /MAD/ }));

        expect(screen.getByText(/every remaining route connects through a hub you have unticked/i))
            .toBeInTheDocument();
    });

    /** A date far enough ahead that no remembered search counts as flown. */
    const inDays = (days: number): string => (
        new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
    );

    it('brings the last search back when the page is opened again', async () => {
        // The trip cart outlives the tab, so the search that produced it has
        // to as well — otherwise someone returns to their flights with no list
        // to change them from.
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        rememberHackerSearch({
            origin: 'DUB',
            destination: 'FAO',
            departureDate: inDays(10),
            returnDate: inDays(17),
            isOneWay: false,
        });

        render(<HackFlights />);

        await waitFor(() => expect(fetchHackerRoutes.mock.calls).toHaveLength(2));
        expect(fetchHackerRoutes.mock.calls[0].slice(0, 3)).toEqual(['DUB', 'FAO', inDays(10)]);
        // And the search bar says what the list below it answered.
        expect(airportInput('From').value).toMatch(/DUB/);
        expect(airportInput('To').value).toMatch(/FAO/);
    });

    it('does not re-run a search whose flights have already departed', () => {
        rememberHackerSearch({
            origin: 'DUB',
            destination: 'FAO',
            departureDate: inDays(-3),
            returnDate: inDays(-1),
            isOneWay: false,
        });

        render(<HackFlights />);

        expect(fetchHackerRoutes).not.toHaveBeenCalled();
        expect(airportInput('From').value).toMatch(/SNN/);
    });

    it('goes and finds the flights again when Change is pressed on a reopened trip', async () => {
        // A trip picked yesterday, opened today: the cart is here, no search
        // has been run, and "Change" has to search the route this flight flew
        // rather than move a step marker over an empty page.
        selectFlight([], buildCartFlight('outbound', {
            type: 'DIRECT',
            origin: 'DUB',
            hub: null,
            destination: 'FAO',
            leg1: { airlineCodes: ['FR'], origin: 'DUB', destination: 'FAO', departureTime: '07:15', arrivalTime: '10:20' },
            leg2: null,
            layoverMinutes: 0,
            totalJourneyMinutes: 185,
            status: 'SCHEDULE_ONLY',
        }, inDays(9), { fare: 47, honest: null, basis: 'exact' }));
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        expect(fetchHackerRoutes).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: /Change/i }));

        await waitFor(() => expect(fetchHackerRoutes.mock.calls).toHaveLength(2));
        expect(fetchHackerRoutes.mock.calls[0].slice(0, 3)).toEqual(['DUB', 'FAO', inDays(9)]);
    });

    it('searches every airport of a city when the city is picked', async () => {
        // "Fly to Paris" is a sentence about a city. CDG, ORY and BVA are three
        // answers to it, one of them 85 km out in Beauvais.
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(airportInput('To'));
        await user.type(airportInput('To'), 'Paris');
        await user.click(await screen.findByRole('option', { name: /Paris — CDG, ORY, BVA/ }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));

        // Three airports out, three back.
        await waitFor(() => expect(fetchHackerRoutes.mock.calls).toHaveLength(6));
        expect(fetchHackerRoutes.mock.calls.slice(0, 3).map((call) => call.slice(0, 2)))
            .toEqual([['SNN', 'CDG'], ['SNN', 'ORY'], ['SNN', 'BVA']]);
        expect(fetchHackerRoutes.mock.calls.slice(3).map((call) => call.slice(0, 2)))
            .toEqual([['CDG', 'SNN'], ['ORY', 'SNN'], ['BVA', 'SNN']]);
    });

    it('says which airports a city search actually covered', async () => {
        fetchHackerRoutes.mockResolvedValue([hackerRoute('STN', '06:20', '07:50', '10:05', '13:40')]);
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(airportInput('To'));
        await user.type(airportInput('To'), 'Paris');
        await user.click(await screen.findByRole('option', { name: /Paris — CDG, ORY, BVA/ }));
        await user.click(screen.getByRole('button', { name: /assemble hacker routes/i }));

        // Named, not coded — and the airports it stood for are stated, because
        // "Paris" quietly covering Beauvais is the surprising part.
        expect(await screen.findByRole('heading', { name: /Outbound · Shannon → Paris/ })).toBeInTheDocument();
        // One line per direction: coming home is its own fan-out.
        const outbound = screen.getByRole('region', { name: /Outbound results/i });
        expect(within(outbound).getByText(/Searched 3 airport pairs/)).toHaveTextContent('SNN → CDG · ORY · BVA');
        expect(await screen.findAllByText(/Searched 3 airport pairs/)).toHaveLength(2);
    });

    it('sends a city to Route hacker rather than pretending Live deals can read one', async () => {
        const user = userEvent.setup();
        render(<HackFlights />);

        await user.click(screen.getByRole('tab', { name: 'Live deals' }));
        await user.click(airportInput('To'));
        await user.type(airportInput('To'), 'Paris');
        await user.click(await screen.findByRole('option', { name: /Paris — CDG, ORY, BVA/ }));
        await user.click(screen.getByRole('button', { name: /search cached fares/i }));

        expect(screen.getByRole('alert')).toHaveTextContent(/Live deals searches one airport at a time/);
        expect(refreshFlights).not.toHaveBeenCalled();
    });

    it('offers the small-bag option on the Route Hacker tab, not just Live deals', async () => {
        // The Route Hacker is where the bag hurts most: two tickets is two bag
        // fees, and it was quoting them with no way to say they do not apply.
        const user = userEvent.setup();
        render(<HackFlights />);

        const bagBox = screen.getByRole('checkbox', { name: /Small bag only/i });
        expect(screen.getByText(/Cabin-bag fee included/)).toBeInTheDocument();

        await user.click(bagBox);
        expect(screen.getByText(/Cabin-bag fee excluded from every total/)).toBeInTheDocument();
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
