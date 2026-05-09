import { render, screen } from '@testing-library/react';
import FlightDestinationCard from './FlightDestinationCard';

describe('FlightDestinationCard', () => {
    it('renders airport thumbnails, fare chips, and the real destination airport copy', () => {
        render(
            <FlightDestinationCard
                destination={{
                    type: 'flight-destination',
                    origin: 'DUB',
                    destination: 'BVA',
                    departureDate: '2026-06-01',
                    returnDate: '2026-06-05',
                    price: {
                        total: '69.00',
                        currency: 'EUR',
                    },
                    links: {
                        flightDates: 'https://example.com/flights/paris-beauvais/dates',
                        flightOffers: 'https://example.com/flights/paris-beauvais/offers',
                    },
                }}
            />,
        );

        expect(screen.getByText(/paris beauvais, france/i)).toBeInTheDocument();
        expect(screen.getAllByText(/paris beauvais airport/i).length).toBeGreaterThan(0);
        expect(screen.getByAltText(/paris beauvais airport view/i)).toBeInTheDocument();
        expect(screen.getByText(/anti-cauchemar/i)).toBeInTheDocument();
        expect(screen.getByText(/from eur 69.00/i)).toBeInTheDocument();
        expect(screen.getByText(/offer-ready/i)).toBeInTheDocument();
    });
});

