import { vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RideSpot, RideSurface, unverified } from '../data/rideSpots';
import { normalizeTripIntent, ResolvedIntent } from '../services/tripIntent';
import { TripExplorationResponse } from '../types/tripExploration';
import { ExploreFetcher } from '../services/tripSearch';
import { useRideFinder } from './useRideFinder';

const NOW = new Date('2026-09-11T09:00:00Z');

const verified = <T, >(value: T) => ({
    value, status: 'VERIFIED' as const, sourceUrl: 'https://e.test/v', checkedOn: '2026-09-01',
});

const curated = (label: string, airport: string, climate: 'warm' | 'cold' = 'warm'): RideSpot => ({
    label,
    arrivalAirport: airport,
    activity: 'wakeboard',
    surface: verified('cable' as const),
    beginnerFriendly: verified(true),
    climateBand: verified(climate),
    openingSeason: verified('year_round' as const),
    cableCount: unverified(),
    skillFloor: unverified(),
    sessionPrice: unverified(),
    operating: unverified<boolean>(),
});

const SPOTS = [curated('Ibiza', 'IBZ'), curated('EXO 84', 'MRS', 'cold')];

const payload = (total: number): TripExplorationResponse => ({
    originAirport: 'DUB',
    resolvedArrivalAirport: 'IBZ',
    routeAvailable: true,
    orchestrationStatus: 'OK',
    unifiedFlights: [{
        ticketPrice: 89,
        stops: 0,
        scheduledArrival: '2026-09-18T16:10:00',
        antiCauchemar: { ticketPrice: 89, auditedTotalCost: total, currency: 'EUR' },
    }],
});

const okFetcher: ExploreFetcher = async (request) =>
    payload(request.destination === 'Ibiza' ? 312 : 268);

const intentOf = (overrides: Partial<ResolvedIntent> = {}): ResolvedIntent => ({
    ...normalizeTripIntent({ origin: 'DUB' }).intent,
    ...overrides,
});

const setup = (fetcher: ExploreFetcher = okFetcher) =>
    renderHook(() => useRideFinder({ fetcher, spots: SPOTS, now: NOW }));

describe('useRideFinder', () => {
    it('starts idle', () => {
        expect(setup().result.current.state.status).toBe('idle');
    });

    it('runs a search and lands on results', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        expect(result.current.state.status).toBe('results');
        if (result.current.state.status === 'results') {
            expect(result.current.state.result!.options.length).toBeGreaterThan(0);
            expect(result.current.state.quality).toBe('full');
        }
    });

    it('asks the one blocking question instead of guessing an origin', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.submitIntent(intentOf({ origin: null }));
        });

        expect(result.current.state.status).toBe('needs_answer');
        if (result.current.state.status === 'needs_answer') {
            expect(result.current.state.followUp.field).toBe('origin');
        }
    });

    it('answers a follow-up and proceeds without asking again', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.submitIntent(intentOf({ origin: null }));
        });
        await act(async () => {
            result.current.answerFollowUp('DUB');
        });

        await waitFor(() => expect(result.current.state.status).toBe('results'));
    });

    // The rule the whole hook exists to enforce.
    it('re-enters at searching on a chip edit — never re-parses', async () => {
        const parser = vi.fn(async () => ({ origin: 'DUB' }));
        const { result } = renderHook(() => useRideFinder({
            parser, fetcher: okFetcher, spots: SPOTS, now: NOW,
        }));

        await act(async () => {
            await result.current.submitText('cable park somewhere');
        });
        expect(parser).toHaveBeenCalledTimes(1);

        await act(async () => {
            result.current.updateChip('partySize', 4);
        });
        await waitFor(() => expect(result.current.state.status).toBe('results'));

        // A chip edit must not reach the parser.
        expect(parser).toHaveBeenCalledTimes(1);
        expect(result.current.intent?.partySize).toBe(4);
    });

    it('marks an edited chip as user-sourced so it stops rendering as assumed', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.submitIntent(intentOf());
        });
        await act(async () => {
            result.current.updateChip('nights', 3);
        });

        await waitFor(() => expect(result.current.intent?.sources.nights).toBe('user'));
    });

    it('reports per-candidate progress rather than one silence', async () => {
        const seen: Array<Record<string, string>> = [];
        let release: (() => void) | null = null;
        const gate = new Promise<void>((resolve) => { release = resolve; });

        const slowFetcher: ExploreFetcher = async (request) => {
            if (request.destination === 'EXO 84') {
                await gate;
            }
            return payload(300);
        };

        const { result } = setup(slowFetcher);

        act(() => { void result.current.submitIntent(intentOf({ rideSurface: 'cable' })); });

        await waitFor(() => expect(result.current.state.status).toBe('searching'));
        if (result.current.state.status === 'searching') {
            seen.push({ ...result.current.state.progress });
            expect(Object.keys(result.current.state.progress).sort()).toEqual(['EXO 84', 'Ibiza']);
        }

        await act(async () => {
            release?.();
            await gate;
        });

        await waitFor(() => expect(result.current.state.status).toBe('results'));
        expect(seen[0]['Ibiza']).toBeDefined();
    });

    it('lands on no_backing, not empty results, when nothing is backed', async () => {
        const noRoute: ExploreFetcher = async () => ({ routeAvailable: false });
        const { result } = setup(noRoute);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        expect(result.current.state.status).toBe('no_backing');
    });

    it('blocks rather than widening when the catalogue cannot answer a filter', async () => {
        const unverifiedSpots: RideSpot[] = [{ ...curated('Ibiza', 'IBZ'), surface: unverified<RideSurface>() }];
        const { result } = renderHook(() => useRideFinder({
            fetcher: okFetcher, spots: unverifiedSpots, now: NOW,
        }));

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        expect(result.current.state.status).toBe('no_backing');
        if (result.current.state.status === 'no_backing') {
            expect(result.current.state.plan.blocked?.relaxation).not.toBeNull();
        }
    });

    it('applies the planner relaxation and finds results', async () => {
        const unverifiedSpots: RideSpot[] = [{ ...curated('Ibiza', 'IBZ'), surface: unverified<RideSurface>() }];
        const { result } = renderHook(() => useRideFinder({
            fetcher: okFetcher, spots: unverifiedSpots, now: NOW,
        }));

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });
        await act(async () => {
            result.current.applyRelaxation();
        });

        await waitFor(() => expect(result.current.state.status).toBe('results'));
        expect(result.current.intent?.rideSurface).toBeNull();
    });

    it('marks a degraded backend on the results state', async () => {
        const degraded: ExploreFetcher = async () => ({ ...payload(300), orchestrationStatus: 'DEGRADED' });
        const { result } = setup(degraded);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        if (result.current.state.status === 'results') {
            expect(result.current.state.quality).toBe('degraded');
        } else {
            throw new Error(`expected results, got ${result.current.state.status}`);
        }
    });

    it('surfaces a thrown search failure as an error state', async () => {
        const broken: ExploreFetcher = async () => { throw new Error('backend down'); };
        const { result } = setup(broken);

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });

        // Every call failed, so nothing is backed.
        expect(result.current.state.status).toBe('no_backing');
    });

    it('resets to idle', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.submitIntent(intentOf({ rideSurface: 'cable' }));
        });
        act(() => { result.current.reset(); });

        expect(result.current.state.status).toBe('idle');
    });
});
