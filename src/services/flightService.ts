import { LANDING_DISCOVERY_AIRPORT_OPTIONS, normalizeAirportCode } from '../data/airportMetadata';
import { flightUrls } from './affiliates';
import { getComparableFlightPrice } from './antiCauchemarPricing';
import { FlightAvailable, FlightSearchResult as ExternalRouteResult, searchFlightsByDeparture } from './api';
import { FlightDestination, FlightSearchParams, FlightSearchResult } from '../model/FlightDestination';
import { NO_FLIGHT_NO_TRIP_MESSAGE } from './searchService';

const LANDING_SHOWCASE_LIMIT = 8;

const DATE_ONLY_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

const extractDateOnly = (value?: string, fallback: string = ''): string => {
    if (!value) {
        return fallback;
    }

    const match = value.match(DATE_ONLY_PREFIX_RE);
    return match?.[1] ?? fallback;
};

const formatPriceTotal = (value: number | string): string => {
    const numericValue = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(numericValue)) {
        return String(value);
    }

    return numericValue.toFixed(2);
};

const getComparablePrice = (destination: FlightDestination): number => {
    return getComparableFlightPrice(destination.price.total, destination.antiCauchemar);
};

const addDaysToDateOnly = (value: string, days: number): string => {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const nextDate = new Date(Date.UTC(year, month - 1, day));
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate.toISOString().slice(0, 10);
};

const mapExternalRouteToFlight = (origin: string, route: ExternalRouteResult): FlightAvailable => ({
    origin: normalizeAirportCode(route.departureAirport ?? origin) || origin.toUpperCase(),
    destination: normalizeAirportCode(route.arrivalAirport ?? ''),
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
    antiCauchemar: route.antiCauchemar,
});

const pickBestFlightPerDestination = (origin: string, routes: ExternalRouteResult[]): FlightAvailable[] => {
    const bestByDestination = new Map<string, FlightAvailable>();

    routes.forEach((route) => {
        const flight = mapExternalRouteToFlight(origin, route);
        const destinationCode = normalizeAirportCode(flight.destination);
        if (!destinationCode) {
            return;
        }

        const existing = bestByDestination.get(destinationCode);
        if (!existing || getComparableFlightPrice(flight.price, flight.antiCauchemar) < getComparableFlightPrice(existing.price, existing.antiCauchemar)) {
            bestByDestination.set(destinationCode, {
                ...flight,
                destination: destinationCode,
            });
        }
    });

    return Array.from(bestByDestination.values());
};

const mapFlightToDestination = (
    flight: FlightAvailable,
    fallbackReturnDate: string,
): FlightDestination => {
    const departureDate = extractDateOnly(flight.departureDate ?? flight.departureTime, '');
    const travelLinks = flightUrls(flight.origin, flight.destination, departureDate);

    return {
        type: 'flight-destination',
        origin: normalizeAirportCode(flight.origin),
        destination: normalizeAirportCode(flight.destination),
        departureDate,
        returnDate: fallbackReturnDate,
        price: {
            total: formatPriceTotal(flight.price),
            currency: flight.currency ?? flight.antiCauchemar?.currency ?? 'EUR',
        },
        antiCauchemar: flight.antiCauchemar,
        links: {
            flightDates: travelLinks.googleFlights,
            flightOffers: travelLinks.kiwi || travelLinks.googleFlights,
        },
    };
};

export const fetchFlightDestinations = async (params: FlightSearchParams): Promise<FlightSearchResult> => {
    const normalizedOrigin = normalizeAirportCode(params.origin) || 'DUB';

    const { results } = await searchFlightsByDeparture(normalizedOrigin, 'serpapi');
    const destinations = pickBestFlightPerDestination(normalizedOrigin, results)
        .filter((flight) => LANDING_DISCOVERY_AIRPORT_OPTIONS.includes(normalizeAirportCode(flight.destination)))
        .map((flight) => {
            const departureDate = extractDateOnly(flight.departureDate, new Date().toISOString().slice(0, 10));
            return mapFlightToDestination(flight, addDaysToDateOnly(departureDate, 4));
        })
        .filter((destination) => getComparablePrice(destination) <= params.maxPrice)
        .sort((left, right) => getComparablePrice(left) - getComparablePrice(right))
        .slice(0, LANDING_SHOWCASE_LIMIT);

    return {
        destinations,
        source: 'live',
        notice: destinations.length === 0 ? NO_FLIGHT_NO_TRIP_MESSAGE : undefined,
        fetchedAt: new Date().toISOString(),
    };
};
