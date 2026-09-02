import {
    ApiDiagnostics,
    ApiRequestError,
    FlightAvailable,
    FlightSearchResult,
    FlightSearchParams,
    FlightSearchProvider,
    FirstMileAccessParams,
    TripSuggestion,
    fetchTripSuggestion,
    searchFlightRoutes,
} from './api';
import { getComparableFlightPrice } from './antiCauchemarPricing';
import { normalizeAirportCode } from '../data/airportMetadata';
import { funnel } from './telemetry';

export interface FlightFirstSearchParams extends FlightSearchParams {
    refreshFlightsFirst?: boolean;
    provider?: FlightSearchProvider;
    includeSuggestion?: boolean;
    firstMile?: FirstMileAccessParams;
}

export interface FlightFirstSearchResult {
    flights: FlightAvailable[];
    flightDiagnostics: ApiDiagnostics;
    flightSource: 'live';
    resolvedDate: string | null;
    flightNotice: string | null;
    tripSuggestion: TripSuggestion | null;
    suggestionDiagnostics: ApiDiagnostics | null;
    suggestionError: unknown | null;
    noFlightsMessage: string | null;
}

export const NO_FLIGHT_NO_TRIP_MESSAGE = 'No Honest Routes Found. No flight data means no trip guide.';
const NEXT_AVAILABLE_DAY_LIMIT = 2;

const getComparablePrice = (flight: FlightAvailable): number => {
    return getComparableFlightPrice(flight.price, flight.antiCauchemar);
};

const sortFlightsByHonestPrice = (flights: FlightAvailable[]): FlightAvailable[] => (
    [...flights].sort((left, right) => getComparablePrice(left) - getComparablePrice(right))
);

const DATE_ONLY_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

const extractDateOnly = (value?: string): string => {
    if (!value) {
        return '';
    }

    const match = value.match(DATE_ONLY_PREFIX_RE);
    return match?.[1] ?? '';
};

const differenceInUtcDays = (from: string, to: string): number => {
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return Number.MAX_SAFE_INTEGER;
    }

    return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
};

const mapRouteResultToFlight = (
    route: FlightSearchResult,
    from: string,
    to: string,
    firstMile?: FirstMileAccessParams,
): FlightAvailable => {
    const mappedFlight: FlightAvailable = {
        origin: normalizeAirportCode(route.departureAirport ?? from) || from.toUpperCase(),
        destination: normalizeAirportCode(route.arrivalAirport ?? to) || to.toUpperCase(),
        departureDate: route.scheduledDeparture,
        arrivalDate: route.scheduledArrival,
        price: route.estimatedTicketPrice
            ?? route.antiCauchemar?.ticketPrice
            ?? route.antiCauchemar?.auditedTotalCost
            ?? route.antiCauchemar?.realWorldEntryPrice
            ?? 0,
        currency: route.antiCauchemar?.currency ?? 'EUR',
        flightNumber: route.flightNumber,
        airline: route.airline,
        antiCauchemar: route.antiCauchemar
            ? {
                ...route.antiCauchemar,
                firstMileAccess: route.antiCauchemar.firstMileAccess ?? (firstMile
                    ? {
                        amount: firstMile.firstMileAmount,
                        durationMinutes: firstMile.firstMileDurationMinutes,
                        mode: firstMile.firstMileMode,
                        currency: firstMile.firstMileCurrency,
                        status: firstMile.firstMileStatus,
                        source: firstMile.firstMileSource,
                        note: firstMile.firstMileNote,
                    }
                    : undefined),
              }
            : undefined,
    };

    return mappedFlight;
};

