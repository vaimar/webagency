import type { MockedFunction } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useNearbyPois } from './useNearbyPois';
import { fetchNearbyPois } from '../services/mapMarkers';

vi.mock('../services/mapMarkers', async () => ({
    ...(await vi.importActual<typeof import('../services/mapMarkers')>('../services/mapMarkers')),
    fetchNearbyPois: vi.fn(),
}));

const mockFetch = fetchNearbyPois as MockedFunction<typeof fetchNearbyPois>;

const poi = (id: number, kind: 'restaurant' | 'shop' = 'restaurant') => ({
    id, name: `Place ${id}`, lat: 1, lon: 2, kind,
});

/**
 * These cover the map layer in SpotFinder, which cannot be driven in a headless
 * browser — it draws into a WebGL canvas with no DOM to click. The spot page
 * uses the same hook and was verified end to end against the live backend.
 */
describe('useNearbyPois', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('does not fetch while disabled', () => {
        renderHook(() => useNearbyPois(45.7, 5.8, false));
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not fetch without coordinates', () => {
        renderHook(() => useNearbyPois(null, null, true));
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports done with the results', async () => {
        mockFetch.mockResolvedValue([poi(1), poi(2)]);

        const { result } = renderHook(() => useNearbyPois(45.7, 5.8, true));

        await waitFor(() => expect(result.current.status).toBe('done'));
        expect(result.current.pois).toHaveLength(2);
    });

    it('distinguishes "found nothing" from "still loading"', async () => {
        mockFetch.mockResolvedValue([]);

        const { result } = renderHook(() => useNearbyPois(45.7, 5.8, true));

        // The old code left this indistinguishable from loading forever.
        await waitFor(() => expect(result.current.status).toBe('done'));
        expect(result.current.pois).toEqual([]);
    });

    it('reports an error instead of an empty list when the lookup fails', async () => {
        mockFetch.mockRejectedValue(new Error('Nearby POI lookup failed with status 500'));

        const { result } = renderHook(() => useNearbyPois(45.7, 5.8, true));

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.pois).toEqual([]);
    });

    it('refetches for a new coordinate instead of keeping the previous results', async () => {
        mockFetch.mockResolvedValueOnce([poi(1)]).mockResolvedValueOnce([poi(2), poi(3)]);

        const { result, rerender } = renderHook(
            ({ lat, lon }) => useNearbyPois(lat, lon, true),
            { initialProps: { lat: 45.7, lon: 5.8 } },
        );

        await waitFor(() => expect(result.current.pois).toHaveLength(1));

        // The spot page reuses this component when only the :slug changes, so
        // this is exactly the case that used to show the previous spot's data.
        rerender({ lat: 49.9, lon: 2.2 });

        await waitFor(() => expect(result.current.pois).toHaveLength(2));
        expect(mockFetch).toHaveBeenLastCalledWith(49.9, 2.2);
    });

    it('retries after a failure', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('Failed to fetch'))
            .mockResolvedValueOnce([poi(9)]);

        const { result } = renderHook(() => useNearbyPois(45.7, 5.8, true));
        await waitFor(() => expect(result.current.status).toBe('error'));

        act(() => result.current.retry());

        await waitFor(() => expect(result.current.status).toBe('done'));
        expect(result.current.pois).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not refetch on an unrelated re-render', async () => {
        mockFetch.mockResolvedValue([poi(1)]);

        const { result, rerender } = renderHook(() => useNearbyPois(45.7, 5.8, true));
        await waitFor(() => expect(result.current.status).toBe('done'));

        rerender();
        rerender();

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('ignores a response that lands after the coordinates moved on', async () => {
        let resolveFirst: (value: ReturnType<typeof poi>[]) => void = () => undefined;
        mockFetch
            .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
            .mockResolvedValueOnce([poi(2)]);

        const { result, rerender } = renderHook(
            ({ lat, lon }) => useNearbyPois(lat, lon, true),
            { initialProps: { lat: 45.7, lon: 5.8 } },
        );

        rerender({ lat: 49.9, lon: 2.2 });
        await waitFor(() => expect(result.current.pois).toHaveLength(1));

        // The slow first lookup must not overwrite the second spot's results.
        await act(async () => { resolveFirst([poi(1), poi(3), poi(4)]); });

        expect(result.current.pois).toHaveLength(1);
        expect(result.current.pois[0].id).toBe(2);
    });
});
