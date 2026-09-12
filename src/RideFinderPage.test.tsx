import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CacheProvider } from './CacheContext';
import { ProfileProvider } from './ProfileContext';
import RideFinderPage from './RideFinderPage';
import { TripExplorationResponse } from './types/tripExploration';

const exploreResponse: TripExplorationResponse = {
    originAirport: 'DUB',
    resolvedArrivalAirport: 'IBZ',
    routeAvailable: true,
    orchestrationStatus: 'OK',
    unifiedFlights: [{
        airline: 'Ryanair',
        flightNumber: 'FR342',
        ticketPrice: 89,
        stops: 0,
        scheduledArrival: '2026-09-25T16:10:00',
        antiCauchemar: { ticketPrice: 89, auditedTotalCost: 312, currency: 'EUR' },
    }],
    primaryActivity: { name: 'Cable', distanceKm: 4.2 },
};

const jsonOk = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
});

/** Records every URL the page touches, so we can assert what it never calls. */
const calledUrls = (): string[] =>
    (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));

const renderPage = () => render(
    <CacheProvider>
        <ProfileProvider>
            <MemoryRouter>
                <RideFinderPage />
            </MemoryRouter>
        </ProfileProvider>
    </CacheProvider>,
);

describe('RideFinderPage', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockImplementation(async (url: string) => {
            if (String(url).includes('/api/trips/explore')) {
                return jsonOk(exploreResponse);
            }
            // Profile bootstrap — anonymous.
            return { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
        }) as unknown as typeof fetch;
    });

    afterEach(() => { jest.resetAllMocks(); });

    it('states plainly that nothing is model-written', () => {
        renderPage();
        expect(screen.getByText(/nothing is written by a model/i)).toBeInTheDocument();
    });

    // Requirement: the curated dataset stays the visible blocker, not a silent one.
    it('shows the catalogue readiness blocker instead of looking broken', () => {
        renderPage();

        expect(screen.getByText(/0 of 6 venues have verified facts/i)).toBeInTheDocument();
        expect(screen.getByText(/will return nothing until a curator/i)).toBeInTheDocument();
        expect(screen.getByText(/flights, prices and transfers are unaffected/i)).toBeInTheDocument();
    });

    it('asks for an origin rather than guessing one, since the profile has no home address', async () => {
        renderPage();

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
    });

    it('runs the fan-out from the resolved chip state and renders a backed option', async () => {
        renderPage();

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));
        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: 'Dublin' }));

        await waitFor(() => expect(screen.getByText(/confidence:/i)).toBeInTheDocument());
        expect(calledUrls().some((url) => url.includes('/api/trips/explore'))).toBe(true);
    });

    // The load-bearing guarantee for this route.
    it('never calls an AI endpoint — not on search, not on a follow-up, not on a chip edit', async () => {
        renderPage();

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));
        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());

        await userEvent.click(screen.getByRole('button', { name: 'Dublin' }));
        await waitFor(() => expect(screen.getByText(/confidence:/i)).toBeInTheDocument());

        // Correct a chip — the path that must never re-enter a model.
        const rankChip = screen.getByRole('button', { name: /Ranked:/i });
        await userEvent.click(rankChip);
        await waitFor(() => expect(screen.getByText(/confidence:/i)).toBeInTheDocument());

        const urls = calledUrls();
        expect(urls.some((url) => url.includes('/api/ai/'))).toBe(false);
        expect(urls.some((url) => url.includes('/api/trips/ai-guide'))).toBe(false);
        expect(urls.some((url) => url.includes('/api/trips/explore'))).toBe(true);
    });

    it('renders the no-backing state explicitly when nothing can be backed', async () => {
        (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
            if (String(url).includes('/api/trips/explore')) {
                return jsonOk({ routeAvailable: false });
            }
            return { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
        });

        renderPage();
        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));
        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: 'Dublin' }));

        await waitFor(() => expect(screen.getByText(/nothing we can back/i)).toBeInTheDocument());
    });

    it('renders the degraded state rather than showing prices as solid', async () => {
        (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
            if (String(url).includes('/api/trips/explore')) {
                return jsonOk({ ...exploreResponse, orchestrationStatus: 'DEGRADED' });
            }
            return { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
        });

        renderPage();
        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));
        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: 'Dublin' }));

        await waitFor(() => expect(screen.getByText(/backend was degraded/i)).toBeInTheDocument());
    });
});
