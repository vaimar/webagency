import { MOCK_FLIGHT_DESTINATIONS } from '../data/mockDestinations';
import { LANDING_DISCOVERY_AIRPORT_OPTIONS, normalizeAirportCode } from '../data/airportMetadata';
import { flightUrls } from './affiliates';
import { FlightAvailable } from './api';
import { FlightDestination, FlightSearchParams, FlightSearchResult } from '../model/FlightDestination';
import { loadPriorityFlights, NO_FLIGHT_NO_TRIP_MESSAGE } from './searchService';

const LANDING_SHOWCASE_LIMIT = 8;

const addDaysToDateOnly = (value: string, days: number): string => {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const nextDate = new Date(Date.UTC(year, month - 1, day));
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate.toISOString().slice(0, 10);
};

const buildDefaultSeed = (offsetDays: number): { departureDate: string; returnDate: string } => {
    const nextDate = new Date();
    nextDate.setUTCDate(nextDate.getUTCDate() + offsetDays);
    const departureDate = nextDate.toISOString().slice(0, 10);

    return {
        departureDate,
        returnDate: addDaysToDateOnly(departureDate, 4),
    };
};

const ROUTE_SEEDS_BY_DESTINATION = new Map(
    MOCK_FLIGHT_DESTINATIONS.map((destination) => [normalizeAirportCode(destination.destination), {
        departureDate: destination.departureDate,
        returnDate: destination.returnDate,
    }]),
);

const LANDING_ROUTE_SEEDS = Array.from(
    new Map(
        LANDING_DISCOVERY_AIRPORT_OPTIONS.map((code, index) => {
            const normalizedCode = normalizeAirportCode(code);
            const seededDates = ROUTE_SEEDS_BY_DESTINATION.get(normalizedCode) ?? buildDefaultSeed(21 + index);

            return [normalizedCode, {
                destination: normalizedCode,
                departureDate: seededDates.departureDate,
                returnDate: seededDates.returnDate,
            }] as const;
        }),
    ).values(),
).slice(0, LANDING_SHOWCASE_LIMIT);

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
    const honestPrice = destination.antiCauchemar?.realWorldEntryPrice ?? destination.antiCauchemar?.realCost;
    if (typeof honestPrice === 'number' && Number.isFinite(honestPrice)) {
        return honestPrice;
    }

    const marketingPrice = Number.parseFloat(destination.price.total);
    return Number.isFinite(marketingPrice) ? marketingPrice : Number.MAX_SAFE_INTEGER;
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
            flightOffers: travelLinks.kiwi || travelLinks.skyscanner || travelLinks.googleFlights,
        },
    };
};

export const fetchFlightDestinations = async (params: FlightSearchParams): Promise<FlightSearchResult> => {
    const normalizedOrigin = normalizeAirportCode(params.origin) || 'DUB';

    const destinations = (await Promise.all(
        LANDING_ROUTE_SEEDS.map(async (seed) => {
            try {
                const { flights } = await loadPriorityFlights({
                    origin: normalizedOrigin,
                    destination: seed.destination,
                    date: seed.departureDate,
                    refreshFlightsFirst: true,
                });

                if (flights.length === 0) {
                    return null;
                }

                return mapFlightToDestination(flights[0], seed.returnDate);
            } catch {
                return null;
            }
        }),
    ))
        .filter((destination): destination is FlightDestination => Boolean(destination))
        .filter((destination) => getComparablePrice(destination) <= params.maxPrice)
        .sort((left, right) => getComparablePrice(left) - getComparablePrice(right));

    return {
        destinations,
        source: 'live',
        notice: destinations.length === 0 ? NO_FLIGHT_NO_TRIP_MESSAGE : undefined,
        fetchedAt: new Date().toISOString(),
    };
};
