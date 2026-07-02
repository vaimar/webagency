import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CacheProvider } from '../CacheContext';
import { TripExplorationResponse } from '../types/tripExploration';
import TripExploreWrapper from './TripExploreWrapper';

const exploreResponse: TripExplorationResponse = {
    originAirport: 'SNN',
    destination: 'EXO 84',
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

// Simulates the app's tab routing: switching routes unmounts the explore tab.
const Harness: React.FC<{ exploreTabOpen: boolean }> = ({ exploreTabOpen }) => (
    <CacheProvider>
        {exploreTabOpen ? <TripExploreWrapper /> : <p>another tab</p>}
    </CacheProvider>
);

describe('TripExploreWrapper cross-tab persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => exploreResponse,
        }) as jest.Mock;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('keeps the full exploration result after the tab unmounts and remounts', async () => {
        const { rerender } = render(<Harness exploreTabOpen />);

        await userEvent.click(screen.getByRole('button', { name: /generate my plan de ouf/i }));
        expect(await screen.findByText('Hôtel La Lavande')).toBeInTheDocument();

        // Leave the tab (unmounts the wrapper), then come back.
        rerender(<Harness exploreTabOpen={false} />);
        expect(screen.queryByText('Hôtel La Lavande')).not.toBeInTheDocument();
        rerender(<Harness exploreTabOpen />);

        // The dashboard is restored from the app-wide cache, no refetch needed.
        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.getByText('0.1 km')).toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('posts only the fields the backend TripExploreRequest actually reads', async () => {
        render(<Harness exploreTabOpen />);

        await userEvent.click(screen.getByRole('button', { name: /generate my plan de ouf/i }));
        await screen.findByText('Hôtel La Lavande');

        const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(requestInit.body);

        expect(body).toEqual({
            origin: 'SNN',
            destination: 'EXO 84',
            activity: 'wakeboard',
            travelDate: '2026-07-10',
            firstMileAccess: { mode: 'rental_car', source: 'explore-ui' },
            activityRadiusMeters: 5000,
            hotelRadiusMeters: 10000,
            providers: ['serpapi'],
        });
    });
});
