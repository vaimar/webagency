import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TripGuide } from './TripGuide';
import { TripSuggestion } from '../services/api';

const buildTrip = (overrides: Partial<TripSuggestion> = {}): TripSuggestion => ({
    origin: 'DUB',
    destination: 'Lisbon',
    summary: 'Cold, honest city break.',
    cheapestFlight: {
        origin: 'DUB',
        destination: 'LIS',
        departureDate: '2026-06-01T07:10:00Z',
        price: 89,
        currency: 'EUR',
        antiCauchemar: {
            realWorldEntryPrice: 119,
            hiddenCostPenalty: 18,
            currency: 'EUR',
        },
    },
    restaurants: Array.from({ length: 7 }, (_, index) => ({
        name: `Restaurant ${index + 1}`,
        cuisine: 'Local',
        priceRange: '€€',
        mustTry: 'House plate',
        tip: 'Profile matched',
    })),
    accommodation: Array.from({ length: 8 }, (_, index) => ({
        type: 'Mid-range',
        area: `Area ${index + 1}`,
        pricePerNight: `€${110 + index}`,
        tip: 'Practical base',
    })),
    ...overrides,
});

describe('TripGuide', () => {
    it('shows visible counts in restaurant and stay tab labels', () => {
        render(<TripGuide trip={buildTrip()} days={5} preferredTransport="public_transport" />);

        expect(screen.getByRole('button', { name: /restaurants \(7\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /where to stay \(8\)/i })).toBeInTheDocument();
    });

    it('shows a soft backend-limit warning when fewer than 10 restaurants or stays are returned', async () => {
        render(<TripGuide trip={buildTrip()} days={5} preferredTransport="public_transport" />);

        await userEvent.click(screen.getByRole('button', { name: /restaurants \(7\)/i }));
        expect(screen.getByText((content) => content.includes('Backend returned') && content.includes('restaurant recommendations'))).toBeInTheDocument();
        expect(screen.getByText(/the ui is not truncating this list/i)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /where to stay \(8\)/i }));
        expect(screen.getByText((content) => content.includes('Backend returned') && content.includes('stay recommendations'))).toBeInTheDocument();
    });

    it('does not show the backend-limit warning once 10 or more recommendations exist', async () => {
        render(<TripGuide trip={buildTrip({
            restaurants: Array.from({ length: 10 }, (_, index) => ({
                name: `Restaurant ${index + 1}`,
                cuisine: 'Local',
                priceRange: '€€',
                mustTry: 'House plate',
                tip: 'Profile matched',
            })),
            accommodation: Array.from({ length: 10 }, (_, index) => ({
                type: 'Mid-range',
                area: `Area ${index + 1}`,
                pricePerNight: `€${110 + index}`,
                tip: 'Practical base',
            })),
        })} days={5} preferredTransport="public_transport" />);

        await userEvent.click(screen.getByRole('button', { name: /restaurants \(10\)/i }));
        expect(screen.queryByText(/the ui is not truncating this list/i)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /where to stay \(10\)/i }));
        expect(screen.queryByText(/backend returned 10 stay recommendations/i)).not.toBeInTheDocument();
    });

    it('shows an honest package total and booking links for the trip components', () => {
        render(<TripGuide trip={buildTrip()} days={5} dailyBudget={100} preferredTransport="public_transport" />);

        expect(screen.getByText(/your estimated trip package/i)).toBeInTheDocument();
        expect(screen.getByText(/estimated total/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /ryanair/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /booking\.com/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /restaurants/i })).toBeInTheDocument();
    });
});

