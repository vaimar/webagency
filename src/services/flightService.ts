import { MOCK_FLIGHT_DESTINATIONS } from '../data/mockDestinations';
import { FlightDestination, FlightSearchParams, FlightSearchResult } from '../model/FlightDestination';

const AMADEUS_BASE_URL = 'https://test.api.amadeus.com/v1';
const apiToken = (process.env.REACT_APP_AMADEUS_TOKEN ?? '').trim();

interface RawFlightDestination {
    type?: string;
    origin?: string;
    destination?: string;
    departureDate?: string;
    returnDate?: string;
    price?: {
        total?: string;
        currency?: string;
    };
    links?: {
        flightDates?: string;
        flightOffers?: string;
    };
}

const fallbackNotice = 'Showing curated sample fares. Add a server-provided Amadeus token via REACT_APP_AMADEUS_TOKEN to enable live results.';

const normalizeDestination = (destination: FlightDestination, origin: string): FlightDestination => ({
    ...destination,
    origin,
});

const buildDemoResult = (params: FlightSearchParams, notice = fallbackNotice): FlightSearchResult => {
    const origin = params.origin.toUpperCase();
    const destinations = MOCK_FLIGHT_DESTINATIONS
        .filter((item) => Number(item.price.total) <= params.maxPrice)
        .map((item) => normalizeDestination(item, origin));

    return {
        destinations,
        source: 'demo',
        notice,
        fetchedAt: new Date().toISOString(),
    };
};

const mapApiDestination = (item: RawFlightDestination, origin: string): FlightDestination => ({
    type: item.type ?? 'flight-destination',
    origin: item.origin ?? origin,
    destination: item.destination ?? 'N/A',
    departureDate: item.departureDate ?? '',
    returnDate: item.returnDate ?? '',
    price: {
        total: item.price?.total ?? '0.00',
        currency: item.price?.currency ?? 'EUR',
    },
    links: {
        flightDates: item.links?.flightDates ?? '',
        flightOffers: item.links?.flightOffers ?? '',
    },
});

export const isLiveFlightApiConfigured = (): boolean => apiToken.length > 0;

export const fetchFlightDestinations = async (params: FlightSearchParams): Promise<FlightSearchResult> => {
    const origin = params.origin.trim().toUpperCase();

    if (!origin) {
        return buildDemoResult({ ...params, origin: 'PAR' }, 'Origin is required, so sample fares for PAR are shown instead.');
    }

    if (!isLiveFlightApiConfigured()) {
        return buildDemoResult({ ...params, origin });
    }

    try {
        const response = await fetch(
            `${AMADEUS_BASE_URL}/shopping/flight-destinations?origin=${origin}&maxPrice=${params.maxPrice}`,
            {
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                },
            },
        );

        if (!response.ok) {
            return buildDemoResult({ ...params, origin }, `Live fares failed (${response.status}). ${fallbackNotice}`);
        }

        const payload = (await response.json()) as { data?: RawFlightDestination[] };
        const destinations = (payload.data ?? []).map((item) => mapApiDestination(item, origin));

        if (destinations.length === 0) {
            return buildDemoResult({ ...params, origin }, 'No live fares matched your filters, so curated suggestions are shown instead.');
        }

        return {
            destinations,
            source: 'live',
            fetchedAt: new Date().toISOString(),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return buildDemoResult({ ...params, origin }, `Live fares are temporarily unavailable (${message}). ${fallbackNotice}`);
    }
};

