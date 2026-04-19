import { useCallback, useState } from 'react';
import {
    ApiDiagnostics,
    ApiRequestError,
    BackendFlight,
    fetchTripSuggestion,
    searchFlights,
    TripSuggestion,
} from '../services/api';
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
    flightDiagnostics: ApiDiagnostics | null;
    suggestionDiagnostics: ApiDiagnostics | null;
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
    const [flightDiagnostics, setFlightDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [suggestionDiagnostics, setSuggestionDiagnostics] = useState<ApiDiagnostics | null>(null);

    const setOrigin = useCallback((value: string) => setState((prev) => ({ ...prev, origin: value.toUpperCase() })), []);
    const setDestination = useCallback((value: string) => setState((prev) => ({ ...prev, destination: value.toUpperCase() })), []);

    const searchRoute = useCallback(async () => {
        if (!state.origin || !state.destination) return;

        setTripSuggestion(null);
        setIsSearchingFlights(true);
        setFlightError(null);
        setFlightDiagnostics(null);
        setIsLoadingSuggestion(true);
        setSuggestionError(null);
        setSuggestionDiagnostics(null);

        const [flightResult, suggestionResult] = await Promise.allSettled([
            searchFlights({ origin: state.origin, destination: state.destination }),
            fetchTripSuggestion({ origin: state.origin, destination: state.destination }),
        ]);

        if (flightResult.status === 'fulfilled') {
            const live = flightResult.value;
            setFlights(live.flights);
            setFlightSource('live');
            setFlightDiagnostics(live.diagnostics);
        } else {
            const error = flightResult.reason;

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
            setFlightError(
                error instanceof Error
                    ? `Live flights unavailable — showing curated ideas instead. ${error.message}`
                    : 'Live flights unavailable — showing curated ideas instead.',
            );
            if (error instanceof ApiRequestError) {
                setFlightDiagnostics(error.diagnostics);
            }
        }

        setIsSearchingFlights(false);

        if (suggestionResult.status === 'fulfilled') {
            const result = suggestionResult.value;
            setTripSuggestion(result.suggestion);
            setSuggestionDiagnostics(result.diagnostics);
        } else {
            const error = suggestionResult.reason;

            if (error instanceof ApiRequestError) {
                setSuggestionError(`AI trip suggestion unavailable: ${error.message}`);
                setSuggestionDiagnostics(error.diagnostics);
            } else {
                setSuggestionError('AI trip suggestion unavailable.');
            }
        }

        setIsLoadingSuggestion(false);
    }, [state.destination, state.origin]);

    const clearResults = useCallback(() => {
        setFlights([]);
        setTripSuggestion(null);
        setFlightError(null);
        setSuggestionError(null);
        setFlightSource(null);
        setFlightDiagnostics(null);
        setSuggestionDiagnostics(null);
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
        flightDiagnostics,
        suggestionDiagnostics,
        setOrigin,
        setDestination,
        searchRoute,
        clearResults,
    };
};
