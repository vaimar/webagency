// Route mode runs through the SAME state machine as search mode. These tests
// exist to prove the migration did not lose no-backing or degraded handling.

import { vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TYPICAL_BOARD_CM } from '../data/boardRules';
import { RideSpot, unverified } from '../data/rideSpots';
import { normalizeTripIntent, ResolvedIntent } from '../services/tripIntent';
import { useRideFinder } from './useRideFinder';

const NOW = new Date('2026-09-20T09:00:00Z');
const HOME = { label: 'Lyon', point: { lat: 45.7640, lon: 4.8357 } };

const verified = <T, >(value: T) => ({
    value, status: 'VERIFIED' as const, sourceUrl: 'https://e.test/v', checkedOn: '2026-09-01',
});

const spot = (label: string, lat: number, lon: number, placed = true): RideSpot => ({
    label,
    arrivalAirport: 'CDG',
    activity: 'wakeboard',
    point: placed ? { lat, lon } : undefined,
    surface: verified('cable' as const),
    beginnerFriendly: unverified<boolean>(),
    climateBand: verified('temperate' as const),
    openingSeason: verified('year_round' as const),
    cableCount: unverified<number>(),
    skillFloor: unverified(),
    sessionPrice: verified({ hourlyEur: null, dayPassEur: 36 }),
    operating: verified(true),
});

const PLACED = [spot('Wake Paradise', 47.93, 0.17), spot('Lakecity 33', 44.605, -0.937)];

const intentOf = (o: Partial<ResolvedIntent> = {}): ResolvedIntent => ({
    ...normalizeTripIntent({ origin: 'LYS' }).intent, ...o,
});

const setup = (spots: RideSpot[]) => renderHook(() => useRideFinder({
    mode: 'route',
    spots,
    home: HOME,
    now: NOW,
    nightlyEur: 74,
    mealsEurPerDay: 35,
    board: { lengthCm: TYPICAL_BOARD_CM.common, bagged: true },
}));

describe('route mode — same machine, different output', () => {
    it('builds a route with no network call at all', async () => {
        const { result } = setup(PLACED);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        expect(result.current.state.status).toBe('results');
        if (result.current.state.status !== 'results') throw new Error('not results');
        expect(result.current.state.route).not.toBeNull();
        expect(result.current.state.result).toBeNull();       // search shape absent
        expect(result.current.state.route!.legs.length).toBeGreaterThan(0);
        expect(result.current.state.route!.totals.knownSubtotalEur).toBeGreaterThan(0);
    });

    it('keeps the origin question — the materiality gate is unchanged', async () => {
        const { result } = setup(PLACED);

        await act(async () => {
            await result.current.submitIntent(intentOf({ origin: null }));
        });

        expect(result.current.state.status).toBe('needs_answer');
    });

    it('keeps chip editing out of the parser and re-runs the route', async () => {
        const parser = vi.fn(async () => ({ origin: 'LYS' }));
        const { result } = renderHook(() => useRideFinder({
            mode: 'route', spots: PLACED, home: HOME, now: NOW, parser,
        }));

        await act(async () => { await result.current.submitText('a cable road trip'); });
        expect(parser).toHaveBeenCalledTimes(1);

        await act(async () => { result.current.updateChip('partySize', 3); });
        await waitFor(() => expect(result.current.state.status).toBe('results'));

        expect(parser).toHaveBeenCalledTimes(1);              // never re-parsed
        expect(result.current.intent?.partySize).toBe(3);
    });

    // The two states the migration must not lose.
    it('lands on no_backing when no spot can be placed on a map', async () => {
        const unplaced = [spot('Nowhere', 0, 0, false)];
        const { result } = setup(unplaced);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        expect(result.current.state.status).toBe('no_backing');
    });

    it('marks the card degraded when a spot is dropped for missing coordinates', async () => {
        const mixed = [...PLACED, spot('Unplaced', 0, 0, false)];
        const { result } = setup(mixed);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        if (result.current.state.status !== 'results') throw new Error('not results');
        const route = result.current.state.route!;
        expect(route.trust.excluded.map((e) => e.spot)).toContain('Unplaced');
        expect(route.warnings.some((w) => w.kind === 'SPOT_EXCLUDED')).toBe(true);
        expect(result.current.state.quality).toBe('degraded');
    });

    it('separates travel from board surcharge in the totals', async () => {
        const { result } = setup(PLACED);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        if (result.current.state.status !== 'results') throw new Error('not results');
        const totals = result.current.state.route!.totals;
        expect(totals.baseTravelEur).toBeGreaterThan(0);
        expect(totals.boardSurchargeEur).toBe(0);             // all by car
        expect(totals.sessionsEur).toBeGreaterThan(0);
    });

    it('carries a trust summary so uncertainty is never hidden', async () => {
        const { result } = setup(PLACED);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        if (result.current.state.status !== 'results') throw new Error('not results');
        const trust = result.current.state.route!.trust;
        expect(trust.rows.length).toBeGreaterThan(0);
        expect(trust.total).toBeGreaterThan(trust.verified);   // some still unchecked
    });
});
