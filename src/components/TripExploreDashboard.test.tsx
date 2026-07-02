import React from 'react';
import { render, screen } from '@testing-library/react';
import TripExploreDashboard, { TripExplorePayload } from './TripExploreDashboard';

// Payloads below mirror TripExplorationService.TripExplorationResponse exactly
// (Jackson camelCase): hotel details nested under `hotel`, distanceToActivityKm
// on the HiddenGemHotel wrapper, flight price as `ticketPrice`.

const orchestratedPayload: TripExplorePayload = {
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
    ],
};

describe('TripExploreDashboard contract mapping', () => {
    it('renders flight ticketPrice, honest total, and door-to-trip from the real backend fields', () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);

        expect(screen.getByText('€40')).toBeInTheDocument();
        expect(screen.getByText(/Honest total · €112/)).toBeInTheDocument();
        expect(screen.getByText(/Door-to-trip · €131/)).toBeInTheDocument();
        expect(screen.queryByText('Rate pending')).not.toBeInTheDocument();
        expect(screen.getByText(/~25 min to center/)).toBeInTheDocument();
    });

    it('renders nested hotel price/rating and wrapper-level distance with one decimal', () => {
        render(<TripExploreDashboard tripData={orchestratedPayload} />);

        expect(screen.getByText('Hôtel La Lavande')).toBeInTheDocument();
        expect(screen.getByText('€84')).toBeInTheDocument();
        expect(screen.getByText('4.6★')).toBeInTheDocument();
        expect(screen.getByText('0.1 km')).toBeInTheDocument();
        expect(screen.queryByText('0 km')).not.toBeInTheDocument();
        expect(screen.queryByText('—')).not.toBeInTheDocument();
    });

    it('falls back to the distance inside selectionReason when distanceToActivityKm is missing', () => {
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

        expect(screen.getByText('0.4 km')).toBeInTheDocument();
    });

    it('surfaces DEGRADED status, fallback warnings, and cached price labels instead of failing silently', () => {
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
                    bestUnifiedFlight: {
                        ...orchestratedPayload.bestUnifiedFlight,
                        source: 'ryanair_cache',
                        sourceLabel: 'Ryanair cache',
                        ticketPrice: 54,
                        priceLabel: 'Estimated (Cached)',
                        antiCauchemar: {
                            ticketPrice: 54,
                            auditedTotalCost: 126.4,
                            currency: 'EUR',
                        },
                    },
                }}
            />,
        );

        expect(screen.getByText('DEGRADED')).toBeInTheDocument();
        expect(screen.getByText(/Orchestration status: DEGRADED/)).toBeInTheDocument();
        expect(screen.getByText(/SerpApi unavailable — Ryanair cache used \(fallback data\)/)).toBeInTheDocument();
        expect(screen.getByText('Estimated (Cached)')).toBeInTheDocument();
        expect(screen.getByText(/Ryanair · Ryanair cache/)).toBeInTheDocument();
        // The fallback model's own price is shown — never a dash.
        expect(screen.getByText('€54')).toBeInTheDocument();
    });

    it('treats unset backend primitives (ticketPrice 0, null pricePerNight) as pending, not €0', () => {
        render(
            <TripExploreDashboard
                tripData={{
                    ...orchestratedPayload,
                    bestUnifiedFlight: {
                        airline: 'Ryanair',
                        ticketPrice: 0,
                        realWorldEntryPrice: 0,
                    },
                    hiddenGemHotels: [
                        {
                            hotel: { name: 'Hôtel Sans Prix', pricePerNight: null, rating: 4.1 },
                            distanceToActivityKm: 1.3,
                            selectionReason: 'Nearby stay with a strong hidden-gem score (1.3 km away, composite score 0.55).',
                        },
                    ],
                }}
            />,
        );

        expect(screen.getAllByText('Rate pending')).toHaveLength(2);
        expect(screen.queryByText(/€0\b/)).not.toBeInTheDocument();
        expect(screen.getByText('1.3 km')).toBeInTheDocument();
    });

    it('renders an honest no-flight state instead of an invented trip', () => {
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

        expect(screen.getByText('No flight, no trip')).toBeInTheDocument();
        expect(screen.getByText('CITY_COORDINATES_UNAVAILABLE')).toBeInTheDocument();
    });
});
