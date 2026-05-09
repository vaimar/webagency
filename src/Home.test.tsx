import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home';
import { getAirportDisplay } from './data/airportMetadata';
import { useRouteSearch } from './hooks/useRouteSearch';
import { fetchFlightDestinations } from './services/flightService';

jest.mock('./hooks/useRouteSearch');
jest.mock('./services/flightService');
jest.mock('./components/FlightDestinationCard', () => {
    const React = require('react');
    const { getAirportDisplay: getAirport } = require('./data/airportMetadata');

    return function MockFlightDestinationCard(props: any) {
        const airport = getAirport(props.destination.destination);
        return React.createElement(
            'button',
            {
                type: 'button',
                onClick: props.onSelect,
            },
            `${airport.city}${props.showsDateMatch ? ' This fare matches your selected date' : ''}`,
        );
    };
});

const mockedUseRouteSearch = useRouteSearch as jest.MockedFunction<typeof useRouteSearch>;
const mockedFetchFlightDestinations = fetchFlightDestinations as jest.MockedFunction<typeof fetchFlightDestinations>;

const landingDestinations = [
    {
        type: 'flight-destination',
        origin: 'DUB',
        destination: 'BVA',
        departureDate: '2026-06-01',
        returnDate: '2026-06-05',
        price: { total: '69.00', currency: 'EUR' },
        antiCauchemar: {
            realWorldEntryPrice: 112,
            hiddenCostPenalty: 28,
            theCatch: 'This is the Ryanair Paris truth: Beauvais is outside the city and late transfers can erase the cheap headline fare.',
            logisticVerdict: 'A sharp entry price only stays honest if you budget the Beauvais coach or a late taxi.',
            currency: 'EUR',
        },
        links: {
            flightDates: 'https://example.com/flights/paris-beauvais/dates',
            flightOffers: 'https://example.com/flights/paris-beauvais/offers',
        },
    },
];

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
        mockedFetchFlightDestinations.mockResolvedValue({
            destinations: landingDestinations,
            fetchedAt: '2026-05-09T10:00:00.000Z',
            source: 'live',
        });
    });

    it('loads live DUB landing fares on mount without auto-searching the route form', async () => {
        const searchRoute = jest.fn().mockResolvedValue(undefined);
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({ searchRoute }));

        render(<Home />);

        await waitFor(() => expect(mockedFetchFlightDestinations).toHaveBeenCalledWith({ origin: 'DUB', maxPrice: 260 }));
        expect(searchRoute).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: /start with the flight\. trust the real route\./i })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: new RegExp(getAirportDisplay('BVA').city, 'i') })).toBeInTheDocument();
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

        await userEvent.click(await screen.findByRole('button', { name: /paris beauvais/i }));

        expect(setOrigin).toHaveBeenCalledWith('DUB');
        expect(setDestination).toHaveBeenCalledWith('BVA');
        expect(setDepartureDate).toHaveBeenCalledWith('2026-06-01');
        expect(setReturnDate).toHaveBeenCalledWith('2026-06-05');
    });

    it('shows the honest price with the actual ryanair airport label for paris routes', async () => {
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

        expect(await screen.findByText(/selected fare/i)).toBeInTheDocument();
        expect(screen.getByText((content, element) => content === '€142' && element?.classList.contains('flight-card__price') === true)).toBeInTheDocument();
        expect(screen.getAllByText(/real-world entry price/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/paris beauvais/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/flight fr 24 to paris beauvais/i)).toBeInTheDocument();
        expect(screen.getByText(/2026-06-01 → 2026-06-05/i)).toBeInTheDocument();
        expect(screen.getByText(/this fare matches your selected date/i)).toBeInTheDocument();
        expect(screen.getByText(/late arrival means the airport transfer is usually a taxi after midnight\./i)).toBeInTheDocument();
        expect(screen.getByText('€99')).toHaveClass('flight-card__marketing-price');
        expect(screen.getByRole('button', { name: /build honest guide/i })).toBeInTheDocument();
    });

    it('shows the honest empty state when no landing fares are returned', async () => {
        mockedFetchFlightDestinations.mockResolvedValue({
            destinations: [],
            fetchedAt: '2026-05-09T10:00:00.000Z',
            source: 'live',
            notice: 'No Honest Routes Found. No flight data means no trip guide.',
        });
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({ hasSearched: false }));

        render(<Home />);

        expect(await screen.findByRole('heading', { name: /no honest routes found/i })).toBeInTheDocument();
        expect(screen.getByText(/no flight data means no trip guide/i)).toBeInTheDocument();
    });
});




