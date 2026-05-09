import { useCallback, useState } from 'react';
import { useProfile } from '../ProfileContext';
import {
    ApiDiagnostics,
    ApiRequestError,
    FlightAvailable,
    fetchTripSuggestion,
    TripSuggestion,
} from '../services/api';
import { searchFlightFirstRoute } from '../services/searchService';

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
    noFlightsMessage: string | null;
    suggestionError: string | null;
    flightSource: 'live' | null;
    flightDiagnostics: ApiDiagnostics | null;
    suggestionDiagnostics: ApiDiagnostics | null;
    hasSearched: boolean;
    setOrigin: (value: string) => void;
    setDestination: (value: string) => void;
    searchRoute: (options?: { refreshFlights?: boolean }) => Promise<void>;
    retrySuggestion: () => Promise<void>;
    clearResults: () => void;
}

const buildFlightErrorMessage = (error: ApiRequestError): string => {
    const status = error.diagnostics.status;

    if (status === 429) {
        return 'Ryanair flight search is rate limited right now. No trip guide can be generated yet.';
    }

    if (status !== null && status >= 500) {
        return 'Live Ryanair flights are temporarily unavailable from the backend. No trip guide until flights are back.';
    }

    if (error.message.toLowerCase().includes('timed out')) {
        return 'Live Ryanair search timed out. Please try again.';
    }

    return 'Live Ryanair flights are unavailable for this search. No trip guide can be generated.';
};

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
    const { showToast } = useProfile();
    const [state, setState] = useState<RouteSearchState>({ origin: 'DUB', destination: 'PAR' });
    const [flights, setFlights] = useState<FlightAvailable[]>([]);
    const [tripSuggestion, setTripSuggestion] = useState<TripSuggestion | null>(null);
    const [isSearchingFlights, setIsSearchingFlights] = useState(false);
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
    const [flightError, setFlightError] = useState<string | null>(null);
    const [noFlightsMessage, setNoFlightsMessage] = useState<string | null>(null);
    const [suggestionError, setSuggestionError] = useState<string | null>(null);
    const [flightSource, setFlightSource] = useState<'live' | null>(null);
    const [flightDiagnostics, setFlightDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [suggestionDiagnostics, setSuggestionDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const setOrigin = useCallback((value: string) => setState((prev) => ({ ...prev, origin: value.toUpperCase() })), []);
    const setDestination = useCallback((value: string) => setState((prev) => ({ ...prev, destination: value.toUpperCase() })), []);

    const searchRoute = useCallback(async (options?: { refreshFlights?: boolean }) => {
        if (!state.origin || !state.destination) return;

        setHasSearched(true);
        setTripSuggestion(null);
        setFlights([]);
        setIsSearchingFlights(true);
        setFlightError(null);
        setNoFlightsMessage(null);
        setFlightDiagnostics(null);
        setIsLoadingSuggestion(true);
        setSuggestionError(null);
        setSuggestionDiagnostics(null);

        try {
            const result = await searchFlightFirstRoute({
                origin: state.origin,
                destination: state.destination,
                refreshFlightsFirst: options?.refreshFlights ?? false,
            });

            setFlights(result.flights);
            setFlightSource(result.flightSource);
            setFlightDiagnostics(result.flightDiagnostics);
            setTripSuggestion(result.tripSuggestion);
            setSuggestionDiagnostics(result.suggestionDiagnostics);
            setNoFlightsMessage(result.noFlightsMessage);

            if (result.suggestionError instanceof ApiRequestError) {
                const message = buildSuggestionErrorMessage(result.suggestionError);
                setSuggestionError(message);
                setSuggestionDiagnostics(result.suggestionError.diagnostics);
                showToast({ type: 'error', source: 'planner', title: 'AI trip suggestion error', message }, 'trip-suggestion-error');
            } else if (result.suggestionError) {
                const message = 'AI trip suggestion unavailable.';
                setSuggestionError(message);
                showToast({ type: 'error', source: 'planner', title: 'AI trip suggestion error', message }, 'trip-suggestion-error-generic');
            }
        } catch (error) {
            if (error instanceof ApiRequestError) {
                const message = buildFlightErrorMessage(error);
                setFlightError(message);
                setFlightDiagnostics(error.diagnostics);
                showToast({ type: 'error', source: 'planner', title: 'Flight search error', message }, 'flight-search-error');
            } else {
                const message = error instanceof Error
                    ? error.message
                    : 'Live Ryanair flights are unavailable. No trip guide can be generated.';
                setFlightError(message);
                showToast({ type: 'error', source: 'planner', title: 'Flight search error', message }, 'flight-search-error-generic');
            }
        } finally {
            setIsSearchingFlights(false);
            setIsLoadingSuggestion(false);
        }
    }, [showToast, state.destination, state.origin]);

    const clearResults = useCallback(() => {
        setFlights([]);
        setTripSuggestion(null);
        setFlightError(null);
        setNoFlightsMessage(null);
        setSuggestionError(null);
        setFlightSource(null);
        setFlightDiagnostics(null);
        setSuggestionDiagnostics(null);
        setHasSearched(false);
    }, []);

    /** Retry only the AI suggestion without re-fetching flights */
    const retrySuggestion = useCallback(async () => {
        if (!state.origin || !state.destination || flights.length === 0) return;

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
                const message = buildSuggestionErrorMessage(error);
                setSuggestionError(message);
                setSuggestionDiagnostics(error.diagnostics);
                showToast({ type: 'error', source: 'planner', title: 'AI trip suggestion error', message }, 'trip-suggestion-retry-error');
            } else {
                const message = 'AI trip suggestion unavailable.';
                setSuggestionError(message);
                showToast({ type: 'error', source: 'planner', title: 'AI trip suggestion error', message }, 'trip-suggestion-retry-error-generic');
            }
        } finally {
            setIsLoadingSuggestion(false);
        }
    }, [flights.length, showToast, state.origin, state.destination]);

    return {
        state,
        flights,
        tripSuggestion,
        isSearchingFlights,
        isLoadingSuggestion,
        flightError,
        noFlightsMessage,
        suggestionError,
        flightSource,
        flightDiagnostics,
        suggestionDiagnostics,
        hasSearched,
        setOrigin,
        setDestination,
        searchRoute,
        retrySuggestion,
        clearResults,
    };
};
