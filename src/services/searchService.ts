import {
    ApiDiagnostics,
    ApiRequestError,
    FlightAvailable,
    FlightSearchParams,
    TripSuggestion,
    fetchTripSuggestion,
    refreshFlights,
    searchFlights,
} from './api';

export interface FlightFirstSearchParams extends FlightSearchParams {
    refreshFlightsFirst?: boolean;
    provider?: string;
}

export interface FlightFirstSearchResult {
    flights: FlightAvailable[];
    flightDiagnostics: ApiDiagnostics;
    flightSource: 'live';
    tripSuggestion: TripSuggestion | null;
    suggestionDiagnostics: ApiDiagnostics | null;
    suggestionError: unknown | null;
    noFlightsMessage: string | null;
}

export const NO_FLIGHT_NO_TRIP_MESSAGE = 'No Ryanair flight found for this route. No trip guide will be generated.';
const REFRESH_READ_RETRIES = 3;
const REFRESH_READ_DELAY_MS = 900;

const wait = async (delayMs: number): Promise<void> => {
    await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
    });
};

const getComparablePrice = (flight: FlightAvailable): number => {
    const honestPrice = flight.antiCauchemar?.realWorldEntryPrice ?? flight.antiCauchemar?.realCost;
    if (typeof honestPrice === 'number' && Number.isFinite(honestPrice)) {
        return honestPrice;
    }

    const marketingPrice = typeof flight.price === 'number' ? flight.price : Number.parseFloat(String(flight.price));
    return Number.isFinite(marketingPrice) ? marketingPrice : Number.MAX_SAFE_INTEGER;
};

const sortFlightsByHonestPrice = (flights: FlightAvailable[]): FlightAvailable[] => (
    [...flights].sort((left, right) => getComparablePrice(left) - getComparablePrice(right))
);

export const loadPriorityFlights = async (
    params: FlightFirstSearchParams,
): Promise<{ flights: FlightAvailable[]; diagnostics: ApiDiagnostics; source: 'live' }> => {
    let response;

    if (params.refreshFlightsFirst) {
        await refreshFlights(params);
        response = await searchFlights(params);

        let attemptsRemaining = REFRESH_READ_RETRIES;
        while (response.flights.length === 0 && attemptsRemaining > 0) {
            await wait(REFRESH_READ_DELAY_MS);
            response = await searchFlights(params);
            attemptsRemaining -= 1;
        }
    } else {
        response = await searchFlights(params);
    }

    return {
        flights: sortFlightsByHonestPrice(response.flights),
        diagnostics: response.diagnostics,
        source: 'live',
    };
};

export const searchFlightFirstRoute = async (params: FlightFirstSearchParams): Promise<FlightFirstSearchResult> => {
    const flightResult = await loadPriorityFlights(params);

    if (flightResult.flights.length === 0) {
        return {
            flights: [],
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            tripSuggestion: null,
            suggestionDiagnostics: null,
            suggestionError: null,
            noFlightsMessage: NO_FLIGHT_NO_TRIP_MESSAGE,
        };
    }

    try {
        const suggestionResult = await fetchTripSuggestion({
            origin: params.origin,
            destination: params.destination,
            provider: params.provider,
        });

        return {
            flights: flightResult.flights,
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            tripSuggestion: suggestionResult.suggestion,
            suggestionDiagnostics: suggestionResult.diagnostics,
            suggestionError: null,
            noFlightsMessage: null,
        };
    } catch (error) {
        return {
            flights: flightResult.flights,
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            tripSuggestion: null,
            suggestionDiagnostics: error instanceof ApiRequestError ? error.diagnostics : null,
            suggestionError: error,
            noFlightsMessage: null,
        };
    }
};

