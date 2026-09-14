import React, { lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import About from './About';
import './App.css';
import { CacheProvider } from './CacheContext';
import Main from './Main';
import { ProfileProvider, useProfile } from './ProfileContext';
import { TripExplorationProvider } from './TripExplorationContext';
import ErrorBoundary from './components/ErrorBoundary';

// Only the shell and the landing page are eager — everything a first visit
// paints. The rest is split per route.
//
// The reason is maplibre-gl: it is 44 MB unpacked, it is imported by the spot,
// explore, ski and resort pages, and in a single bundle every visitor
// downloaded all of it before seeing the home page — including on
// /hack-flights, which has no map at all. Splitting here keeps the two pages in
// primary navigation off that bill.
const HackFlightsPage = lazy(() => import('./HackFlightsPage'));
const IslandHop = lazy(() => import('./IslandHop'));
const Profile = lazy(() => import('./Profile'));
const SpotDetailPage = lazy(() => import('./SpotDetailPage'));
const SpotFinderPage = lazy(() => import('./SpotFinderPage'));
const StayGuidePage = lazy(() => import('./StayGuidePage'));
const TripLedgerPage = lazy(() => import('./TripLedgerPage'));
const SkiResortMapPage = lazy(() => import('./SkiResortMapPage'));
const SkiWindowsPage = lazy(() => import('./SkiWindowsPage'));
const ResortHubPage = lazy(() => import('./ResortHubPage'));
const TripExploreWrapper = lazy(() => import('./components/TripExploreWrapper'));
const LegalPage = lazy(() => import('./legal/LegalPage'));

// The Suspense boundary lives in Main.tsx, wrapped around the Outlet, so the
// header, navigation and footer stay on screen while a route chunk loads.

const SessionRedirector: React.FC = () => {
    const { pendingLoginRedirect, consumePendingLoginRedirect } = useProfile();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!pendingLoginRedirect) return;

        if (location.pathname !== '/profile') {
            navigate('/profile', { replace: true });
        }

        consumePendingLoginRedirect();
    }, [consumePendingLoginRedirect, location.pathname, navigate, pendingLoginRedirect]);

    return null;
};

const App: React.FC = () => {
    return (
        // Outermost boundary: catches a crash in the providers themselves, where
        // the router — and therefore the in-shell boundary — does not yet exist.
        <ErrorBoundary scope="app">
            <CacheProvider>
                <ProfileProvider>
                <TripExplorationProvider>
                    <BrowserRouter>
                        <SessionRedirector />
                        <Routes>
                            <Route element={<Main />}>
                                <Route index element={<About />} />
                                {/* Unified into /explore — the single door-to-door trip flow. */}
                                <Route path="discover" element={<Navigate to="/explore" replace />} />
                                <Route path="planner" element={<Navigate to="/explore" replace />} />
                                <Route path="explore" element={<TripExploreWrapper />} />
                                <Route path="spots" element={<SpotFinderPage />} />
                                <Route path="spots/:slug" element={<SpotDetailPage />} />
                            {/* Flight-routing only — bypasses the explore dashboard. */}
                            <Route path="hack-flights" element={<HackFlightsPage />} />
                                {/* Price-free accommodation directory for a place. */}
                                <Route path="stay-guide" element={<StayGuidePage />} />
                                {/* Multi-stop door-to-door trip cost ledger. */}
                                <Route path="trip-ledger" element={<TripLedgerPage />} />
                                <Route path="ski-map" element={<SkiResortMapPage />} />
                                <Route path="ski-windows" element={<SkiWindowsPage />} />
                                <Route path="resorts/:slug" element={<ResortHubPage />} />
                                <Route path="island-hop" element={<IslandHop />} />
                                <Route path="assistant" element={<Navigate to="/explore" replace />} />
                                <Route path="profile" element={<Profile />} />
                                <Route path="privacy" element={<LegalPage document="privacy" />} />
                                <Route path="terms" element={<LegalPage document="terms" />} />
                                <Route path="cookies" element={<LegalPage document="cookies" />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </TripExplorationProvider>
                </ProfileProvider>
            </CacheProvider>
        </ErrorBoundary>
    );
};

export default App;
