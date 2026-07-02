import { searchFlightsByDeparture } from './api';
import { fetchFlightDestinations } from './flightService';

jest.mock('./api', () => ({
    searchFlightsByDeparture: jest.fn(),
}));

const mockedSearchFlightsByDeparture = searchFlightsByDeparture as jest.MockedFunction<typeof searchFlightsByDeparture>;

const diagnostics = {
    url: 'https://slumber-production.up.railway.app/api/flight-search/departures?iata=DUB&provider=serpapi',
    method: 'GET',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 120,
    timestamp: '2026-05-09T10:00:00.000Z',
};

describe('fetchFlightDestinations', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('builds live DUB showcase cards from backend departures and sorts them by honest price', async () => {
        mockedSearchFlightsByDeparture.mockResolvedValue({
            diagnostics,
            results: [
                {
                    flightNumber: 'FR 24',
                    departureAirport: 'DUB',
                    arrivalAirport: 'BVA',
                    scheduledDeparture: '2026-06-01T07:10:00Z',
                    scheduledArrival: '2026-06-01T09:35:00Z',
                    estimatedTicketPrice: 69,
                    antiCauchemar: {
                        realWorldEntryPrice: 112,
                        airportShuttleEstimate: 28,
                        cabinBagEstimate: 15,
                        auditedTotalCost: 112,
                        theCatch: 'Beauvais adds a bus bill.',
                        logisticVerdict: 'Still viable if the coach is budgeted.',
                        currency: 'EUR',
                    },
                },
                {
                    flightNumber: 'FR 9',
                    departureAirport: 'DUB',
                    arrivalAirport: 'LIS',
                    scheduledDeparture: '2026-06-08T08:10:00Z',
                    scheduledArrival: '2026-06-08T10:55:00Z',
                    estimatedTicketPrice: 89,
                    antiCauchemar: {
                        realWorldEntryPrice: 98,
                        airportShuttleEstimate: 9,
                        auditedTotalCost: 98,
                        theCatch: 'The airport metro saves this route.',
                        logisticVerdict: 'Cleaner entry than the headline fare suggests.',
                        currency: 'EUR',
                    },
                },
            ],
        });

        const result = await fetchFlightDestinations({ origin: 'DUB', maxPrice: 180 });

        expect(mockedSearchFlightsByDeparture).toHaveBeenCalledWith('DUB', 'serpapi');
        expect(result.source).toBe('live');
        expect(result.destinations.map((destination) => destination.destination)).toEqual(['LIS', 'BVA']);
        expect(result.destinations[0]).toMatchObject({
            antiCauchemar: {
                auditedTotalCost: 98,
            },
        });
        expect(result.destinations[0].links.flightOffers).toContain('https://');
    });

    it('returns the honest empty notice when the backend yields no landing flights', async () => {
        mockedSearchFlightsByDeparture.mockResolvedValue({
            diagnostics,
            results: [],
        });

        const result = await fetchFlightDestinations({ origin: 'DUB', maxPrice: 180 });

        expect(result.destinations).toEqual([]);
        expect(result.notice).toBe('No Honest Routes Found. No flight data means no trip guide.');
    });
});
