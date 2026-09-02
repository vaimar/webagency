import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IslandHop from './IslandHop';

const templates = [
    { id: 'santorini-paros-athens', name: 'Santorini · Paros · Athens', description: 'Open-jaw', stops: [
        { island: 'Santorini', nights: 3 }, { island: 'Paros', nights: 3 }, { island: 'Athens', nights: 1 },
    ] },
];

const tour = {
    origin: 'SNN',
    startDate: '2026-07-10',
    totalNights: 7,
    flightsEur: 1037,
    ferriesEur: 95,
    staysEur: 825,
    totalEur: 1957,
    currency: 'EUR',
    flyIn: { from: 'SNN', to: 'JTR', airline: 'Aer Lingus', priceEur: 752 },
    flyOut: { from: 'ATH', to: 'SNN', airline: 'Lufthansa', priceEur: 285 },
    ferries: [
        { fromIsland: 'Santorini', toIsland: 'Paros', durationMinutes: 140, priceEur: 50 },
        { fromIsland: 'Paros', toIsland: 'Athens', durationMinutes: 210, priceEur: 45 },
    ],
    stops: [
        {
            island: 'Santorini', airport: 'JTR', nights: 3, nightlyEstimateEur: 165, stayEur: 495, stayPriceLive: true,
            stays: [
                { name: 'Hotel Santorini', pricePerNight: 165, priceCurrency: 'EUR', rating: 4.6, bookingLink: 'https://book.example/hotel-santorini' },
                { name: 'Fira Rooms', pricePerNight: null, rating: 4.8, bookingLink: null },
            ],
        },
        { island: 'Paros', airport: 'PAS', nights: 3, nightlyEstimateEur: 95, stayEur: 285, stays: [] },
        { island: 'Athens', airport: 'ATH', nights: 1, nightlyEstimateEur: 90, stayEur: 90, stays: [] },
    ],
    warnings: [],
};

describe('IslandHop page', () => {
    beforeEach(() => {
        global.fetch = vi.fn((url: string, _init?: RequestInit) => {
            if (String(url).endsWith('/templates')) {
                return Promise.resolve({ ok: true, json: async () => templates } as Response);
            }
            return Promise.resolve({ ok: true, json: async () => tour } as Response);
        }) as Mock;
    });

    afterEach(() => vi.restoreAllMocks());

    it('auto-plans the default itinerary and renders the costed open-jaw timeline', async () => {
        render(<IslandHop />);

        // Debounced auto-plan resolves the tour.
        expect(await screen.findByText('€1,957', {}, { timeout: 3000 })).toBeInTheDocument();
        expect(screen.getByText('Flights')).toBeInTheDocument();  // summary label (exact)
        expect(screen.getByText('€1,037')).toBeInTheDocument();   // flights
        expect(screen.getByText('€95')).toBeInTheDocument();      // ferries
        // Open-jaw: fly in via JTR, fly home from ATH.
        expect(screen.getByText(/Fly in · SNN → JTR · Aer Lingus/)).toBeInTheDocument();
        expect(screen.getByText(/Fly home · ATH → SNN · Lufthansa/)).toBeInTheDocument();
        expect(screen.getByText(/Ferry Santorini → Paros/)).toBeInTheDocument();

        // Real per-island hotels with a bookable link.
        expect(screen.getByText('Hotel Santorini')).toBeInTheDocument();
        expect(screen.getByText('€165/night · 4.6★')).toBeInTheDocument();
        const bookLink = screen.getAllByRole('link', { name: /Book ↗/ })[0];
        expect(bookLink).toHaveAttribute('href', 'https://book.example/hotel-santorini');
        // Accommodation search fallbacks for the island.
        expect(screen.getAllByRole('link', { name: 'Booking.com' })[0]).toBeInTheDocument();
    });

    it('posts an updated itinerary when the user adds an island', async () => {
        render(<IslandHop />);
        await screen.findByText('€1,957', {}, { timeout: 3000 });

        await userEvent.selectOptions(screen.getByRole('combobox'), 'Mykonos');

        await waitFor(() => {
            const postCalls = (global.fetch as Mock).mock.calls.filter(([u]) => String(u).endsWith('/island-hop'));
            const lastBody = JSON.parse(postCalls[postCalls.length - 1][1].body);
            expect(lastBody.stops.map((s: { island: string }) => s.island)).toContain('Mykonos');
        }, { timeout: 3000 });
    });
});
