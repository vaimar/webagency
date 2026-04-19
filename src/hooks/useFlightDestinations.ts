import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCache } from '../CacheContext';
import { fetchFlightDestinations, FlightSearchParams, FlightSearchResult } from '../services/flightService';

interface UseFlightDestinationsResult extends FlightSearchResult {
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const emptyResult: FlightSearchResult = {
    destinations: [],
    source: 'curated',
    fetchedAt: '',
};

export const useFlightDestinations = (params: FlightSearchParams): UseFlightDestinationsResult => {
    const { getCachedResult, updateCache } = useCache();
    const [result, setResult] = useState<FlightSearchResult>(emptyResult);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const normalizedParams = useMemo<FlightSearchParams>(
        () => ({
            origin: params.origin.trim().toUpperCase() || 'PAR',
            maxPrice: params.maxPrice,
        }),
        [params.maxPrice, params.origin],
    );

    const cacheKey = useMemo(
        () => `flight-destinations:${normalizedParams.origin}:${normalizedParams.maxPrice}`,
        [normalizedParams.maxPrice, normalizedParams.origin],
    );

    const load = useCallback(
        async (skipCache = false) => {
            setIsLoading(true);

            const cached = !skipCache ? getCachedResult<FlightSearchResult>(cacheKey) : undefined;
            if (cached) {
                setResult(cached);
                setIsLoading(false);
                return;
            }

            const nextResult = await fetchFlightDestinations(normalizedParams);
            updateCache(cacheKey, nextResult);
            setResult(nextResult);
            setIsLoading(false);
        },
        [cacheKey, getCachedResult, normalizedParams, updateCache],
    );

    useEffect(() => {
        void load();
    }, [load]);

    return {
        ...result,
        isLoading,
        refresh: async () => {
            await load(true);
        },
    };
};
