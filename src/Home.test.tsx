import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home';
import { useRouteSearch } from './hooks/useRouteSearch';
import { fetchFlightDestinations } from './services/flightService';
import { getHotelsNearby } from './services/api';

jest.mock('./hooks/useRouteSearch');
jest.mock('./services/flightService');
jest.mock('./services/api', () => ({
    ...jest.requireActual('./services/api'),
    getHotelsNearby: jest.fn(),
}));
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
const mockedGetHotelsNearby = getHotelsNearby as jest.MockedFunction<typeof getHotelsNearby>;

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
            airportShuttleEstimate: 28,
            cabinBagEstimate: 15,
            hiddenCostPenalty: 28,
            auditedTotalCost: 112,
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
    url: 'https://slumber-production.up.railway.app/api/flight-search/routes?from=DUB&to=BVA&provider=serpapi',
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
    flightNotice: null,
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
        mockedGetHotelsNearby.mockResolvedValue({
            diagnostics: {
                url: 'https://slumber-production.up.railway.app/api/hotels/nearby?lat=48.8566&lon=2.3522&radius=2600',
                method: 'GET',
                ok: true,
                status: 200,
                statusText: 'OK',
                durationMs: 92,
                timestamp: '2026-05-09T10:00:01.000Z',
            },
            hotels: [
                {
                    xid: 'hotel-1',
                    name: 'Canal Base Hotel',
                    pricePerNight: 109,
                    priceCurrency: 'EUR',
                    rating: 4.2,
                    reviewsCount: 340,
                    bookingLink: 'https://example.com/hotel-1',
                    provider: 'opentripmap+serpapi',
                },
            ],
        });
    });

    it('loads live DUB landing fares on mount without auto-searching the route form', async () => {
        const searchRoute = jest.fn().mockResolvedValue(undefined);
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({ searchRoute, hasSearched: false }));

        render(<Home />);

        await waitFor(() => expect(mockedFetchFlightDestinations).toHaveBeenCalledWith({ origin: 'DUB', maxPrice: 260 }));
        expect(searchRoute).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: /start with the flight\. trust the real route\./i })).toBeInTheDocument();
        expect(screen.getByLabelText(/return \/ end of stay/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /wakeboarding/i })).toHaveAttribute('aria-pressed', 'true');
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

    it('shows live route proof and automatically triggers nearby hotel lookup for the selected flight', async () => {
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            state: { origin: 'DUB', destination: 'BVA', departureDate: '2026-06-01', returnDate: '2026-06-05' },
            flights: [
                {
                    origin: 'DUB',
                    destination: 'BVA',
                    departureDate: '2026-06-01T07:10:00Z',
                    arrivalDate: '2026-06-01T09:35:00Z',
                    price: 99,
                    currency: 'EUR',
                    flightNumber: 'FR 24',
                    antiCauchemar: {
                        realWorldEntryPrice: 142,
                        airportShuttleEstimate: 19,
                        cabinBagEstimate: 24,
                        auditedTotalCost: 142,
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

        expect(await screen.findByText(/selected route proof/i)).toBeInTheDocument();
        await waitFor(() => expect(mockedGetHotelsNearby).toHaveBeenCalled());
        expect(mockedGetHotelsNearby).toHaveBeenCalledWith(48.8566, 2.3522, 2600);
        expect(screen.getByText(/the catch/i)).toBeInTheDocument();
        expect(screen.getAllByText(/late arrival means the airport transfer is usually a taxi after midnight\./i).length).toBeGreaterThan(0);
        expect(screen.getByRole('heading', { name: /paris beauvais stays chained from the selected flight/i })).toBeInTheDocument();
        expect(screen.getAllByText(/canal base hotel/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/open live hotel rate/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /add local proof/i })).toBeInTheDocument();
    });

    it('passes first-mile car input into the flight search when enabled', async () => {
        const searchRoute = jest.fn().mockResolvedValue(undefined);
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            state: { origin: 'DUB', destination: 'NCE', departureDate: '2026-05-26', returnDate: '2026-05-28' },
            searchRoute,
            hasSearched: false,
        }));

        render(<Home />);

        await userEvent.click(screen.getByLabelText(/i know my home → airport travel/i));
        await userEvent.clear(screen.getByLabelText(/cost to airport/i));
        await userEvent.type(screen.getByLabelText(/cost to airport/i), '42');
        await userEvent.clear(screen.getByLabelText(/travel time/i));
        await userEvent.type(screen.getByLabelText(/travel time/i), '150');
        await userEvent.click(screen.getByRole('button', { name: /find honest flight proof/i }));

        expect(searchRoute).toHaveBeenCalledWith({
            firstMile: {
                firstMileAmount: 42,
                firstMileDurationMinutes: 150,
                firstMileMode: 'rental_car',
                firstMileStatus: 'USER_PROVIDED',
                firstMileNote: 'Limerick to Dublin by car',
            },
        });
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

    it('shows the next-available notice and hides the discovery board once a manual search has started', () => {
        mockedUseRouteSearch.mockReturnValue(createRouteSearchState({
            hasSearched: true,
            flightNotice: 'No one-way fare on 2026-06-01. Showing the next available SerpApi route on 2026-06-02.',
        }));

        render(<Home />);

        expect(screen.getByText(/showing the next available serpapi route on 2026-06-02/i)).toBeInTheDocument();
        expect(screen.queryByText(/frozen summer discovery board/i)).not.toBeInTheDocument();
    });
});

