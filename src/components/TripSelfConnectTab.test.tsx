import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripSelfConnectTab from './TripSelfConnectTab';
import { SelfConnectResult } from '../services/selfConnect';

const sameDayResult: SelfConnectResult = {
    origin: 'SNN',
    destination: 'IBZ',
    directPriceEur: 532,
    searchedHubs: ['STN', 'LGW', 'BCN'],
    options: [
        {
            hub: 'STN',
            hubName: 'London Stansted',
            connectionType: 'SAME_DAY',
            layoverMinutes: 380,
            totalEur: 162,
            savingsVsDirectEur: 370,
            leg1: { airline: 'Ryanair', departureAirport: 'SNN', arrivalAirport: 'STN', priceEur: 83, scheduledDeparture: '2026-07-10T06:20:00', scheduledArrival: '2026-07-10T07:40:00' },
            leg2: { airline: 'Ryanair', departureAirport: 'STN', arrivalAirport: 'IBZ', priceEur: 79, scheduledDeparture: '2026-07-10T14:00:00' },
        },
    ],
};

describe('TripSelfConnectTab', () => {
    it('shows a loading state during the multi-search', () => {
        render(<TripSelfConnectTab status="loading" result={null} onRetry={() => {}} />);
        expect(screen.getByText(/Searching hidden 2-leg routes/i)).toBeInTheDocument();
    });

    it('renders a same-day self-connect with legs, total, savings and the risk warning', () => {
        render(<TripSelfConnectTab status="done" result={sameDayResult} onRetry={() => {}} />);

        expect(screen.getByText('via London Stansted')).toBeInTheDocument();
        expect(screen.getByText(/Same-day · 6h20 layover/)).toBeInTheDocument();
        expect(screen.getByText('€162')).toBeInTheDocument();
        expect(screen.getByText('save €370')).toBeInTheDocument();
        expect(screen.getByText('SNN → STN · Ryanair')).toBeInTheDocument(); // leg 1
        expect(screen.getByText('STN → IBZ · Ryanair')).toBeInTheDocument(); // leg 2
        expect(screen.getByText(/Direct fare for comparison: /)).toBeInTheDocument();
        expect(screen.getByText(/Self-transfer risk:/)).toBeInTheDocument();
    });

    it('renders an overnight self-connect with the hub hotel line', () => {
        render(
            <TripSelfConnectTab
                status="done"
                result={{
                    directPriceEur: 532,
                    options: [{
                        hub: 'STN', hubName: 'London Stansted', connectionType: 'OVERNIGHT',
                        totalEur: 237, savingsVsDirectEur: 295, overnightHotelEur: 75,
                        leg1: { departureAirport: 'SNN', arrivalAirport: 'STN', priceEur: 83, airline: 'Ryanair' },
                        leg2: { departureAirport: 'STN', arrivalAirport: 'IBZ', priceEur: 79, airline: 'Ryanair' },
                    }],
                }}
                onRetry={() => {}}
            />,
        );

        expect(screen.getByText('Overnight')).toBeInTheDocument();
        expect(screen.getByText(/Overnight at STN/)).toBeInTheDocument();
        expect(screen.getByText('€75')).toBeInTheDocument();
    });

    it('states plainly when nothing beats the direct fare', () => {
        render(<TripSelfConnectTab status="done" result={{ directPriceEur: 120, options: [] }} onRetry={() => {}} />);
        expect(screen.getByText(/No self-transfer route beat the direct fare/i)).toBeInTheDocument();
    });

    it('offers a retry on error', async () => {
        const onRetry = vi.fn();
        render(<TripSelfConnectTab status="error" result={null} onRetry={onRetry} />);
        expect(screen.getByText('Self-transfer search unavailable')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalled();
    });
});
