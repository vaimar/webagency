import { useCallback, useEffect, useState } from 'react';
import { MapPoi, fetchNearbyPois } from '../services/mapMarkers';

export type NearbyPoiStatus = 'idle' | 'loading' | 'done' | 'error';

export interface NearbyPoisResult {
    pois: MapPoi[];
    /**
     * 'done' with an empty `pois` is a real answer — the area has nothing
     * tagged — and is not the same as 'loading' or 'error'. Both callers used
     * to collapse all three into an empty array, so the spot page showed
     * "Looking for restaurants nearby..." forever and the map layer showed a
     * ticked checkbox with no pins and no explanation.
     */
    status: NearbyPoiStatus;
    retry: () => void;
}

/**
 * Nearby restaurants and shops for a coordinate.
 *
 * Keyed on the coordinates rather than a fetched-once ref. The ref both call
 * sites previously used was set on the first fetch and never reset, which meant
 * a failed or empty lookup could never be retried, and — on the spot page,
 * where the route reuses the component when only the :slug changes — the
 * previous spot's restaurants stayed on screen for the next spot.
 */
export const useNearbyPois = (
    lat: number | null | undefined,
    lon: number | null | undefined,
    enabled: boolean,
): NearbyPoisResult => {
    const [pois, setPois] = useState<MapPoi[]>([]);
    const [status, setStatus] = useState<NearbyPoiStatus>('idle');
    const [attempt, setAttempt] = useState(0);

    const retry = useCallback(() => setAttempt((current) => current + 1), []);

    useEffect(() => {
        if (!enabled || lat == null || lon == null) return undefined;

        let cancelled = false;
        setStatus('loading');

        fetchNearbyPois(lat, lon)
            .then((result) => {
                if (cancelled) return;
                setPois(result);
                setStatus('done');
            })
            .catch(() => {
                if (cancelled) return;
                setPois([]);
                setStatus('error');
            });

        return () => { cancelled = true; };
    }, [lat, lon, enabled, attempt]);

    return { pois, status, retry };
};
