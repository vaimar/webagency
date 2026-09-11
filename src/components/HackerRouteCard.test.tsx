import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import * as hackerRoutes from '../services/hackerRoutes';
import { ObservedFare, ObservedFlight, observedFareKey } from '../services/observedFares';
import { HackerItinerary } from '../services/hackerRoutes';
import HackerRouteCard from './HackerRouteCard';

// SNN 19:00 → STN 20:30, 10h05 on the ground, then STN 06:35 → AGP 10:30 the
// NEXT morning. Shown as bare clock times, leg 2 reads as a flight that left
// before leg 1 ever took off.
const overnight: HackerItinerary = {
    type: 'SELF_TRANSFER',
    origin: 'SNN',
    hub: 'STN',
    destination: 'AGP',
    leg1: {
        airlineCodes: ['FR'],
        origin: 'SNN',
        destination: 'STN',
        departureTime: '19:00:00',
        arrivalTime: '20:30:00',
    },
    leg2: {
        airlineCodes: ['U2', 'EZY'],
        origin: 'STN',
        destination: 'AGP',
        departureTime: '06:35:00',
        arrivalTime: '10:30:00',
    },
    layoverMinutes: 605,
    totalJourneyMinutes: 870,
    status: 'SCHEDULE_ONLY',
};

const mixed: HackerItinerary = {
    ...overnight,
    hub: 'MAD',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'MAD', departureTime: '11:50', arrivalTime: '15:05' },
    leg2: { airlineCodes: ['IB', 'VY'], origin: 'MAD', destination: 'AGP', departureTime: '19:05', arrivalTime: '20:20' },
    layoverMinutes: 240,
    totalJourneyMinutes: 450,
};

/**
 * Madrid → Ibiza, 1h15, arriving from the provider with American Airlines
 * printed on it alongside the two Spanish carriers. AA flies none of it.
 */
const codeshare: HackerItinerary = {
    type: 'DIRECT',
    origin: 'MAD',
    hub: null,
    destination: 'IBZ',
    leg1: {
        airlineCodes: ['AA', 'I2', 'VY'],
        origin: 'MAD',
        destination: 'IBZ',
        departureTime: '11:30',
        arrivalTime: '12:45',
        date: '2026-09-27',
        durationMinutes: 75,
    },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 75,
    status: 'SCHEDULE_ONLY',
};

const legRow = (label: string): HTMLElement => (
    screen.getByText(label).closest('.hacker-route-card__leg') as HTMLElement
);

/**
 * The per-flight rows and their partner links live behind the card's
 * "Booking options" toggle — a list of twenty-two routes each showing three
 * rows of links is unreadable, so the detail opens on the route you pick.
 */
const openDetails = async (): Promise<void> => {
    await userEvent.setup().click(screen.getByRole('button', { name: /Booking options/i }));
};