const resolveFlightsForRequestedDate = (
    flights: FlightAvailable[],
    requestedDate?: string,
): { flights: FlightAvailable[]; resolvedDate: string | null; notice: string | null } => {
    const sortedFlights = sortFlightsByHonestPrice(flights);
    if (!requestedDate) {
        return {
            flights: sortedFlights,
            resolvedDate: extractDateOnly(sortedFlights[0]?.departureDate) || null,
            notice: null,
        };
    }

    const exactMatches = sortedFlights.filter((flight) => extractDateOnly(flight.departureDate) === requestedDate);
    if (exactMatches.length > 0) {
        return {
            flights: exactMatches,
            resolvedDate: requestedDate,
            notice: null,
        };
    }

    const fallbackFlights = sortedFlights.filter((flight) => {
        const departureDate = extractDateOnly(flight.departureDate);
        if (!departureDate) {
            return false;
        }

        const dayDiff = differenceInUtcDays(requestedDate, departureDate);
        return dayDiff > 0 && dayDiff <= NEXT_AVAILABLE_DAY_LIMIT;
    });

    if (fallbackFlights.length === 0) {
        return {
            flights: [],
            resolvedDate: requestedDate,
            notice: null,
        };
    }

    const fallbackDate = extractDateOnly(fallbackFlights[0]?.departureDate);
    const sameFallbackDateFlights = fallbackFlights.filter((flight) => extractDateOnly(flight.departureDate) === fallbackDate);

    return {
        flights: sameFallbackDateFlights,
        resolvedDate: fallbackDate || requestedDate,
        notice: fallbackDate
            ? `No one-way fare on ${requestedDate}. Showing the next available SerpApi route on ${fallbackDate}.`
            : null,
    };
};

export const loadPriorityFlights = async (
    params: FlightFirstSearchParams,
): Promise<{ flights: FlightAvailable[]; diagnostics: ApiDiagnostics; source: 'live'; resolvedDate: string | null; notice: string | null }> => {
    const provider = params.provider ?? 'serpapi';
    const response = await searchFlightRoutes(params.origin, params.destination, provider);
    const mappedFlights = response.results.map((route) => mapRouteResultToFlight(route, params.origin, params.destination, params.firstMile));
    const { flights, resolvedDate, notice } = resolveFlightsForRequestedDate(mappedFlights, params.date);

    return {
        flights,
        diagnostics: response.diagnostics,
        source: 'live',
        resolvedDate,
        notice,
    };
};

export const searchFlightFirstRoute = async (params: FlightFirstSearchParams): Promise<FlightFirstSearchResult> => {
    // Funnel stage 1. Instrumented here rather than in each screen so every
    // route search is counted the same way, whichever page started it.
    const startedAt = Date.now();
    funnel.searchStarted({
        surface: 'flight-first',
        origin: params.origin,
        destination: params.destination,
    });

    let flightResult: Awaited<ReturnType<typeof loadPriorityFlights>>;
    try {
        flightResult = await loadPriorityFlights(params);
    } catch (error) {
        funnel.searchFailed({
            surface: 'flight-first',
            reason: error instanceof Error ? error.message : 'unknown',
        });
        throw error;
    }

    // Stage 2. A search that succeeds but returns nothing is a distinct
    // outcome from one that errors — conflating them hides the real problem.
    funnel.searchSucceeded({
        surface: 'flight-first',
        resultCount: flightResult.flights.length,
        durationMs: Date.now() - startedAt,
    });

    if (flightResult.flights.length === 0) {
        return {
            flights: [],
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            resolvedDate: flightResult.resolvedDate,
            flightNotice: null,
            tripSuggestion: null,
            suggestionDiagnostics: null,
            suggestionError: null,
            noFlightsMessage: NO_FLIGHT_NO_TRIP_MESSAGE,
        };
    }

    if (!params.includeSuggestion) {
        return {
            flights: flightResult.flights,
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            resolvedDate: flightResult.resolvedDate,
            flightNotice: flightResult.notice,
            tripSuggestion: null,
            suggestionDiagnostics: null,
            suggestionError: null,
            noFlightsMessage: null,
        };
    }

    try {
        const suggestionResult = await fetchTripSuggestion({
            origin: params.origin,
            destination: params.destination,
                provider: params.provider ?? 'serpapi',
        });

        return {
            flights: flightResult.flights,
            flightDiagnostics: flightResult.diagnostics,
            flightSource: flightResult.source,
            resolvedDate: flightResult.resolvedDate,
            flightNotice: flightResult.notice,
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
            resolvedDate: flightResult.resolvedDate,
            flightNotice: flightResult.notice,
            tripSuggestion: null,
            suggestionDiagnostics: error instanceof ApiRequestError ? error.diagnostics : null,
            suggestionError: error,
            noFlightsMessage: null,
        };
    }
};

