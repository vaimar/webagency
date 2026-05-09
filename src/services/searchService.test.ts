import { ApiDiagnostics } from './api';
import { NO_FLIGHT_NO_TRIP_MESSAGE, searchFlightFirstRoute } from './searchService';
import { fetchTripSuggestion, refreshFlights, searchFlights } from './api';

jest.mock('./api', () => ({
    fetchTripSuggestion: jest.fn(),
    refreshFlights: jest.fn(),
    searchFlights: jest.fn(),
}));

const baseDiagnostics: ApiDiagnostics = {
    url: 'https://slumber-production.up.railway.app/api/flights',
    method: 'GET',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 120,
    timestamp: '2026-05-09T10:00:00.000Z',
};

const mockedFetchTripSuggestion = fetchTripSuggestion as jest.MockedFunction<typeof fetchTripSuggestion>;
const mockedRefreshFlights = refreshFlights as jest.MockedFunction<typeof refreshFlights>;
const mockedSearchFlights = searchFlights as jest.MockedFunction<typeof searchFlights>;

describe('searchFlightFirstRoute', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('refreshes flights first, sorts by realWorldEntryPrice, then fetches the trip guide', async () => {
        mockedRefreshFlights.mockResolvedValue({
            diagnostics: baseDiagnostics,
            message: 'Flights refresh started',
            origin: 'DUB',
            destination: 'BVA',
            date: '2026-06-01',
        });
        mockedSearchFlights.mockResolvedValue({
            diagnostics: baseDiagnostics,
            flights: [
                {
                    origin: 'DUB',
                    destination: 'BVA',
                    price: 99,
                    antiCauchemar: { realWorldEntryPrice: 141, theCatch: 'Late arrival' },
                },
                {
                    origin: 'DUB',
                    destination: 'BVA',
                    price: 109,
                    antiCauchemar: { realWorldEntryPrice: 132, theCatch: 'Early shuttle' },
                },
            ],
        });
        mockedFetchTripSuggestion.mockResolvedValue({
            diagnostics: { ...baseDiagnostics, url: 'https://slumber-production.up.railway.app/api/trips/suggestions' },
            suggestion: { origin: 'DUB', destination: 'BVA', summary: 'Cold, honest weekend.' },
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA', refreshFlightsFirst: true, date: '2026-06-01' });

        expect(mockedRefreshFlights).toHaveBeenCalledWith({ origin: 'DUB', destination: 'BVA', refreshFlightsFirst: true, date: '2026-06-01' });
        expect(mockedSearchFlights).toHaveBeenCalledWith({ origin: 'DUB', destination: 'BVA', refreshFlightsFirst: true, date: '2026-06-01' });
        expect(mockedFetchTripSuggestion).toHaveBeenCalledWith({ origin: 'DUB', destination: 'BVA', provider: undefined });
        expect(result.flights.map((flight) => flight.antiCauchemar?.realWorldEntryPrice)).toEqual([132, 141]);
        expect(result.tripSuggestion?.summary).toBe('Cold, honest weekend.');
        expect(result.noFlightsMessage).toBeNull();
    });

    it('stops the flow when no flights are returned', async () => {
        mockedSearchFlights.mockResolvedValue({
            diagnostics: baseDiagnostics,
            flights: [],
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA' });

        expect(mockedSearchFlights).toHaveBeenCalledWith({ origin: 'DUB', destination: 'BVA' });
        expect(mockedFetchTripSuggestion).not.toHaveBeenCalled();
        expect(result.tripSuggestion).toBeNull();
        expect(result.noFlightsMessage).toBe(NO_FLIGHT_NO_TRIP_MESSAGE);
    });
});

