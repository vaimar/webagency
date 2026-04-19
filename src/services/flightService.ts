import { MOCK_FLIGHT_DESTINATIONS } from '../data/mockDestinations';

export interface FlightDestination {
    type: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    price: {
        total: string;
        currency: string;
    };
    links: {
        flightDates: string;
        flightOffers: string;
    };
}

export interface FlightSearchParams {
    origin: string;
    maxPrice: number;
}

export interface FlightSearchResult {
    destinations: FlightDestination[];
    source: 'curated';
    notice?: string;
    fetchedAt: string;
}

const curatedNotice =
    'Showing curated destination ideas for now. If you add another flight provider later, this service is the right integration point.';

const normalizeDestination = (destination: FlightDestination, origin: string): FlightDestination => ({
    ...destination,
    origin,
});

export const fetchFlightDestinations = async (params: FlightSearchParams): Promise<FlightSearchResult> => {
    const normalizedOrigin = params.origin.trim().toUpperCase() || 'PAR';

    const destinations = (MOCK_FLIGHT_DESTINATIONS as FlightDestination[])
        .filter((item) => Number(item.price.total) <= params.maxPrice)
        .map((item) => normalizeDestination(item, normalizedOrigin));

    return {
        destinations,
        source: 'curated',
        notice: curatedNotice,
        fetchedAt: new Date().toISOString(),
    };
};
