import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripExploreDashboard from './TripExploreDashboard';
import { TripExplorationResponse } from '../types/tripExploration';

// Payloads mirror TripExplorationService.TripExplorationResponse exactly
// (Jackson camelCase): hotel details nested under `hotel`, distanceToActivityKm
// on the HiddenGemHotel wrapper, flight price as `ticketPrice`.

const orchestratedPayload: TripExplorationResponse = {
    originAirport: 'SNN',
    destination: 'EXO 84',
    travelDate: '2026-07-10',
    resolvedArrivalAirport: 'GVA',
    routeAvailable: true,
    orchestrationStatus: 'OK',
    orchestrationWarnings: [],
    bestUnifiedFlight: {
        source: 'serpapi',
        sourceLabel: 'SerpApi live',
        airline: 'Ryanair',
        flightNumber: 'FR 342',
        departureAirport: 'SNN',
        arrivalAirport: 'GVA',
        scheduledDeparture: '2026-07-10T18:20:00',
        scheduledArrival: '2026-07-10T21:35:00',
        ticketPrice: 39.99,
        realWorldEntryPrice: 112.4,
        doorToTripPrice: 131.2,
        priceLabel: 'Current',
        antiCauchemar: {
            ticketPrice: 39.99,
            auditedTotalCost: 112.4,
            currency: 'EUR',
            transferToCenterMinutes: 25,
            theCatch: 'Late arrival: last public transport leaves before landing.',
        },
    },
    unifiedFlights: [
        {
            source: 'serpapi',
            sourceLabel: 'SerpApi live',
            airline: 'Ryanair',
            flightNumber: 'FR 342',
            departureAirport: 'SNN',
            arrivalAirport: 'GVA',
            scheduledArrival: '2026-07-10T21:35:00',
            ticketPrice: 39.99,
            antiCauchemar: {
                ticketPrice: 39.99,
                auditedTotalCost: 112.4,
                currency: 'EUR',
                theCatch: 'Late arrival: last public transport leaves before landing.',
            },
        },
        {
            source: 'ryanair_cache',
            sourceLabel: 'Ryanair cache',
            airline: 'Ryanair',
            flightNumber: 'FR 998',
            departureAirport: 'SNN',
            arrivalAirport: 'GVA',
            scheduledArrival: '2026-07-10T15:00:00',
            ticketPrice: 29,
            priceLabel: 'Estimated (Cached)',
            antiCauchemar: { ticketPrice: 29, auditedTotalCost: 61, currency: 'EUR' },
        },
    ],
    flightComparison: {
        byProvider: {
            serpapi: [{ flightNumber: 'FR 342' }],
            ryanair_cache: [{ flightNumber: 'FR 998' }],
        },
        routeAvailable: true,
    },
    sameFlightComparisons: [
        {
            comparisonKey: 'FR 342',
            flightNumber: 'FR 342',
            quoteCount: 2,
            quotes: [
                { sourceLabel: 'SerpApi live', ticketPrice: 39.99, antiCauchemar: { currency: 'EUR' } },
                { sourceLabel: 'Ryanair cache', ticketPrice: 45, priceLabel: 'Estimated (Cached)', antiCauchemar: { currency: 'EUR' } },
            ],
        },
    ],
    primaryActivity: { name: 'EXO 84 Cable Park', distanceKm: 4.2 },
    hiddenGemHotels: [
        {
            hotel: {
                name: 'Hôtel La Lavande',
                pricePerNight: 84,
                priceCurrency: 'EUR',
                rating: 4.6,
                reviewsCount: 182,
            },
            compositeScore: 0.82,
            distanceToActivityKm: 0.1,
            selectionReason: 'High-service value near the activity spot (0.1 km away, 4.6/5 rating, 84 EUR/night).',
        },
        {
            hotel: {
                name: 'Auberge du Lac',
                pricePerNight: 52,
                priceCurrency: 'EUR',
                rating: 3.8,
            },
            compositeScore: 0.61,
            distanceToActivityKm: 2.4,
            selectionReason: 'Nearby stay with a strong hidden-gem score (2.4 km away, composite score 0.61).',
        },
    ],
};

const openTab = (name: RegExp) => userEvent.click(screen.getByRole('tab', { name }));

