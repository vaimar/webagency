import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import * as hackerRoutes from '../services/hackerRoutes';
import { ObservedFare } from '../services/observedFares';
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

const legRow = (label: string): HTMLElement => (
    screen.getByText(label).closest('.hacker-route-card__leg') as HTMLElement
);

describe('HackerRouteCard', () => {
    it('dates each leg, putting an overnight second leg on the next day', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        expect(within(legRow('Leg 1')).getByText('Sun 6 Sep')).toBeInTheDocument();
        expect(within(legRow('Leg 2')).getByText('Mon 7 Sep')).toBeInTheDocument();
    });

    it('books each leg on its own date, not the search date', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        // Leg 1 is Ryanair, so its own deep link carries the date.
        const leg1Ryanair = within(legRow('Leg 1')).getByRole('link', { name: /Ryanair/ });
        expect(leg1Ryanair).toHaveAttribute('href', expect.stringContaining('dateOut=2026-09-06'));

        // Leg 2 is easyJet and departs the NEXT morning — the aggregator links
        // are the ones that carry a date, and it has to be leg 2's own.
        const leg2Kiwi = within(legRow('Leg 2')).getByRole('link', { name: /Kiwi/ });
        expect(leg2Kiwi).toHaveAttribute('href', expect.stringContaining('/2026-09-07'));
    });

    it('sends each leg to the airline that actually flies it', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

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

    it('shows each operating carrier logo once, by name', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

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
                }}
            />,
        );

        expect(screen.getByText('from €38')).toBeInTheDocument();
        expect(screen.getByText(/route floor · cheapest departure 06:20 on leg 1/)).toBeInTheDocument();
        expect(screen.getByTitle(/belongs to a different flight on the same day/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Get Live Price/ })).not.toBeInTheDocument();
    });

    it('states a fare plainly when it is for exactly these flights', () => {
        render(
            <HackerRouteCard
                itinerary={overnight}
                date="2026-09-06"
                autoPrice={{ total: 38, leg1: 16, leg2: 22, exact: true, farePoints: [] }}
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
        const onObserveFare = vi.fn((origin: string, destination: string, on: string, price: number) => {
            observed[`${origin}-${destination}-${on}`] = { price, savedAt: new Date().toISOString() };
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

        expect(onObserveFare).toHaveBeenCalledWith('MAD', 'AGP', '2026-09-06', 148);

        rerender(
            <HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={observed} onObserveFare={onObserveFare} />,
        );

        // €26.50 live + €148 entered = €174.50, shown as an approximation with
        // both sources named.
        expect(screen.getByText('≈ €175')).toBeInTheDocument();
        expect(screen.getByText(/€27 live \+ €148 you saw/)).toBeInTheDocument();
        expect(screen.getByTitle(/a price you entered yourself/)).toBeInTheDocument();
    });

    it('does not offer fare entry before a price has been sought', () => {
        render(<HackerRouteCard itinerary={mixed} date="2026-09-06" observedFares={{}} onObserveFare={vi.fn()} />);

        expect(screen.queryByRole('button', { name: /Saw a price/ })).not.toBeInTheDocument();
    });

    it('shows how long each flight is, separately from the journey total', () => {
        render(<HackerRouteCard itinerary={overnight} date="2026-09-06" />);

        // SNN 19:00 → STN 20:30 is 1h30 in the air; STN 06:35 → AGP 10:30 is
        // 2h55. The banner's 14h30 is the whole journey including the layover,
        // which is a different and much larger number.
        expect(within(legRow('Leg 1')).getByText('1h30')).toBeInTheDocument();
        expect(within(legRow('Leg 2')).getByText('2h55')).toBeInTheDocument();
        expect(screen.getByText(/total journey/)).toHaveTextContent('14h30');
    });

    it('keeps the Kiwi link on a leg through an airport nobody has curated', () => {
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

        const leg1Kiwi = within(legRow('Leg 1')).getByRole('link', { name: /Kiwi/ });
        expect(leg1Kiwi).toHaveAttribute('href', expect.stringContaining('/dublin-ireland/bilbao-spain/'));

        const leg2Kiwi = within(legRow('Leg 2')).getByRole('link', { name: /Kiwi/ });
        expect(leg2Kiwi).toHaveAttribute('href', expect.stringContaining('/bilbao-spain/malaga-spain/'));
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
});
