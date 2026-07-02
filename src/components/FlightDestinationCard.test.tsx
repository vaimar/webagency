import React from 'react';
import { render, screen } from '@testing-library/react';
import FlightDestinationCard from './FlightDestinationCard';

describe('FlightDestinationCard', () => {
    it('renders airport thumbnails, fare chips, and the real destination airport copy', () => {
        const props: Record<string, unknown> = {
            onSelect: jest.fn(),
            isSelected: true,
            showsDateMatch: true,
            shouldAnimate: true,
            destination: {
                type: 'flight-destination',
                origin: 'DUB',
                destination: 'BVA',
                departureDate: '2026-06-01',
                returnDate: '2026-06-05',
                price: {
                    total: '69.00',
                    currency: 'EUR',
                },
                antiCauchemar: {
                    realWorldEntryPrice: 112,
                    airportShuttleEstimate: 28,
                    cabinBagEstimate: 15,
                    hiddenCostPenalty: 28,
                    theCatch: 'This is the Ryanair Paris truth: Beauvais is outside the city and late transfers can erase the cheap headline fare.',
                    logisticVerdict: 'A sharp entry price only stays honest if you budget the Beauvais coach or a late taxi.',
                    currency: 'EUR',
                },
                links: {
                    flightDates: 'https://example.com/flights/paris-beauvais/dates',
                    flightOffers: 'https://example.com/flights/paris-beauvais/offers',
                },
            },
        };

        render(
            React.createElement(FlightDestinationCard as React.ComponentType<any>, props),
        );

        expect(screen.getByText(/paris beauvais, france/i)).toBeInTheDocument();
        expect(screen.getAllByText(/paris beauvais airport/i).length).toBeGreaterThan(0);
        expect(screen.getByAltText(/paris beauvais airport view/i)).toBeInTheDocument();
        expect(screen.getAllByText(/anti-cauchemar/i).length).toBeGreaterThan(0);
        expect(screen.getByText((content, element) => content === '€112' && element?.classList.contains('flight-card__price') === true)).toBeInTheDocument();
        expect(screen.getByText((content, element) => content === '€69' && element?.classList.contains('flight-card__marketing-price') === true)).toBeInTheDocument();
        expect(screen.getAllByText(/estimated one-way entry price/i).length).toBeGreaterThan(0);
        // Transfer and cabin bag appear in TruthCard breakdown (content spread across child nodes)
        expect(screen.getAllByText((_content, node) => (node?.textContent ?? '').toLowerCase().includes('airport transfer') || (node?.textContent ?? '').toLowerCase().includes('transfer'))[0]).toBeInTheDocument();
        expect(screen.getAllByText((_content, node) => (node?.textContent ?? '').toLowerCase().includes('cabin bag'))[0]).toBeInTheDocument();
        expect(screen.getByText(/one-way fare snapshot/i)).toBeInTheDocument();
        expect(screen.getByText(/this fare matches your selected date/i)).toBeInTheDocument();
        expect(screen.getByText(/offer-ready/i)).toBeInTheDocument();
        expect(screen.getByText(/this is the ryanair paris truth/i)).toBeInTheDocument();
        expect(screen.getByText(/a sharp entry price only stays honest if you budget the beauvais coach or a late taxi/i)).toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button')).toHaveClass('flight-card--animate-select');
    });
});