describe('TripExploreDashboard — overview tab', () => {
    it('renders flight ticketPrice, honest total, door-to-trip, and the best stay', () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);

        expect(screen.getByText('€40')).toBeInTheDocument();
        expect(screen.getByText(/Honest total · €112/)).toBeInTheDocument();
        expect(screen.getByText(/Door-to-trip · €131/)).toBeInTheDocument();
        expect(screen.getByText(/~25 min to center/)).toBeInTheDocument();

        // Best stay = first hidden gem (backend pre-sorts by composite score).
        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.getByText('€84')).toBeInTheDocument();
        expect(screen.getByText('4.6★')).toBeInTheDocument();
        expect(screen.getByText('0.1 km')).toBeInTheDocument();

        // Route timeline built from real fields only.
        expect(screen.getByText(/EXO 84 Cable Park/)).toBeInTheDocument();
        expect(screen.queryByText('—')).not.toBeInTheDocument();
    });

    it('renders an honest no-flight state instead of an invented trip', () => {
        render(
            <TripExploreDashboard
                tripData={{
                    destination: 'EXO 84',
                    routeAvailable: false,
                    orchestrationStatus: 'CITY_COORDINATES_UNAVAILABLE',
                    resolutionReason: 'City coordinates could not be resolved for EXO 84.',
                    bestUnifiedFlight: null,
                    hiddenGemHotels: [],
                }}
            />,
        );

        expect(screen.getByText('No flight, no trip')).toBeInTheDocument();
        expect(screen.getByText('City coordinates could not be resolved for EXO 84.')).toBeInTheDocument();
        // Raw backend enum is sanitized to shopper-friendly wording.
        expect(screen.getByText('Limited coverage')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Flights (0)' })).toBeInTheDocument();
    });

    it('treats unset backend primitives (ticketPrice 0, null pricePerNight) as pending, not €0', async () => {
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    bestUnifiedFlight: { airline: 'Ryanair', ticketPrice: 0, realWorldEntryPrice: 0 },
                    unifiedFlights: [],
                    hiddenGemHotels: [
                        {
                            hotel: { name: 'Hôtel Sans Prix', pricePerNight: null, rating: 4.1 },
                            distanceToActivityKm: 1.3,
                        },
                    ],
                }}
            />,
        );

        expect(screen.getAllByText('Rate pending').length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText(/€0\b/)).not.toBeInTheDocument();

        await openTab(/stays/i);
        expect(screen.getByText('1.3 km')).toBeInTheDocument();
        expect(screen.getByText('Rate pending')).toBeInTheDocument();
    });
});

describe('TripExploreDashboard — stays tab', () => {
    it('lists every gem with one-decimal distances and per-hotel currency', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/stays/i);

        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.getByText('Auberge du Lac')).toBeInTheDocument();
        expect(screen.getByText('0.1 km')).toBeInTheDocument();
        expect(screen.getByText('2.4 km')).toBeInTheDocument();
        expect(screen.getByText('€84')).toBeInTheDocument();
        expect(screen.getByText('€52')).toBeInTheDocument();
        expect(screen.queryByText('0 km')).not.toBeInTheDocument();
    });

    it('filters by minimum rating and reports hidden stays instead of dropping them silently', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/stays/i);

        await userEvent.selectOptions(screen.getByLabelText('Minimum rating'), '4');

        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.queryByText('Auberge du Lac')).not.toBeInTheDocument();
        expect(screen.getByText(/1 stay is hidden by the active filters/)).toBeInTheDocument();
        expect(screen.getByText('1 of 2 stays')).toBeInTheDocument();
    });

    it('falls back to the distance inside selectionReason when distanceToActivityKm is missing', async () => {
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    hiddenGemHotels: [
                        {
                            hotel: { name: 'Chalet Nord', pricePerNight: 96, priceCurrency: 'EUR' },
                            selectionReason: 'Nearby stay with a strong hidden-gem score (0.4 km away, composite score 0.71).',
                        },
                    ],
                }}
            />,
        );
        await openTab(/stays/i);

        expect(screen.getByText('0.4 km')).toBeInTheDocument();
    });
});

describe('TripExploreDashboard — flights tab', () => {
    it('shows all unified flights with provider labels and backend price labels', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/flights/i);

        expect(screen.getByText(/FR 342/)).toBeInTheDocument();
        expect(screen.getByText(/FR 998/)).toBeInTheDocument();
        expect(screen.getByText('Estimated (Cached)')).toBeInTheDocument();
        // Provider keys are humanized (raw enums stripped from the user view).
        expect(screen.getByText('serpapi (1)')).toBeInTheDocument();
        expect(screen.getByText('Ryanair · cached fare (1)')).toBeInTheDocument();
    });

    it('filters down to Anti-Cauchemar approved flights', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/flights/i);

        await userEvent.click(screen.getByRole('button', { name: 'Anti-Cauchemar approved' }));

        // FR 342 has theCatch + a 21:35 arrival is fine, but the catch disqualifies it.
        expect(screen.queryByText(/FR 342/)).not.toBeInTheDocument();
        expect(screen.getByText(/FR 998/)).toBeInTheDocument();
        expect(screen.getByText('1 of 2 routes')).toBeInTheDocument();
    });

    it('shows same-flight quotes so identical departures can be compared across providers', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/flights/i);

        expect(screen.getByText('Same flight · 2 quotes')).toBeInTheDocument();
        expect(screen.getByText('Ryanair cache · €45 · Estimated (Cached)')).toBeInTheDocument();
    });

    it('lets the user select a flight and drives the overview with that pick', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);
        await openTab(/flights/i);

        const targetRow = screen.getByText(/FR 998/).closest('.trip-explore-dashboard__flight-row') as HTMLElement;
        await userEvent.click(within(targetRow).getByRole('button', { name: 'Select flight' }));
        expect(within(targetRow).getByRole('button', { name: 'Selected ✓' })).toBeInTheDocument();

        await openTab(/overview/i);
        expect(screen.getByText('Your selected flight')).toBeInTheDocument();
        expect(screen.getByText('€29')).toBeInTheDocument();
        expect(screen.getByText(/Honest total · €61/)).toBeInTheDocument();
    });
});

