import React from 'react';
import { render, screen } from '@testing-library/react';
import FlightCard from './FlightCard';

describe('FlightCard', () => {
    it('leads with the real-world entry price and keeps the marketing fare secondary', () => {
        render(
            <FlightCard
                flight={{
                    origin: 'DUB',
                    destination: 'BVA',
                    departureDate: '2026-06-01T07:10:00Z',
                    arrivalDate: '2026-06-01T09:35:00Z',
                    price: 99,
                    currency: 'EUR',
                    flightNumber: 'FR 24',
                    antiCauchemar: {
                        realWorldEntryPrice: 142,
                        hiddenCostPenalty: 19,
                        theCatch: 'Late arrival means the airport transfer is usually a taxi after midnight.',
                        logisticVerdict: 'Cheap on paper, sharper in the real world.',
                        currency: 'EUR',
                    },
                }}
                flightSource="live"
                flightDiagnosticsOk
            />,
        );

        expect(screen.getByText((content, element) => content === '€142' && element?.classList.contains('flight-card__price') === true)).toBeInTheDocument();
        expect(screen.getByText((content, element) => content === '€99' && element?.classList.contains('flight-card__marketing-price') === true)).toBeInTheDocument();
        expect(screen.getAllByText(/real-world entry price/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/late arrival means the airport transfer is usually a taxi after midnight\./i)).toBeInTheDocument();
        expect(screen.getByText(/cheap on paper, sharper in the real world\./i)).toBeInTheDocument();
        expect(screen.getByText(/live route/i)).toBeInTheDocument();
    });
});


