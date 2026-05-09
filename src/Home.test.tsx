import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    state: { origin: '', destination: '', departureDate: '', returnDate: '' },
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
    setDepartureDate: jest.fn(),
    setReturnDate: jest.fn(),
    searchRoute: jest.fn().mockResolvedValue(undefined),
    retrySuggestion: jest.fn().mockResolvedValue(undefined),
    clearResults: jest.fn(),
    ...overrides,
});

describe('Home', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('does not auto-search on mount anymore', () => {
        const searchRoute = jest.fn().mockResolvedValue(undefined);
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({ searchRoute }));

        render(<Home />);

        expect(searchRoute).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: /start with the flight\. trust the real route\./i })).toBeInTheDocument();
        expect(screen.getAllByText(/paris beauvais/i).length).toBeGreaterThan(0);
    });

    it('clicking a suggested fare card populates the search fields', async () => {
        const setOrigin = jest.fn();
        const setDestination = jest.fn();
        const setDepartureDate = jest.fn();
        const setReturnDate = jest.fn();

        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            setOrigin,
            setDestination,
            setDepartureDate,
            setReturnDate,
            hasSearched: false,
        }));

        render(<Home />);

        await userEvent.click(screen.getAllByRole('button', { name: /paris beauvais/i })[0]);

        expect(setOrigin).toHaveBeenCalledWith('DUB');
        expect(setDestination).toHaveBeenCalledWith('BVA');
        expect(setDepartureDate).toHaveBeenCalledWith('2026-06-01');
        expect(setReturnDate).toHaveBeenCalledWith('2026-06-05');
    });

    it('shows the honest price with the actual ryanair airport label for paris routes', () => {
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            state: { origin: 'DUB', destination: 'BVA', departureDate: '2026-06-01', returnDate: '2026-06-05' },
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
        expect(screen.getAllByText(/paris beauvais/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/france/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/selected fare/i)).toBeInTheDocument();
        expect(screen.getByText(/2026-06-01 → 2026-06-05/i)).toBeInTheDocument();
        expect(screen.getByText(/this fare matches your selected date/i)).toBeInTheDocument();
        expect(screen.getByText(/late arrival means the airport transfer is usually a taxi after midnight\./i)).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('Base fare:') && content.includes('99'))).toBeInTheDocument();
    });
});




