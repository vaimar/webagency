import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CACHE_TTL, useCache } from './CacheContext';
import { getHotelsNearby } from './services/api';
import { DestinationHint } from './services/destinationDirectory';
import { trackedFetch } from './services/serviceStatus';
import { getOrchestrationStatus, isDegradedResponse } from './services/tripExploreSelectors';
import {
    HotelResult,
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

/** Structured mirror of the backend's error body
 *  ({code, message, details.supportedExamples}) — never a bare status code. */
export interface ExploreError {
    message: string;
    code?: string;
    /** e.g. ["Nice/NCE", "EXO 84/MRS", ...] straight from the backend. */
    suggestions: string[];
}

const DEFAULT_HOTEL_RADIUS_METERS = 10000;

interface TripExplorationContextType {
    status: ExploreFetchStatus;
    tripData: TripExplorationResponse | null;
    lastRequest: TripExploreRequestPayload | null;
    /** Direct /api/hotels/nearby results used when the backend has no city
     *  coordinates for the destination (non-curated, explicit arrivalAirport). */
    fallbackStays: HotelResult[];
    error: ExploreError | null;
    explore: (request: TripExploreRequestPayload, hint?: DestinationHint) => Promise<void>;
}

const TripExplorationContext = createContext<TripExplorationContextType | undefined>(undefined);

const parseErrorBody = async (response: Response): Promise<ExploreError> => {
    try {
        const body = await response.json();
        return {
            message: typeof body?.message === 'string' ? body.message : `Trip search failed with status ${response.status}`,
            code: typeof body?.code === 'string' ? body.code : undefined,
            suggestions: Array.isArray(body?.details?.supportedExamples)
                ? body.details.supportedExamples.filter((item: unknown): item is string => typeof item === 'string')
                : [],
        };
    } catch {
        return { message: `Trip search failed with status ${response.status}`, suggestions: [] };
    }
};

export const TripExplorationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { getCachedResult, updateCache } = useCache();

    const [stored] = useState<StoredTripExploration | undefined>(
        () => getCachedResult<StoredTripExploration>(TRIP_EXPLORE_CACHE_KEY),
    );
    const [tripData, setTripData] = useState<TripExplorationResponse | null>(stored?.response ?? null);
    const [lastRequest, setLastRequest] = useState<TripExploreRequestPayload | null>(stored?.request ?? null);
    const [fallbackStays, setFallbackStays] = useState<HotelResult[]>([]);
    const [status, setStatus] = useState<ExploreFetchStatus>(
        stored?.response ? (isDegradedResponse(stored.response) ? 'degraded' : 'success') : 'idle',
    );
    const [error, setError] = useState<ExploreError | null>(null);

    const explore = useCallback(async (request: TripExploreRequestPayload, hint?: DestinationHint) => {
        setStatus('fetching');
        setError(null);

        try {
            // Relative URL — CRA dev proxy and production reverse proxy both
            // route /api to the Spring backend; no host hardcoding.
            const response = await trackedFetch('/api/trips/explore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                setError(await parseErrorBody(response));
                setStatus('error');
                return;
            }

            const data = (await response.json()) as TripExplorationResponse;

            // Non-curated destination: the backend found flights but has no
            // city coordinates, so its hotel search was skipped. Fill the gap
            // with a direct nearby search using the directory's coordinates —
            // clearly separated from hiddenGemHotels, never merged into them.
            let directStays: HotelResult[] = [];
            if (
                getOrchestrationStatus(data) === 'CITY_COORDINATES_UNAVAILABLE'
                && hint?.cityLat != null
                && hint?.cityLon != null
            ) {
                try {
                    const { hotels } = await getHotelsNearby(
                        hint.cityLat,
                        hint.cityLon,
                        request.hotelRadiusMeters ?? DEFAULT_HOTEL_RADIUS_METERS,
                    );
                    directStays = hotels;
                } catch {
                    // Best-effort: the CITY_COORDINATES_UNAVAILABLE banner
                    // already tells the user the stays search is limited.
                }
            }

            setTripData(data);
            setLastRequest(request);
            setFallbackStays(directStays);
            setStatus(isDegradedResponse(data) ? 'degraded' : 'success');
            updateCache<StoredTripExploration>(
                TRIP_EXPLORE_CACHE_KEY,
                { request, response: data, storedAt: new Date().toISOString() },
                CACHE_TTL.TRIP_EXPLORATION,
            );
        } catch (requestError) {
            setError({
                message: requestError instanceof Error ? requestError.message : 'Unable to reach the trip engine.',
                suggestions: [],
            });
            setStatus('error');
        }
    }, [updateCache]);

    const value = useMemo(
        () => ({ status, tripData, lastRequest, fallbackStays, error, explore }),
        [status, tripData, lastRequest, fallbackStays, error, explore],
    );

    return <TripExplorationContext.Provider value={value}>{children}</TripExplorationContext.Provider>;
};

export const useTripExploration = () => {
    const context = useContext(TripExplorationContext);
    if (!context) throw new Error('useTripExploration must be used within a TripExplorationProvider');
    return context;
};