describe('HackerRouteCard', () => {
    it('keeps the partner links behind the booking toggle, and the catch outside it', () => {
        // A list of twenty-two routes, each with three rows of partner links,
        // is a wall rather than a result list — so the booking detail folds
        // away. What decides whether the routing is safe to book does not:
        // the connection, the journey time and the price stay on the card.
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        expect(screen.queryByRole('link', { name: /Ryanair/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Booking options/i })).toBeInTheDocument();

        const timeline = document.querySelector('.hacker-route-card__timeline') as HTMLElement;
        expect(timeline).toHaveTextContent('19:00');
        // Landing time and the day it lands on — resolved by the schedule, so
        // it says the same thing as the leg row underneath it.
        expect(timeline).toHaveTextContent('09:30');
        expect(within(timeline).getByTitle('Lands Mon 7 Sep')).toHaveTextContent('+1');
        expect(screen.getByText(/total journey/)).toHaveTextContent('10h05 layover at London Stansted (STN)');
    });

    it('dates each leg, putting an overnight second leg on the next day', async () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);
        await openDetails();

        expect(within(legRow('Leg 1')).getByText('Sun 6 Sep')).toBeInTheDocument();
        expect(within(legRow('Leg 2')).getByText('Mon 7 Sep')).toBeInTheDocument();
    });

    it('books each leg on its own date, not the search date', async () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);
        await openDetails();

        // Leg 1 is Ryanair, so its own deep link carries the date.
        const leg1Ryanair = within(legRow('Leg 1')).getByRole('link', { name: /Ryanair/ });
        expect(leg1Ryanair).toHaveAttribute('href', expect.stringContaining('dateOut=2026-09-06'));

        // Leg 2 is easyJet and departs the NEXT morning — the aggregator links
        // are the ones that carry a date, and it has to be leg 2's own.
        const leg2Kiwi = within(legRow('Leg 2')).getByRole('link', { name: /Kiwi/ });
        expect(leg2Kiwi).toHaveAttribute('href', expect.stringContaining('/2026-09-07'));
    });

    it('sends each leg to the airline that actually flies it', async () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);
        await openDetails();

        expect(within(legRow('Leg 1')).getByRole('link', { name: /Ryanair/ })).toBeInTheDocument();
        // The easyJet leg used to offer a Ryanair search for a route Ryanair does not fly.
        expect(within(legRow('Leg 2')).getByRole('link', { name: /easyJet/ })).toBeInTheDocument();
        expect(within(legRow('Leg 2')).queryByRole('link', { name: /Ryanair/ })).not.toBeInTheDocument();
    });

    it('spells out the date span in the header when the trip ends on a later day', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        const head = document.querySelector('.hacker-route-card__head-meta') as HTMLElement;
        expect(head).toHaveTextContent('Sun 6 Sep → Mon 7 Sep');
        expect(within(head).getByText('2 flights')).toBeInTheDocument();
    });

    it('shows each operating carrier logo once, by name', async () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);
        await openDetails();

        // U2 and EZY are both easyJet — one brand, one chip, one logo.
        const chips = document.querySelectorAll('.hacker-route-card__airline');
        expect([...chips].map((chip) => chip.textContent)).toEqual(['Ryanair', 'easyJet']);

        const logos = document.querySelectorAll('img.airline-logo');
        expect([...logos].map((logo) => logo.getAttribute('src'))).toEqual([
            'https://images.kiwi.com/airlines/64/FR.png',
            'https://images.kiwi.com/airlines/64/U2.png',
            'https://images.kiwi.com/airlines/64/FR.png',
            'https://images.kiwi.com/airlines/64/U2.png',
        ]);
    });

    it('itemises the extras rather than leaving a bare "+ €26 extras"', () => {
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: true, farePoints: [],
                    honestTotal: 64, extras: 26, cabinBags: 2, bagCost: 20, transferCost: 6, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
            />,
        );

        // The fare leads; the all-in and what makes it up sit under it.
        expect(screen.getByText('€38')).toBeInTheDocument();
        expect(screen.getByText('€64 all-in')).toBeInTheDocument();
        expect(screen.getByText('2 cabin bags €20 · airport transfer €6')).toBeInTheDocument();
    });

    it('says the total is a small-bag one when the bag has been taken out', () => {
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                smallBagOnly
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: true, farePoints: [],
                    honestTotal: 44, extras: 6, cabinBags: 0, bagCost: 0, transferCost: 6, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
            />,
        );

        expect(screen.getByText('€44 all-in (small bag)')).toBeInTheDocument();
        expect(screen.getByText('airport transfer €6')).toBeInTheDocument();
    });

    it('offers the fare box on a flight the feed priced with a different departure', async () => {
        // Nothing free can price a named Ryanair departure — the per-flight
        // endpoint refuses us — but the traveller is looking at it.
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                onObserveFare={vi.fn()}
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: false,
                    farePoints: [{ leg: 1, clock: '06:20' }],
                    honestTotal: null, extras: null, cabinBags: 0, bagCost: 0, transferCost: 0,
                    lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
            />,
        );

        expect(screen.getByRole('button', { name: /Add it/i })).toBeInTheDocument();
    });

    it('says when the total leans on a fare the traveller entered', () => {
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                onObserveFare={vi.fn()}
                autoPrice={{
                    total: 51, leg1: 29, leg2: 22, exact: true, farePoints: [],
                    honestTotal: null, extras: null, cabinBags: 0, bagCost: 0, transferCost: 0,
                    lateArrivalCost: 0, frictionCost: 0, observedLegs: 1, seenAt: null,
                }}
            />,
        );

        expect(screen.getByText('includes a fare you entered')).toBeInTheDocument();
        // And it is not dressed up as a fetched quote.
        expect(document.querySelector('.hacker-route-card__price--exact')).toBeNull();
    });

    it('shows a floor, not a price, when the fare is another departure\'s', () => {
        // Ryanair publishes one fare per day per route, so a card departing
        // 19:00 can be showing the 06:20 flight's price.
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: false,
                    farePoints: [{ leg: 1, clock: '06:20' }],
                    honestTotal: null, extras: null, cabinBags: 0, bagCost: 0, transferCost: 0, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
            />,
        );

        expect(screen.getByText('from €38')).toBeInTheDocument();
        // Said as what it means: this is another departure's price.
        expect(screen.getByText(/cheapest that day \(06:20 on leg 1\) — not these flights/)).toBeInTheDocument();
        expect(screen.getByTitle(/belongs to a different flight on the same day/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Get Live Price/ })).not.toBeInTheDocument();
    });

    it('states a fare plainly when it is for exactly these flights', () => {
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: true, farePoints: [],
                    honestTotal: null, extras: null, cabinBags: 0, bagCost: 0, transferCost: 0, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
            />,
        );

        // No "from" — this itinerary really does cost this.
        expect(screen.getByText('€38')).toBeInTheDocument();
        expect(screen.queryByText('from €38')).not.toBeInTheDocument();
        expect(screen.getByText(/fares for these flights/)).toBeInTheDocument();
    });

    it('keeps the Ryanair leg\'s fare when the other leg cannot be priced', async () => {
        // The Ryanair half prices for free; the Vueling half needs the paid
        // aggregator. Throwing away the half we fetched — as this used to —
        // discards real information and tells the visitor nothing is known.
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'SNN', destination: 'MAD', price: 26.5, departure: '2026-09-06T11:50:00' },
            leg2: { origin: 'MAD', destination: 'AGP', price: null, departure: null },
            combinedPrice: null,
            currency: 'EUR',
            status: 'PRICE_UNAVAILABLE',
        });
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={mixed} date="2026-09-06" />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        // "+ ?" so this can never be read as the cost of the whole trip.
        expect(await screen.findByText('€27 + ?')).toBeInTheDocument();
        expect(screen.getByText(/Leg 1 only — MAD → AGP has no free fare source/)).toBeInTheDocument();
        expect(screen.getByTitle(/NOT the cost of the trip/)).toBeInTheDocument();
    });

    it('does not blame a missing Ryanair fare on the carrier being unsupported', async () => {
        // The card says "Operated by Ryanair" on both legs. Telling the reader
        // that leg has "no free fare source" is untrue — Ryanair IS the free
        // source. What is missing is a fare on that date, because the route
        // very likely does not fly that day.
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'SNN', destination: 'STN', price: null, departure: null },
            leg2: { origin: 'STN', destination: 'AGP', price: 15, departure: '2026-09-07T06:35:00' },
            combinedPrice: null,
            currency: 'EUR',
            status: 'PRICE_UNAVAILABLE',
        });
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        expect(await screen.findByText(/no Ryanair fare on Sun 6 Sep — it may not fly that day/)).toBeInTheDocument();
        expect(screen.queryByText(/no free fare source/)).not.toBeInTheDocument();
    });

    it('still says nothing is known when neither leg prices', async () => {
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'SNN', destination: 'MAD', price: null, departure: null },
            leg2: { origin: 'MAD', destination: 'AGP', price: null, departure: null },
            combinedPrice: null,
            currency: 'EUR',
            status: 'PRICE_UNAVAILABLE',
        });
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={mixed} date="2026-09-06" />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        expect(await screen.findByText(/Live price unavailable right now/)).toBeInTheDocument();
    });

    it('lets the traveller supply the fare no free source can price', async () => {
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'SNN', destination: 'MAD', price: 26.5, departure: '2026-09-06T11:50:00' },
            leg2: { origin: 'MAD', destination: 'AGP', price: null, departure: null },
            combinedPrice: null,
            currency: 'EUR',
            status: 'PRICE_UNAVAILABLE',
        });
        const observed: Record<string, ObservedFare> = {};
        const onObserveFare = vi.fn((flight: ObservedFlight, price: number) => {
            observed[observedFareKey(flight)] = { price, savedAt: new Date().toISOString() };
        });
        const user = userEvent.setup();
        const { rerender } = render(
            <HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={observed} onObserveFare={onObserveFare} />,
        );

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));
        // The prompt only appears once a fetch has actually come back empty.
        await user.click(await screen.findByRole('button', { name: /Saw a price for MAD → AGP\? Add it/ }));
        await user.type(screen.getByRole('textbox'), '148');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        // Keyed to the exact flight, so it cannot leak onto the other carrier
        // flying MAD → AGP that day.
        expect(onObserveFare).toHaveBeenCalledWith(
            expect.objectContaining({
                origin: 'MAD', destination: 'AGP', date: '2026-09-06',
                carriers: ['IB', 'VY'], departureTime: '19:05',
            }),
            148,
        );

        rerender(
            <HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={observed} onObserveFare={onObserveFare} />,
        );

        // €26.50 live + €148 entered = €174.50, shown as an approximation with
        // both sources named.
        expect(screen.getByText('≈ €175')).toBeInTheDocument();
        expect(screen.getByText(/€27 live \+ €148 you saw/)).toBeInTheDocument();
        expect(screen.getByTitle(/a price you entered yourself/)).toBeInTheDocument();
    });

    it('will not complete a total from a sighting that has expired', async () => {
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'SNN', destination: 'MAD', price: 26.5, departure: '2026-09-06T11:50:00' },
            leg2: { origin: 'MAD', destination: 'AGP', price: null, departure: null },
            combinedPrice: null,
            currency: 'EUR',
            status: 'PRICE_UNAVAILABLE',
        });
        // Entered three weeks ago. Airline pricing has moved on several times
        // since; it must not still be quietly finishing a journey total.
        const stale: Record<string, ObservedFare> = {
            [observedFareKey({
                origin: 'MAD', destination: 'AGP', date: '2026-09-06',
                carriers: ['IB', 'VY'], departureTime: '19:05',
            })]: { price: 148, savedAt: new Date(Date.now() - 21 * 86_400_000).toISOString() },
        };
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={stale} onObserveFare={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        // The half we know stands; the expired half does not become a total.
        expect(await screen.findByText('€27 + ?')).toBeInTheDocument();
        expect(screen.queryByText(/≈ €175/)).not.toBeInTheDocument();
        // Still visible, and labelled as spent, so it can be refreshed.
        expect(screen.getByText(/expired/)).toBeInTheDocument();
    });

    it('does not offer fare entry before a price has been sought', () => {
        render(<HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={{}} onObserveFare={vi.fn()} />);

        expect(screen.queryByRole('button', { name: /Saw a price/ })).not.toBeInTheDocument();
    });

    it('shows how long each flight is, separately from the journey total', async () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);
        await openDetails();

        // SNN 19:00 → STN 20:30 is 1h30 in the air; STN 06:35 → AGP 10:30 is
        // 2h55. The banner's 14h30 is the whole journey including the layover,
        // which is a different and much larger number.
        expect(within(legRow('Leg 1')).getByText('1h30')).toBeInTheDocument();
        expect(within(legRow('Leg 2')).getByText('2h55')).toBeInTheDocument();
        expect(screen.getByText(/total journey/)).toHaveTextContent('14h30');
    });

    it('keeps the Kiwi link on a leg through an airport nobody has curated', async () => {
        // BIO is in the schedule graph but not the ~100 hand-written airport
        // entries, so its leg used to render with no Kiwi link at all. The
        // backend ships the municipality and country for every stop.
        const viaBilbao: HackerItinerary = {
            ...overnight,
            hub: 'BIO',
            leg1: { airlineCodes: ['FR'], origin: 'DUB', destination: 'BIO', departureTime: '09:00', arrivalTime: '12:00', date: '2026-09-06', durationMinutes: 120 },
            leg2: { airlineCodes: ['FR'], origin: 'BIO', destination: 'AGP', departureTime: '15:00', arrivalTime: '16:30', date: '2026-09-06', durationMinutes: 90 },
            originAirport: { iata: 'DUB', municipality: 'Dublin', isoCountry: 'IE' },
            hubAirport: { iata: 'BIO', municipality: 'Bilbao', isoCountry: 'ES' },
            destinationAirport: { iata: 'AGP', municipality: 'Málaga', isoCountry: 'ES' },
        };
        render(<HackerRouteCard itinerary={viaBilbao} date="2026-09-06" />);
        await openDetails();

        const leg1Kiwi = within(legRow('Leg 1')).getByRole('link', { name: /Kiwi/ });
        expect(leg1Kiwi).toHaveAttribute('href', expect.stringContaining('/dublin-ireland/bilbao-spain/'));

        const leg2Kiwi = within(legRow('Leg 2')).getByRole('link', { name: /Kiwi/ });
        expect(leg2Kiwi).toHaveAttribute('href', expect.stringContaining('/bilbao-spain/malaga-spain/'));
    });

    it('warns that a tight connection only works with cabin baggage', () => {
        // SNN 14:05 → MAD 17:20, then MAD 19:05 → AGP. 1h45 is enough to walk
        // and re-clear security, not enough to reclaim and re-check a hold bag.
        const tight: HackerItinerary = {
            ...overnight,
            hub: 'MAD',
            leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'MAD', departureTime: '14:05', arrivalTime: '17:20', date: '2026-09-09', durationMinutes: 135 },
            leg2: { airlineCodes: ['UX'], origin: 'MAD', destination: 'AGP', departureTime: '19:05', arrivalTime: '20:20', date: '2026-09-09', durationMinutes: 75 },
            layoverMinutes: 105,
            totalJourneyMinutes: 315,
        };
        render(<HackerRouteCard itinerary={tight} date="2026-09-09" />);

        expect(screen.getByText('Cabin bags only')).toBeInTheDocument();
        // Stated on the card itself, not hidden in a tooltip nobody can hover
        // on a phone.
        expect(screen.getByText(
            'Separate tickets. This is under 2 hours: do not use it with checked luggage, '
            + 'allow for delays, and accept that the onward airline is not responsible if you miss it.',
        )).toBeInTheDocument();
    });

    it('says nothing about baggage when there is time to move a hold bag', () => {
        // The badge has to mean something; on a roomy connection it is noise.
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        expect(screen.queryByText('Cabin bags only')).not.toBeInTheDocument();
        expect(screen.queryByText(/Separate tickets\. This is under 2 hours/)).not.toBeInTheDocument();
    });

    it('hands the trip cart the price it is showing, and says what that price is worth', async () => {
        const onSelect = vi.fn();
        const { rerender } = render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: false,
                    farePoints: [{ leg: 1, clock: '06:20' }],
                    honestTotal: 64, extras: 26, cabinBags: 2, bagCost: 20, transferCost: 6, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
                onSelect={onSelect}
                selectLabel="Select outbound"
            />,
        );

        await userEvent.setup().click(screen.getByRole('button', { name: /Select outbound/ }));
        // A floor, not a fare for these departures — the cart total has to be
        // able to say so, so the provenance travels with the number.
        expect(onSelect).toHaveBeenCalledWith({ fare: 38, honest: 64, basis: 'floor' });

        rerender(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{
                    total: 38, leg1: 16, leg2: 22, exact: true, farePoints: [],
                    honestTotal: null, extras: null, cabinBags: 0, bagCost: 0, transferCost: 0, lateArrivalCost: 0, frictionCost: 0, observedLegs: 0, seenAt: null,
                }}
                onSelect={onSelect}
                selectLabel="Select outbound"
            />,
        );
        await userEvent.setup().click(screen.getByRole('button', { name: /Select outbound/ }));
        expect(onSelect).toHaveBeenLastCalledWith({ fare: 38, honest: null, basis: 'exact' });
    });

    it('reports the route already in the trip instead of asking for it again', () => {
        render(
            <HackerRouteCard itinerary={overnight} date="2026-09-06" onSelect={vi.fn()} selected />,
        );

        expect(screen.getByRole('button', { name: /In your trip/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers no trip button on a surface with no cart', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        expect(screen.queryByRole('button', { name: /trip/i })).not.toBeInTheDocument();
    });

    it('marks a landing that happens on a later day than the take-off', () => {
        const redEye: HackerItinerary = {
            ...overnight,
            type: 'DIRECT',
            hub: null,
            leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'AGP', departureTime: '23:10', arrivalTime: '02:35' },
            leg2: null,
            layoverMinutes: 0,
            totalJourneyMinutes: 205,
        };
        render(<HackerRouteCard itinerary={redEye} date="2026-09-06" />);

        expect(screen.getByText('+1')).toBeInTheDocument();
        expect(screen.getByTitle('Lands Mon 7 Sep')).toBeInTheDocument();
    });

    it('keeps the long-haul marketing carriers out of the operator row', async () => {
        // "American Airlines · Iberia Express · Vueling" on a 75-minute hop told
        // the reader to go and look for this fare on aa.com, where it is not.
        render(<HackerRouteCard itinerary={codeshare} date="2026-09-27" />);

        const carriers = document.querySelector('.hacker-route-card__carriers') as HTMLElement;
        expect(within(carriers).getByText('Iberia Express')).toBeInTheDocument();
        expect(within(carriers).getByText('Vueling')).toBeInTheDocument();
        expect(within(carriers).queryByText('American Airlines')).not.toBeInTheDocument();
        // Not hidden, though — counted, and named in full on hover.
        expect(within(carriers).getByText('+1 selling it')).toBeInTheDocument();
        expect(screen.getByTitle(/On this itinerary: American Airlines\./)).toBeInTheDocument();
    });

    it('says "or" rather than naming an operator it cannot single out', async () => {
        render(<HackerRouteCard itinerary={codeshare} date="2026-09-27" />);
        await openDetails();

        const operated = document.querySelector('.hacker-route-card__operated') as HTMLElement;
        expect(operated.textContent).toContain('Operated by Iberia Express or Vueling');
        expect(operated.textContent).toContain('also sold by American Airlines');
    });

    it('leaves a long leg\'s carriers alone, where the long-haul one may be flying it', async () => {
        // Madrid–Doha is a Qatar flight Iberia sells. Six hours in, the rule
        // that demotes Qatar on a short hop would name the wrong airline.
        const longHaul: HackerItinerary = {
            ...codeshare,
            destination: 'DOH',
            leg1: { ...codeshare.leg1, airlineCodes: ['QR', 'IB'], destination: 'DOH', durationMinutes: 380 },
        };
        render(<HackerRouteCard itinerary={longHaul} date="2026-09-27" />);

        const carriers = document.querySelector('.hacker-route-card__carriers') as HTMLElement;
        expect(within(carriers).getByText('Qatar Airways')).toBeInTheDocument();
        expect(within(carriers).getByText('Iberia')).toBeInTheDocument();
        expect(within(carriers).queryByText(/selling it/)).not.toBeInTheDocument();
    });

    it('states a fetched fare plainly when it is for the flight on the card', async () => {
        // The button answered "cheapest fare that day" whatever came back. The
        // response names the departure its fare is for, and here it is this one.
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'MAD', destination: 'IBZ', price: 22, departure: '2026-09-27T11:30:00' },
            leg2: { origin: '', destination: '', price: null, departure: null },
            combinedPrice: 22,
            currency: 'EUR',
            status: 'PRICED',
        });
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={codeshare} date="2026-09-27" />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        expect(await screen.findByText('fare for this flight')).toBeInTheDocument();
        // No "from": the number is what this itinerary costs, not a floor.
        expect(screen.getByText('€22')).toBeInTheDocument();
        expect(screen.queryByText(/cheapest fare that day/)).not.toBeInTheDocument();
    });

    it('still calls a fetched fare a floor when it belongs to another departure', async () => {
        vi.spyOn(hackerRoutes, 'fetchHackerRoutePrice').mockResolvedValue({
            leg1: { origin: 'MAD', destination: 'IBZ', price: 22, departure: '2026-09-27T18:10:00' },
            leg2: { origin: '', destination: '', price: null, departure: null },
            combinedPrice: 22,
            currency: 'EUR',
            status: 'PRICED',
        });
        const user = userEvent.setup();
        render(<HackerRouteCard itinerary={codeshare} date="2026-09-27" />);

        await user.click(screen.getByRole('button', { name: /Get Live Price/ }));

        expect(await screen.findByText('cheapest fare that day')).toBeInTheDocument();
        expect(screen.getByText('from €22')).toBeInTheDocument();
    });
});
