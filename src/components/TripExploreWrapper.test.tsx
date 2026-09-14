import type { Mock } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CacheProvider } from '../CacheContext';
import { TripExplorationProvider } from '../TripExplorationContext';
import { TripExplorationResponse } from '../types/tripExploration';
import TripExploreWrapper from './TripExploreWrapper';

const exploreResponse: TripExplorationResponse = {
    originAirport: 'SNN',
    destination: 'Ibiza',
    travelDate: '2026-07-10',
    orchestrationStatus: 'OK',
    bestUnifiedFlight: {
        airline: 'Ryanair',
        flightNumber: 'FR 342',
        ticketPrice: 39.99,
        antiCauchemar: { ticketPrice: 39.99, currency: 'EUR' },
    },
    hiddenGemHotels: [
        {
            hotel: { name: 'Hôtel La Lavande', pricePerNight: 84, priceCurrency: 'EUR' },
            distanceToActivityKm: 0.1,
        },
    ],
};

// Mirrors the backend's structured error body for unresolvable destinations.
const destinationErrorBody = {
    status: 400,
    code: 'DESTINATION_AIRPORT_REQUIRED',
    message: 'Destination airport could not be resolved automatically. Provide arrivalAirport explicitly.',
    details: { supportedExamples: ['Nice/NCE', 'Dublin/DUB', 'EXO 84/MRS'] },
};

// Simulates the app's tab routing: switching routes unmounts the explore tab
// while TripExplorationProvider (mounted app-wide) stays alive.
const Harness: React.FC<{ exploreTabOpen: boolean }> = ({ exploreTabOpen }) => (
    <CacheProvider>
        <TripExplorationProvider>
            {exploreTabOpen ? <TripExploreWrapper /> : <p>another tab</p>}
        </TripExplorationProvider>
    </CacheProvider>
);

describe('TripExploreWrapper', () => {
    beforeEach(() => {
        window.localStorage.clear();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => exploreResponse,
        }) as Mock;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the full exploration result after the tab unmounts and remounts', async () => {
        const { rerender } = render(<Harness exploreTabOpen />);

        await userEvent.click(screen.getByRole('button', { name: /price this trip/i }));
        expect(await screen.findByText('Hôtel La Lavande')).toBeInTheDocument();

        // Leave the tab (unmounts the wrapper), then come back.
        rerender(<Harness exploreTabOpen={false} />);
        expect(screen.queryByText('Hôtel La Lavande')).not.toBeInTheDocument();
        rerender(<Harness exploreTabOpen />);

        // The dashboard is restored from the app-wide context, no refetch needed.
        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.getByText('0.1 km')).toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('posts backend-curated destinations like Ibiza without an arrivalAirport hint', async () => {
        render(<Harness exploreTabOpen />);

        await userEvent.click(screen.getByRole('button', { name: /price this trip/i }));
        await screen.findByText('Hôtel La Lavande');

        const [url, requestInit] = (global.fetch as Mock).mock.calls[0];
        expect(url).toBe('/api/trips/explore');

        // Ibiza lives in the backend's city-destinations.json catalog now —
        // its own resolver handles it (CURATED_CITY_MAPPING), no hint needed.
        const body = JSON.parse(requestInit.body);
        expect(body).toEqual({
            origin: 'SNN',
            destination: 'Ibiza',
            activity: 'wakeboard',
            travelDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            firstMileAccess: { mode: 'rental_car', source: 'explore-ui' },
            activityRadiusMeters: 5000,
            hotelRadiusMeters: 10000,
            providers: ['serpapi'],
        });
    });

    it('sends the arrivalAirport hint for destinations the backend cannot resolve itself', async () => {
        render(<Harness exploreTabOpen />);

        const destinationInput = screen.getByPlaceholderText(/ibiza, nice, exo 13/i);
        await userEvent.clear(destinationInput);
        await userEvent.type(destinationInput, 'Geneva');
        await userEvent.click(screen.getByRole('button', { name: /price this trip/i }));
        await screen.findByText('Hôtel La Lavande');

        const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
        expect(body.destination).toBe('Geneva');
        expect(body.arrivalAirport).toBe('GVA');
    });

    it('surfaces the backend error body with clickable destination suggestions', async () => {
        (global.fetch as Mock).mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => destinationErrorBody,
        });

        render(<Harness exploreTabOpen />);

        const destinationInput = screen.getByPlaceholderText(/ibiza, nice, exo 13/i);
        await userEvent.clear(destinationInput);
        await userEvent.type(destinationInput, 'Atlantis');
        await userEvent.click(screen.getByRole('button', { name: /price this trip/i }));

        expect(await screen.findByText(/DESTINATION_AIRPORT_REQUIRED/)).toBeInTheDocument();
        expect(screen.getByText(/could not be resolved automatically/)).toBeInTheDocument();

        // Clicking a suggestion fills the destination for an easy retry.
        await userEvent.click(screen.getByRole('button', { name: 'Nice' }));
        expect(destinationInput).toHaveValue('Nice');
    });
});
