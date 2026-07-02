import React from 'react';
import { render, screen } from '@testing-library/react';
import FlightCard from './FlightCard';

describe('FlightCard', () => {
    it('shows an estimated entry price only when the extra cost has a concrete breakdown', () => {
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
                        airportShuttleEstimate: 19,
                        cabinBagEstimate: 24,
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
        expect(screen.getAllByText(/estimated one-way entry price/i).length).toBeGreaterThan(0);
        // Transfer label is in TruthCard legacy breakdown or flight-card price meta
        expect(screen.getAllByText((_content, node) => (node?.textContent ?? '').toLowerCase().includes('airport transfer') || (node?.textContent ?? '').toLowerCase().includes('transfer'))[0]).toBeInTheDocument();
        expect(screen.getAllByText((_content, node) => (node?.textContent ?? '').toLowerCase().includes('cabin bag'))[0]).toBeInTheDocument();
        expect(screen.getAllByText(/late arrival means the airport transfer is usually a taxi after midnight\./i).length).toBeGreaterThan(0);
        expect(screen.getByText(/cheap on paper, sharper in the real world\./i)).toBeInTheDocument();
        expect(screen.getByText(/live route/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /ryanair/i })).toBeInTheDocument();
    });

    it('keeps the base fare primary when the extra cost is only a vague warning', () => {
        render(
            <FlightCard
                flight={{
                    origin: 'DUB',
                    destination: 'IBZ',
                    departureDate: '2026-07-03T08:10:00Z',
                    arrivalDate: '2026-07-03T11:25:00Z',
                    price: 120,
                    currency: 'EUR',
                    antiCauchemar: {
                        realWorldEntryPrice: 156,
                        hiddenCostPenalty: 36,
                        theCatch: 'Airport transfer costs vary a lot once you land.',
                        logisticVerdict: 'There may be extra friction, but the exact add-on is still unclear.',
                        currency: 'EUR',
                    },
                }}
                flightSource="live"
                flightDiagnosticsOk
            />,
        );

        expect(screen.getByText((content, element) => content === '€120' && element?.classList.contains('flight-card__price') === true)).toBeInTheDocument();
        expect(screen.queryByText((content, element) => content === '€156' && element?.classList.contains('flight-card__price') === true)).not.toBeInTheDocument();
        expect(screen.getByText(/one-way flight fare/i)).toBeInTheDocument();
        expect(screen.getAllByText(/possible extra costs/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/the app sees extra-friction risk on this route/i)).toBeInTheDocument();
    });
});

