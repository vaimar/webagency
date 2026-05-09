import { render, screen } from '@testing-library/react';
import Home from './Home';
import { useRouteSearch } from './hooks/useRouteSearch';

jest.mock('./hooks/useRouteSearch');

const mockedUseRouteSearch = useRouteSearch as jest.MockedFunction<typeof useRouteSearch>;

const diagnostics = {
    url: 'https://slumber-production.up.railway.app/api/flights',
    method: 'GET',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 86,
    timestamp: '2026-05-09T10:00:00.000Z',
};

const createRouteSearchState = (overrides: Partial<ReturnType<typeof useRouteSearch>> = {}): ReturnType<typeof useRouteSearch> => ({
    state: { origin: 'DUB', destination: 'PAR' },
    flights: [],
    tripSuggestion: null,
    isSearchingFlights: false,
    isLoadingSuggestion: false,
    flightError: null,
    noFlightsMessage: null,
    suggestionError: null,
    flightSource: 'live',
    flightDiagnostics: null,
    suggestionDiagnostics: null,
    hasSearched: true,
    setOrigin: jest.fn(),
    setDestination: jest.fn(),
    searchRoute: jest.fn().mockResolvedValue(undefined),
    retrySuggestion: jest.fn().mockResolvedValue(undefined),
    clearResults: jest.fn(),
    ...overrides,
});

describe('Home', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('refreshes live DUB to PAR flights on mount', () => {
        const searchRoute = jest.fn().mockResolvedValue(undefined);
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({ searchRoute }));

        render(<Home />);

        expect(searchRoute).toHaveBeenCalledWith({ refreshFlights: true, date: '2026-06-01' });
        expect(screen.getByRole('heading', { name: /start with the flight\. trust the real price\./i })).toBeInTheDocument();
    });

    it('shows the honest price and catch before any softer marketing copy', () => {
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            flights: [
                {
                    origin: 'DUB',
                    destination: 'PAR',
                    departureDate: '2026-06-01T07:10:00Z',
                    arrivalDate: '2026-06-01T09:35:00Z',
                    price: 99,
                    currency: 'EUR',
                    flightNumber: 'FR 24',
                    antiCauchemar: {
                        realWorldEntryPrice: 142,
                        hiddenCostPenalty: 19,
                        theCatch: 'Late arrival means the airport transfer is usually a taxi after midnight.',
                        logisticVerdict: 'Cheap on paper, sharper in the real world.',
                        currency: 'EUR',
                    },
                },
            ],
            flightDiagnostics: diagnostics,
        }));

        render(<Home />);

        expect(screen.getByText((content, element) => content === '€142' && element?.classList.contains('flight-card__price') === true)).toBeInTheDocument();
        expect(screen.getAllByText(/real-world entry price/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/late arrival means the airport transfer is usually a taxi after midnight\./i)).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('Base fare:') && content.includes('99'))).toBeInTheDocument();
    });
});




