import { API_BASE } from './api';
import { trackedFetch } from './serviceStatus';

export type MapMarkerKind = 'spot' | 'stay' | 'transport' | 'restaurant' | 'shop';

export const MAP_MARKER_COLOR: Record<MapMarkerKind, string> = {
    spot: '#f472b6',
    stay: '#34d399',
    transport: '#7dd3fc',
    restaurant: '#fbbf24',
    shop: '#a78bfa',
};

const ICON_PATHS: Record<MapMarkerKind, string[]> = {
    spot: [
        'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
        'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
        'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    ],
    stay: [
        'M2 4v16',
        'M2 8h18a2 2 0 0 1 2 2v10',
        'M2 17h20',
        'M6 8v9',
    ],
    transport: [
        'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.6 1.1.3l.5-.3c.4-.2.6-.6.5-1.1z',
    ],
    restaurant: [
        'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
        'M7 2v20',
        'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
    ],
    shop: [
        'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z',
        'M3 6h18',
        'M16 10a4 4 0 0 1-8 0',
    ],
};

export const buildMapIconSvg = (kind: MapMarkerKind): string => {
    const paths = ICON_PATHS[kind]
        .map((d) => `<path d="${d}"/>`)
        .join('');
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#0b1220" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
};

export const buildMapMarker = (kind: MapMarkerKind, title: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'spot-map-pin';
    el.title = title;

    const badge = document.createElement('div');
    badge.className = `spot-map-pin__badge spot-map-pin__badge--${kind}`;
    badge.style.background = MAP_MARKER_COLOR[kind];
    badge.innerHTML = buildMapIconSvg(kind);

    el.appendChild(badge);
    return el;
};


// ─── Overpass POI fetch ─────────────────────────────────────────────────────

export interface MapPoi {
    id: number;
    name: string;
    lat: number;
    lon: number;
    kind: 'restaurant' | 'shop';
}

/** Radius the POI lookup covers. Exported so UI copy cannot claim a different one. */
export const POI_RADIUS_M = 5000;

/** Overpass is slow even warm — measured 5–11 s against the local backend. */
const POI_TIMEOUT_MS = 20_000;

/**
 * Fetch nearby restaurants and shops from the backend cache.
 * Results are cached for 7 days, so the first request pays the Overpass latency
 * and subsequent users get instant results.
 *
 * Throws on failure rather than returning []. It used to swallow every error
 * and hand back an empty array, which made "this area has no restaurants"
 * and "the lookup broke" the same value — so the UI could not tell the
 * difference and showed a loading message that never resolved.
 */
export const fetchNearbyPois = async (
    lat: number,
    lon: number,
    radiusM = POI_RADIUS_M,
    signal?: AbortSignal,
): Promise<MapPoi[]> => {
    // radiusM was accepted and then silently dropped from the URL, so callers
    // asking for a different radius quietly got the backend default.
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon), radiusM: String(radiusM) });

    // trackedFetch wraps the global fetch, which has no timeout of its own.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), POI_TIMEOUT_MS);

    try {
        const res = await trackedFetch(`${API_BASE}/api/spots/pois?${query.toString()}`, {
            signal: signal ?? timeout.signal,
        });
        if (!res.ok) {
            throw new Error(`Nearby POI lookup failed with status ${res.status}`);
        }
        const pois = await res.json();
        return Array.isArray(pois) ? pois : [];
    } finally {
        clearTimeout(timer);
    }
};
