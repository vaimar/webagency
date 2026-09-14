import type { MockedFunction } from 'vitest';
import { ApiDiagnostics, searchFlightRoutes, fetchTripSuggestion } from './api';
import { NO_FLIGHT_NO_TRIP_MESSAGE, searchFlightFirstRoute } from './searchService';

vi.mock('./api', () => ({
    fetchTripSuggestion: vi.fn(),
    searchFlightRoutes: vi.fn(),
}));

const baseDiagnostics: ApiDiagnostics = {
    requestId: 'test-request-id',
    url: 'https://slumber-production.up.railway.app/api/flight-search/routes?from=DUB&to=BVA&provider=serpapi',
    method: 'GET',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 120,
    timestamp: '2026-05-09T10:00:00.000Z',
};

const mockedFetchTripSuggestion = fetchTripSuggestion as MockedFunction<typeof fetchTripSuggestion>;
const mockedSearchFlightRoutes = searchFlightRoutes as MockedFunction<typeof searchFlightRoutes>;

describe('searchFlightFirstRoute', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns live route truth without loading the AI guide by default', async () => {
        mockedSearchFlightRoutes.mockResolvedValue({
            diagnostics: baseDiagnostics,
            results: [
                {
                    flightNumber: 'FR 24',
                    departureAirport: 'DUB',
                    arrivalAirport: 'BVA',
                    scheduledDeparture: '2026-06-01T07:10:00Z',
                    scheduledArrival: '2026-06-01T09:35:00Z',
                    estimatedTicketPrice: 99,
                    antiCauchemar: {
                        realWorldEntryPrice: 141,
                        airportShuttleEstimate: 22,
                        cabinBagEstimate: 20,
                        auditedTotalCost: 141,
                        theCatch: 'Late arrival',
                    },
                },
                {
                    flightNumber: 'FR 26',
                    departureAirport: 'DUB',
                    arrivalAirport: 'BVA',
                    scheduledDeparture: '2026-06-01T10:20:00Z',
                    scheduledArrival: '2026-06-01T12:45:00Z',
                    estimatedTicketPrice: 109,
                    antiCauchemar: {
                        realWorldEntryPrice: 132,
                        airportShuttleEstimate: 8,
                        cabinBagEstimate: 15,
                        auditedTotalCost: 132,
                        theCatch: 'Early shuttle',
                    },
                },
            ],
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA', date: '2026-06-01' });

        expect(mockedSearchFlightRoutes).toHaveBeenCalledWith('DUB', 'BVA', 'serpapi');
        expect(mockedFetchTripSuggestion).not.toHaveBeenCalled();
        expect(result.flights.map((flight) => flight.antiCauchemar?.auditedTotalCost)).toEqual([132, 141]);
        expect(result.resolvedDate).toBe('2026-06-01');
        expect(result.flightNotice).toBeNull();
        expect(result.tripSuggestion).toBeNull();
        expect(result.noFlightsMessage).toBeNull();
    });

    it('falls forward to the next available date when the selected day is empty in the live route feed', async () => {
        mockedSearchFlightRoutes.mockResolvedValue({
            diagnostics: baseDiagnostics,
            results: [
                {
                    flightNumber: 'FR 26',
                    departureAirport: 'DUB',
                    arrivalAirport: 'BVA',
                    scheduledDeparture: '2026-06-02T10:20:00Z',
                    scheduledArrival: '2026-06-02T12:45:00Z',
                    estimatedTicketPrice: 109,
                    antiCauchemar: {
                        realWorldEntryPrice: 132,
                        airportShuttleEstimate: 8,
                        cabinBagEstimate: 15,
                        auditedTotalCost: 132,
                        theCatch: 'Early shuttle',
                    },
                },
            ],
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA', date: '2026-06-01' });

        expect(result.resolvedDate).toBe('2026-06-02');
        expect(result.flightNotice).toMatch(/next available serpapi route on 2026-06-02/i);
        expect(result.noFlightsMessage).toBeNull();
    });

    it('loads the AI guide only when explicitly requested', async () => {
        mockedSearchFlightRoutes.mockResolvedValue({
            diagnostics: baseDiagnostics,
            results: [
                {
                    flightNumber: 'FR 24',
                    departureAirport: 'DUB',
                    arrivalAirport: 'BVA',
                    scheduledDeparture: '2026-06-01T07:10:00Z',
                    estimatedTicketPrice: 99,
                    antiCauchemar: {
                        realWorldEntryPrice: 141,
                        airportShuttleEstimate: 22,
                        cabinBagEstimate: 20,
                        auditedTotalCost: 141,
                        theCatch: 'Late arrival',
                    },
                },
            ],
        });
        mockedFetchTripSuggestion.mockResolvedValue({
            diagnostics: { ...baseDiagnostics, url: 'https://slumber-production.up.railway.app/api/trips/suggestions' },
            suggestion: { origin: 'DUB', destination: 'BVA', summary: 'Cold, honest weekend.' },
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA', includeSuggestion: true });

        expect(mockedFetchTripSuggestion).toHaveBeenCalledWith({ origin: 'DUB', destination: 'BVA', provider: 'serpapi' });
        expect(result.flightNotice).toBeNull();
        expect(result.tripSuggestion?.summary).toBe('Cold, honest weekend.');
    });

    it('stops the flow when no flights are returned', async () => {
        mockedSearchFlightRoutes.mockResolvedValue({
            diagnostics: baseDiagnostics,
            results: [],
        });

        const result = await searchFlightFirstRoute({ origin: 'DUB', destination: 'BVA' });

        expect(mockedFetchTripSuggestion).not.toHaveBeenCalled();
        expect(result.flightNotice).toBeNull();
        expect(result.tripSuggestion).toBeNull();
        expect(result.noFlightsMessage).toBe(NO_FLIGHT_NO_TRIP_MESSAGE);
    });

    it('forwards first-mile params into the mapped live route result', async () => {
        mockedSearchFlightRoutes.mockResolvedValue({
            diagnostics: baseDiagnostics,
            results: [{
                flightNumber: 'FR 777',
                departureAirport: 'DUB',
                arrivalAirport: 'NCE',
                scheduledDeparture: '2026-05-26T08:00:00Z',
                scheduledArrival: '2026-05-26T11:00:00Z',
                estimatedTicketPrice: 100,
                antiCauchemar: {
                    auditedTotalCost: 119,
                },
            }],
        });

        const result = await searchFlightFirstRoute({
            origin: 'DUB',
            destination: 'NCE',
            firstMile: {
                firstMileAmount: 42,
                firstMileDurationMinutes: 150,
                firstMileMode: 'rental_car',
                firstMileStatus: 'USER_PROVIDED',
                firstMileNote: 'Limerick to Dublin by car',
            },
        });

        expect(result.flights[0].antiCauchemar?.firstMileAccess).toMatchObject({
            amount: 42,
            durationMinutes: 150,
            mode: 'rental_car',
            status: 'USER_PROVIDED',
            note: 'Limerick to Dublin by car',
        });
    });
});