describe('TripExploreDashboard — direct stays fallback', () => {
    it('renders labeled direct hotel-search results when the backend had no city coordinates', async () => {
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    destination: 'Ibiza',
                    orchestrationStatus: 'CITY_COORDINATES_UNAVAILABLE',
                    hiddenGemHotels: [],
                }}
                extraStays={[
                    { name: 'Hostal Talamanca', pricePerNight: 95, priceCurrency: 'EUR', rating: 4.2, provider: 'opentripmap+serpapi' },
                ]}
            />,
        );

        expect(screen.getByRole('tab', { name: 'Stays (1)' })).toBeInTheDocument();
        await openTab(/stays/i);

        expect(screen.getByText('1 direct results')).toBeInTheDocument();
        expect(screen.getByText(/Direct hotel search near Ibiza/)).toBeInTheDocument();
        expect(screen.getByText('Hostal Talamanca')).toBeInTheDocument();
        expect(screen.getByText('€95')).toBeInTheDocument();
    });
});

describe('TripExploreDashboard — fly-drive alternatives', () => {
    const dublinFlyDrive = {
        source: 'serpapi',
        sourceLabel: 'SerpApi live',
        airline: 'Ryanair',
        flightNumber: 'FR 1976',
        departureAirport: 'DUB',
        arrivalAirport: 'IBZ',
        scheduledDeparture: '2026-07-10T10:40:00',
        scheduledArrival: '2026-07-10T14:35:00',
        ticketPrice: 80,
        alternativeOrigin: true,
        originDriveMinutes: 120,
        originAccessNote: '🚗 Drive ~2h to Dublin Airport (DUB) to unlock direct routes and lower fares instead of multi-stop departures from Shannon (SNN).',
        antiCauchemar: { ticketPrice: 80, totalTravelTimeMinutes: 255, currency: 'EUR' },
    };

    const flyDrivePayload: TripExplorationResponse = {
        ...orchestratedPayload,
        destination: 'Ibiza',
        bestUnifiedFlight: dublinFlyDrive,
        unifiedFlights: [
            dublinFlyDrive,
            {
                source: 'serpapi',
                sourceLabel: 'SerpApi live',
                airline: 'Aer Lingus',
                flightNumber: 'EI 388',
                departureAirport: 'SNN',
                arrivalAirport: 'IBZ',
                scheduledArrival: '2026-07-11T23:00:00',
                ticketPrice: 555,
                antiCauchemar: { ticketPrice: 555, totalTravelTimeMinutes: 300, currency: 'EUR' },
            },
        ],
        sameFlightComparisons: [],
    };

    it('badges Dublin departures and shows the backend drive tip in the flights tab', async () => {
        render(<TripExploreDashboard tripData={flyDrivePayload} />);
        await openTab(/flights/i);

        expect(screen.getByText('Fly-Drive Alternative')).toBeInTheDocument();
        expect(screen.getByText(/Drive ~2h to Dublin Airport \(DUB\)/)).toBeInTheDocument();
        expect(screen.getByText(/Drive 2h00 to DUB/)).toBeInTheDocument();
        expect(screen.getByText(/Door-to-door 6h15 incl\. drive/)).toBeInTheDocument();
    });

    it('shows the drive leg on the overview timeline for a fly-drive best flight', () => {
        render(<TripExploreDashboard tripData={flyDrivePayload} />);

        expect(screen.getByText('Drive to hub')).toBeInTheDocument();
        expect(screen.getByText('~2h00 → DUB')).toBeInTheDocument();
        expect(screen.getByText(/Drive ~2h to Dublin Airport \(DUB\)/)).toBeInTheDocument();
        // €80 shows in both the flight hero and the door-to-trip package line.
        expect(screen.getAllByText('€80').length).toBeGreaterThan(0);
    });
});

