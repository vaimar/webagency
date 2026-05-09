import { fetchFlightDestinations } from './flightService';
import { loadPriorityFlights } from './searchService';

jest.mock('./searchService', () => ({
    loadPriorityFlights: jest.fn(),
    NO_FLIGHT_NO_TRIP_MESSAGE: 'No Honest Routes Found. No flight data means no trip guide.',
}));

const mockedLoadPriorityFlights = loadPriorityFlights as jest.MockedFunction<typeof loadPriorityFlights>;

const diagnostics = {
    url: 'https://slumber-production.up.railway.app/api/flights',
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

    it('builds live DUB showcase cards from backend flights and sorts them by honest price', async () => {
        mockedLoadPriorityFlights.mockImplementation(async (params) => {
            if (params.destination === 'BVA') {
                return {
                    flights: [
                        {
                            origin: 'DUB',
                            destination: 'BVA',
                            departureDate: '2026-06-01T07:10:00Z',
                            price: 69,
                            currency: 'EUR',
                            antiCauchemar: {
                                realWorldEntryPrice: 112,
                                theCatch: 'Beauvais adds a bus bill.',
                                logisticVerdict: 'Still viable if the coach is budgeted.',
                                currency: 'EUR',
                            },
                        },
                    ],
                    diagnostics,
                    source: 'live',
                };
            }

            if (params.destination === 'LIS') {
                return {
                    flights: [
                        {
                            origin: 'DUB',
                            destination: 'LIS',
                            departureDate: '2026-06-08T08:10:00Z',
                            price: 89,
                            currency: 'EUR',
                            antiCauchemar: {
                                realWorldEntryPrice: 98,
                                theCatch: 'The airport metro saves this route.',
                                logisticVerdict: 'Cleaner entry than the headline fare suggests.',
                                currency: 'EUR',
                            },
                        },
                    ],
                    diagnostics,
                    source: 'live',
                };
            }

            return {
                flights: [],
                diagnostics,
                source: 'live',
            };
        });

        const result = await fetchFlightDestinations({ origin: 'DUB', maxPrice: 180 });

        expect(mockedLoadPriorityFlights).toHaveBeenCalledWith(expect.objectContaining({
            origin: 'DUB',
            destination: 'BVA',
            refreshFlightsFirst: true,
            date: '2026-06-01',
        }));
        expect(result.source).toBe('live');
        expect(result.destinations.map((destination) => destination.destination)).toEqual(['LIS', 'BVA']);
        expect(result.destinations[0]).toMatchObject({
            antiCauchemar: {
                realWorldEntryPrice: 98,
            },
        });
        expect(result.destinations[0].links.flightOffers).toContain('https://');
    });

    it('returns the honest empty notice when the backend yields no landing flights', async () => {
        mockedLoadPriorityFlights.mockResolvedValue({
            flights: [],
            diagnostics,
            source: 'live',
        });

        const result = await fetchFlightDestinations({ origin: 'DUB', maxPrice: 180 });

        expect(result.destinations).toEqual([]);
        expect(result.notice).toBe('No Honest Routes Found. No flight data means no trip guide.');
    });
});


