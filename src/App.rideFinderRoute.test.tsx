// Route guard for the Ride Finder flag. Kept separate from App.test.js so the
// pre-existing landing-page test is untouched.

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CacheProvider } from './CacheContext';
import { ProfileProvider } from './ProfileContext';
import RideFinderPage from './RideFinderPage';
import { isRideFinderEnabled } from './services/featureFlags';

/** Mirrors the guarded route in App.tsx. */
const GuardedRoutes: React.FC = () => (
    <Routes>
        <Route path="/explore" element={<div>Door-to-trip explore</div>} />
        <Route
            path="/ride-finder"
            element={isRideFinderEnabled() ? <RideFinderPage /> : <Navigate to="/explore" replace />}
        />
    </Routes>
);

const renderAt = (path: string) => render(
    <CacheProvider>
        <ProfileProvider>
            <MemoryRouter initialEntries={[path]}>
                <GuardedRoutes />
            </MemoryRouter>
        </ProfileProvider>
    </CacheProvider>,
);

describe('/ride-finder route guard', () => {
    const original = process.env.REACT_APP_RIDE_FINDER;

    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false, status: 401,
            headers: { get: () => 'application/json' },
            json: async () => ({}), text: async () => '',
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        process.env.REACT_APP_RIDE_FINDER = original;
        jest.resetAllMocks();
    });

    it('redirects to /explore when the flag is off, so a shared link never dead-ends', async () => {
        process.env.REACT_APP_RIDE_FINDER = '0';
        renderAt('/ride-finder');

        await waitFor(() => expect(screen.getByText(/door-to-trip explore/i)).toBeInTheDocument());
        expect(screen.queryByText(/ride finder · preview/i)).not.toBeInTheDocument();
    });

    it('renders the page when the flag is on', async () => {
        process.env.REACT_APP_RIDE_FINDER = '1';
        renderAt('/ride-finder');

        await waitFor(() => expect(screen.getByText(/ride finder · preview/i)).toBeInTheDocument());
        expect(screen.getByPlaceholderText(/where do you want to ride/i)).toBeInTheDocument();
    });
});
