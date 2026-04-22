import { useCallback, useState } from 'react';
import {
    ApiDiagnostics,
    ApiRequestError,
    FlightAvailable,
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
    flights: FlightAvailable[];
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
    retrySuggestion: () => Promise<void>;
    clearResults: () => void;
}

const mapMockToFlight = (item: typeof MOCK_FLIGHT_DESTINATIONS[number]): FlightAvailable => ({
    origin: item.origin,
    destination: item.destination,
    departureDate: item.departureDate,
    // Mock data stores return date — map to canonical arrivalDate
    arrivalDate: item.returnDate,
    returnDate: item.returnDate,  // keep for legacy consumers
    price: item.price.total,
    currency: item.price.currency,
});

const buildSuggestionErrorMessage = (error: ApiRequestError): string => {
    const status = error.diagnostics.status;

    if (status === 429) {
        return 'AI trip suggestions are rate limited right now. Please try again shortly.';
    }

    if (status !== null && status >= 500) {
        return 'AI trip suggestions are temporarily unavailable from the backend. Please try again in a minute.';
    }

    if (error.message.toLowerCase().includes('timed out')) {
        return 'AI trip suggestion timed out. Please try again.';
    }

    return 'AI trip suggestion unavailable. Please retry.';
};

export const useRouteSearch = (): UseRouteSearchResult => {
    const [state, setState] = useState<RouteSearchState>({ origin: 'DUB', destination: 'STN' });
    const [flights, setFlights] = useState<FlightAvailable[]>([]);
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
                setSuggestionError(buildSuggestionErrorMessage(error));
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

    /** Retry only the AI suggestion without re-fetching flights */
    const retrySuggestion = useCallback(async () => {
        if (!state.origin || !state.destination) return;

        setTripSuggestion(null);
        setSuggestionError(null);
        setSuggestionDiagnostics(null);
        setIsLoadingSuggestion(true);

        try {
            const result = await fetchTripSuggestion({ origin: state.origin, destination: state.destination });
            setTripSuggestion(result.suggestion);
            setSuggestionDiagnostics(result.diagnostics);
        } catch (error) {
            if (error instanceof ApiRequestError) {
                setSuggestionError(buildSuggestionErrorMessage(error));
                setSuggestionDiagnostics(error.diagnostics);
            } else {
                setSuggestionError('AI trip suggestion unavailable.');
            }
        } finally {
            setIsLoadingSuggestion(false);
        }
    }, [state.origin, state.destination]);

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
        retrySuggestion,
        clearResults,
    };
};