describe('TripExploreDashboard — degraded orchestration', () => {
    it('surfaces the backend status and fallback warnings instead of failing silently', () => {
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    orchestrationStatus: 'DEGRADED',
                    orchestrationWarnings: [
                        {
                            source: 'flights',
                            kind: 'PROVIDER_UNAVAILABLE',
                            message: 'SerpApi unavailable — Ryanair cache used',
                            fallbackUsed: true,
                        },
                    ],
                }}
            />,
        );

        // DEGRADED is humanized to "Partial data" in both pill and banner.
        expect(screen.getAllByText('Partial data').length).toBeGreaterThan(0);
        expect(screen.getByText(/Orchestration status: Partial data/)).toBeInTheDocument();
        expect(screen.getByText(/SerpApi unavailable — Ryanair cache used \(fallback data\)/)).toBeInTheDocument();
    });
});

describe('TripExploreDashboard — verdict card', () => {
    const verdictCard = () => screen.getByRole('article', { name: 'Trip verdict' });

    it('leads with the honest door-to-door total, the channel saving, and the catches', () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);

        const card = verdictCard();
        // 112.4 flight + 3×84 stay + 108 food + 45 transport = €517.
        expect(within(card).getByText(/€517/)).toBeInTheDocument();
        expect(within(card).getByText('Save €5')).toBeInTheDocument();
        expect(within(card).getByText(/Same flight, €5 cheaper via SerpApi live/)).toBeInTheDocument();
        expect(within(card).getByText(/advertised €40 fare really costs €112/)).toBeInTheDocument();
        expect(within(card).getByText(/last public transport leaves before landing/)).toBeInTheDocument();
    });

    it('jumps to the flights tab from a saving row', async () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);

        await userEvent.click(within(verdictCard()).getByRole('button', { name: 'See flights →' }));

        expect(screen.getByRole('tab', { name: /flights/i })).toHaveAttribute('aria-selected', 'true');
    });

    it('headlines the fly-drive saving vs the home-airport fare', () => {
        const dublinFlyDrive = {
            flightNumber: 'FR 1976',
            departureAirport: 'DUB',
            arrivalAirport: 'IBZ',
            ticketPrice: 80,
            alternativeOrigin: true,
            originDriveMinutes: 120,
            antiCauchemar: { ticketPrice: 80, currency: 'EUR' },
        };
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    destination: 'Ibiza',
                    bestUnifiedFlight: dublinFlyDrive,
                    unifiedFlights: [
                        dublinFlyDrive,
                        {
                            flightNumber: 'EI 388',
                            departureAirport: 'SNN',
                            arrivalAirport: 'IBZ',
                            ticketPrice: 555,
                            antiCauchemar: { ticketPrice: 555, currency: 'EUR' },
                        },
                    ],
                    sameFlightComparisons: [],
                }}
            />,
        );

        const card = verdictCard();
        expect(within(card).getByText('Fly-drive via DUB — save €475')).toBeInTheDocument();
        expect(within(card).getByText('Save €475')).toBeInTheDocument();
        expect(within(card).getByText(/Cheapest from SNN is €555/)).toBeInTheDocument();
    });

    it('runs the self-transfer check in place and folds the saving into the verdict', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                origin: 'SNN',
                destination: 'GVA',
                directPriceEur: 532,
                options: [
                    {
                        hub: 'STN',
                        hubName: 'London Stansted',
                        connectionType: 'SAME_DAY',
                        totalEur: 154,
                        savingsVsDirectEur: 378,
                        leg1: { departureAirport: 'SNN', arrivalAirport: 'STN' },
                        leg2: { departureAirport: 'STN', arrivalAirport: 'GVA' },
                    },
                ],
            }),
        });
        (global as unknown as { fetch: unknown }).fetch = fetchMock;

        try {
            render(<TripExploreDashboard tripData={orchestratedPayload} />);

            await userEvent.click(within(verdictCard()).getByRole('button', { name: 'Check routing' }));

            expect(await screen.findByText('Self-transfer via London Stansted — save €378')).toBeInTheDocument();
            expect(fetchMock).toHaveBeenCalledWith('/api/trips/self-connect', expect.objectContaining({ method: 'POST' }));
            // The check ran in place — the user never left the overview.
            expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
        } finally {
            delete (global as unknown as { fetch?: unknown }).fetch;
        }
    });

    it('renders no verdict when there is no flight data to verdict on', () => {
        render(
            <TripExploreDashboard
                tripData={{
                    destination: 'EXO 84',
                    routeAvailable: false,
                    orchestrationStatus: 'CITY_COORDINATES_UNAVAILABLE',
                    bestUnifiedFlight: null,
                    hiddenGemHotels: [],
                }}
            />,
        );

        expect(screen.queryByRole('article', { name: 'Trip verdict' })).not.toBeInTheDocument();
    });
});
