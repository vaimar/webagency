import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import About from './About';
import './App.css';
import { CacheProvider } from './CacheContext';
import IslandHop from './IslandHop';
import Main from './Main';
import Profile from './Profile';
import RideFinderPage from './RideFinderPage';
import { ProfileProvider, useProfile } from './ProfileContext';
import { TripExplorationProvider } from './TripExplorationContext';
import TripExploreWrapper from './components/TripExploreWrapper';
import { isRideFinderEnabled } from './services/featureFlags';

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
                                {/* Deterministic intent search. Off by default —
                                    REACT_APP_RIDE_FINDER=1, or ?rideFinder=1 on a built
                                    deploy. Falls back to /explore when disabled, so a
                                    shared link never dead-ends. */}
                                <Route
                                    path="ride-finder"
                                    element={isRideFinderEnabled() ? <RideFinderPage /> : <Navigate to="/explore" replace />}
                                />
                                <Route path="island-hop" element={<IslandHop />} />
                                <Route path="assistant" element={<Navigate to="/explore" replace />} />
                                <Route path="profile" element={<Profile />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </TripExplorationProvider>
            </ProfileProvider>
        </CacheProvider>
    );
};

export default App;
