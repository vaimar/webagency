import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CACHE_TTL, useCache } from './CacheContext';
import { isDegradedResponse } from './services/tripExploreSelectors';
import {
    StoredTripExploration,
    TRIP_EXPLORE_CACHE_KEY,
    TripExplorationResponse,
    TripExploreRequestPayload,
} from './types/tripExploration';

// App-wide owner of the /api/trips/explore lifecycle. It keeps the complete,
// untruncated TripExplorationResponse (flightComparison, sameFlightComparisons,
// accommodationTradeoffs, ...) so every tab and modal reads the same payload,
// and persists it through CacheProvider so route changes and reloads don't
// lose it. `degraded` maps the backend's own non-OK orchestrationStatus.
export type ExploreFetchStatus = 'idle' | 'fetching' | 'success' | 'degraded' | 'error';

interface TripExplorationContextType {
    status: ExploreFetchStatus;
    tripData: TripExplorationResponse | null;
    lastRequest: TripExploreRequestPayload | null;
    error: string;
    explore: (request: TripExploreRequestPayload) => Promise<void>;
}

const TripExplorationContext = createContext<TripExplorationContextType | undefined>(undefined);

export const TripExplorationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { getCachedResult, updateCache } = useCache();

    const [stored] = useState<StoredTripExploration | undefined>(
        () => getCachedResult<StoredTripExploration>(TRIP_EXPLORE_CACHE_KEY),
    );
    const [tripData, setTripData] = useState<TripExplorationResponse | null>(stored?.response ?? null);
    const [lastRequest, setLastRequest] = useState<TripExploreRequestPayload | null>(stored?.request ?? null);
    const [status, setStatus] = useState<ExploreFetchStatus>(
        stored?.response ? (isDegradedResponse(stored.response) ? 'degraded' : 'success') : 'idle',
    );
    const [error, setError] = useState('');

    const explore = useCallback(async (request: TripExploreRequestPayload) => {
        setStatus('fetching');
        setError('');

        try {
            // Relative URL — CRA dev proxy and production reverse proxy both
            // route /api to the Spring backend; no host hardcoding.
            const response = await fetch('/api/trips/explore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                setError(`Trip search failed with status ${response.status}`);
                setStatus('error');
                return;
            }

            const data = (await response.json()) as TripExplorationResponse;
            setTripData(data);
            setLastRequest(request);
            setStatus(isDegradedResponse(data) ? 'degraded' : 'success');
            updateCache<StoredTripExploration>(
                TRIP_EXPLORE_CACHE_KEY,
                { request, response: data, storedAt: new Date().toISOString() },
                CACHE_TTL.TRIP_EXPLORATION,
            );
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Unable to reach the trip engine.');
            setStatus('error');
        }
    }, [updateCache]);

    const value = useMemo(
        () => ({ status, tripData, lastRequest, error, explore }),
        [status, tripData, lastRequest, error, explore],
    );

    return <TripExplorationContext.Provider value={value}>{children}</TripExplorationContext.Provider>;
};

export const useTripExploration = () => {
    const context = useContext(TripExplorationContext);
    if (!context) throw new Error('useTripExploration must be used within a TripExplorationProvider');
    return context;
};
