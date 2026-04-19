import { useCallback, useState } from 'react';
import { BackendFlight, fetchTripSuggestion, searchFlights, TripSuggestion } from '../services/api';
import { MOCK_FLIGHT_DESTINATIONS } from '../data/mockDestinations';

interface RouteSearchState {
    origin: string;
    destination: string;
}

interface UseRouteSearchResult {
    state: RouteSearchState;
    flights: BackendFlight[];
    tripSuggestion: TripSuggestion | null;
    isSearchingFlights: boolean;
    isLoadingSuggestion: boolean;
    flightError: string | null;
    suggestionError: string | null;
    flightSource: 'live' | 'curated' | null;
    setOrigin: (value: string) => void;
    setDestination: (value: string) => void;
    searchRoute: () => Promise<void>;
    clearResults: () => void;
}

const mapMockToFlight = (item: typeof MOCK_FLIGHT_DESTINATIONS[number]): BackendFlight => ({
    origin: item.origin,
    destination: item.destination,
    departureDate: item.departureDate,
    returnDate: item.returnDate,
    price: item.price.total,
    currency: item.price.currency,
});

export const useRouteSearch = (): UseRouteSearchResult => {
    const [state, setState] = useState<RouteSearchState>({ origin: 'DUB', destination: 'STN' });
    const [flights, setFlights] = useState<BackendFlight[]>([]);
    const [tripSuggestion, setTripSuggestion] = useState<TripSuggestion | null>(null);
    const [isSearchingFlights, setIsSearchingFlights] = useState(false);
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
    const [flightError, setFlightError] = useState<string | null>(null);
    const [suggestionError, setSuggestionError] = useState<string | null>(null);
    const [flightSource, setFlightSource] = useState<'live' | 'curated' | null>(null);

    const setOrigin = useCallback((value: string) => setState((prev) => ({ ...prev, origin: value.toUpperCase() })), []);
    const setDestination = useCallback((value: string) => setState((prev) => ({ ...prev, destination: value.toUpperCase() })), []);

    const searchRoute = useCallback(async () => {
        if (!state.origin || !state.destination) return;

        // ── Flights ──────────────────────────────────────────────────
        setIsSearchingFlights(true);
        setFlightError(null);

        try {
            const live = await searchFlights({ origin: state.origin, destination: state.destination });
            setFlights(live);
            setFlightSource('live');
        } catch {
            // Fall back to curated mock data filtered by destination
            const fallback = MOCK_FLIGHT_DESTINATIONS
                .filter(
                    (item) =>
                        item.destination.toUpperCase() === state.destination.toUpperCase() ||
                        item.origin.toUpperCase() === state.origin.toUpperCase(),
                )
                .map(mapMockToFlight);

            setFlights(fallback.length > 0 ? fallback : MOCK_FLIGHT_DESTINATIONS.map(mapMockToFlight));
            setFlightSource('curated');
            setFlightError('Live flights unavailable — showing curated ideas instead.');
        } finally {
            setIsSearchingFlights(false);
        }

        // ── Trip suggestion ───────────────────────────────────────────
        setIsLoadingSuggestion(true);
        setSuggestionError(null);

        try {
            const suggestion = await fetchTripSuggestion({ origin: state.origin, destination: state.destination });
            setTripSuggestion(suggestion);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setSuggestionError(`AI trip suggestion unavailable: ${message}`);
        } finally {
            setIsLoadingSuggestion(false);
        }
    }, [state.destination, state.origin]);

    const clearResults = useCallback(() => {
        setFlights([]);
        setTripSuggestion(null);
        setFlightError(null);
        setSuggestionError(null);
        setFlightSource(null);
    }, []);

    return {
        state,
        flights,
        tripSuggestion,
        isSearchingFlights,
        isLoadingSuggestion,
        flightError,
        suggestionError,
        flightSource,
        setOrigin,
        setDestination,
        searchRoute,
        clearResults,
    };
};

