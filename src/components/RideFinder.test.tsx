import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { RideSpot, unverified } from '../data/rideSpots';
import { ExploreFetcher } from '../services/tripSearch';
import { TripExplorationResponse } from '../types/tripExploration';
import RideFinder from './RideFinder';

const NOW = new Date('2026-09-11T09:00:00Z');

const verified = <T, >(value: T) => ({
    value, status: 'VERIFIED' as const, sourceUrl: 'https://e.test/v', checkedOn: '2026-09-01',
});

const SPOTS: RideSpot[] = [{
    label: 'Ibiza',
    arrivalAirport: 'IBZ',
    activity: 'wakeboard',
    surface: verified('cable' as const),
    beginnerFriendly: verified(true),
    climateBand: verified('warm' as const),
    openingSeason: verified('year_round' as const),
    cableCount: unverified<number>(),
    skillFloor: unverified(),
    sessionPrice: unverified(),
}];

const payload: TripExplorationResponse = {
    originAirport: 'DUB',
    resolvedArrivalAirport: 'IBZ',
    routeAvailable: true,
    orchestrationStatus: 'OK',
    unifiedFlights: [{
        ticketPrice: 89,
        stops: 0,
        scheduledArrival: '2026-09-18T16:10:00',
        antiCauchemar: { ticketPrice: 89, auditedTotalCost: 312, currency: 'EUR' },
    }],
    primaryActivity: { name: 'Cable', distanceKm: 4.2 },
};

const fetcher: ExploreFetcher = async () => payload;

const profileContext = { homeAddress: 'Dublin' };

describe('RideFinder', () => {
    it('shows the search box and real catalogue examples when idle', () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        expect(screen.getByPlaceholderText(/where do you want to ride/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cable park only/i })).toBeInTheDocument();
    });

    it('runs a search and renders a backed option with its status badge', async () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText('Ibiza')).toBeInTheDocument());
        expect(screen.getByText(/312/)).toBeInTheDocument();
        expect(screen.getByText(/estimated/i)).toBeInTheDocument();
        expect(screen.getByText(/4\.2 km to the water/i)).toBeInTheDocument();
    });

    it('marks assumed chips so the user can see what we filled in', async () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText('Ibiza')).toBeInTheDocument());
        const originChip = screen.getByRole('button', { name: /From DUB/i });
        expect(originChip.className).toContain('ride-finder__chip--assumed');
    });

    it('asks for an origin rather than guessing when there is no profile', async () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText(/where are you flying from/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Dublin' })).toBeInTheDocument();
    });

    it('offers the computed relaxation instead of an empty page', async () => {
        const noRoute: ExploreFetcher = async () => ({ routeAvailable: false });
        render(<RideFinder fetcher={noRoute} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText(/nothing we can back/i)).toBeInTheDocument());
    });

    it('surfaces a degraded backend rather than showing prices as solid', async () => {
        const degraded: ExploreFetcher = async () => ({ ...payload, orchestrationStatus: 'DEGRADED' });
        render(<RideFinder fetcher={degraded} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText(/backend was degraded/i)).toBeInTheDocument());
    });

    // Regression: this chip used to clear weightProfile to null and crash,
    // because every chip was cleared the same way. Ranking always has a value.
    it('cycles the ranking chip instead of clearing it', async () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));
        await waitFor(() => expect(screen.getByText('Ibiza')).toBeInTheDocument());

        expect(screen.getByRole('button', { name: /Ranked: balanced/i })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Ranked:/i }));
        await waitFor(() => expect(screen.getByRole('button', { name: /Ranked: cheapest honest/i })).toBeInTheDocument());

        // The chip label updates immediately, but the edit re-runs the
        // fan-out — wait for that to land before asserting on the results.
        await waitFor(() => expect(screen.getByText('Ibiza')).toBeInTheDocument());
        expect(screen.getByText(/confidence:/i)).toBeInTheDocument();
    });

    it('always states its confidence', async () => {
        render(<RideFinder fetcher={fetcher} spots={SPOTS} now={NOW} profileContext={profileContext} />);

        await userEvent.click(screen.getByRole('button', { name: /find trips/i }));

        await waitFor(() => expect(screen.getByText(/confidence:/i)).toBeInTheDocument());
    });
});
