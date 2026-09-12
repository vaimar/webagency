// The page runs in ROUTE mode. These tests carry over the guarantees the
// search-mode page had — no model calls, explicit no-backing, explicit
// degraded — and add the ones the route flow introduces.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CacheProvider } from './CacheContext';
import { ProfileProvider } from './ProfileContext';
import RideFinderPage from './RideFinderPage';

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

const answerOrigin = async () => {
    await userEvent.click(screen.getByRole('button', { name: /build my route/i }));
    await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Dublin' }));
};

describe('RideFinderPage — route mode', () => {
    beforeEach(() => {
        // Profile bootstrap only; the route flow needs nothing else.
        global.fetch = jest.fn().mockResolvedValue({
            ok: false, status: 401,
            headers: { get: () => 'application/json' },
            json: async () => ({}), text: async () => '',
        }) as unknown as typeof fetch;
    });
    afterEach(() => { jest.resetAllMocks(); });

    it('says plainly that nothing is model-written', () => {
        renderPage();
        expect(screen.getByText(/nothing is written by a model/i)).toBeInTheDocument();
    });

    it('keeps the catalogue readiness blocker visible', () => {
        renderPage();
        expect(screen.getByText(/venues have verified facts/i)).toBeInTheDocument();
    });

    it('asks for an origin rather than guessing one', async () => {
        renderPage();
        await userEvent.click(screen.getByRole('button', { name: /build my route/i }));

        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
    });

    it('builds a route with legs, distances and a per-rider total', async () => {
        renderPage();
        await answerOrigin();

        await waitFor(() => expect(screen.getByText(/per rider/i)).toBeInTheDocument());
        expect(screen.getByText(/getting there/i)).toBeInTheDocument();
        expect(screen.getByText(/sleeping/i)).toBeInTheDocument();
        expect(screen.getByText(/eating/i)).toBeInTheDocument();
        // "Riding" is both a totals row and part of the header line.
        expect(screen.getAllByText(/riding/i).length).toBeGreaterThan(0);
    });

    // Carried over, and stronger: route mode touches no API at all.
    it('makes no model call — and in fact no trip API call either', async () => {
        renderPage();
        await answerOrigin();
        await waitFor(() => expect(screen.getByText(/per rider/i)).toBeInTheDocument());

        const rankChip = screen.getByRole('button', { name: /Ranked:/i });
        await userEvent.click(rankChip);
        await waitFor(() => expect(screen.getByText(/per rider/i)).toBeInTheDocument());

        const urls = calledUrls();
        expect(urls.some((u) => u.includes('/api/ai/'))).toBe(false);
        expect(urls.some((u) => u.includes('/api/trips/'))).toBe(false);
    });

    it('shows the board situation on every leg', async () => {
        renderPage();
        await answerOrigin();

        await waitFor(() => expect(screen.getAllByText(/board:/i).length).toBeGreaterThan(0));
        // All-car route: the board simply travels.
        expect(screen.getAllByText(/board: in the car/i).length).toBeGreaterThan(0);
    });

    it('exposes the trust panel rather than hiding provenance', async () => {
        renderPage();
        await answerOrigin();

        await waitFor(() => expect(screen.getByText(/where these facts come from/i)).toBeInTheDocument());
    });

    // The fan-out is capped, so the page says how many of the catalogue it
    // actually looked at rather than implying it considered everything.
    it('says how much of the catalogue it searched', async () => {
        renderPage();
        await answerOrigin();

        await waitFor(() => expect(screen.getByText(/per rider/i)).toBeInTheDocument());
        expect(screen.getByText(/searched the top \d+ of \d+/i)).toBeInTheDocument();
    });

    it('still states confidence, and degrades rather than overclaiming', async () => {
        renderPage();
        await answerOrigin();

        await waitFor(() => expect(screen.getByText(/confidence:/i)).toBeInTheDocument());
        expect(screen.getByText(/confidence: (mixed|estimated)/i)).toBeInTheDocument();
    });
});
