import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapPoints, MapPointKind, TripMapPoint } from '../services/tripExploreSelectors';
import { getMapStyle, hasMapTilerKey } from '../services/mapStyle';
import { HotelResult, TripExplorationResponse } from '../types/tripExploration';

interface TripMapTabProps {
    trip: TripExplorationResponse;
    extraStays?: HotelResult[];
}

const KIND_STYLE: Record<MapPointKind, { color: string; label: string }> = {
    spot: { color: '#f472b6', label: 'Ride spot' },
    stay: { color: '#34d399', label: 'Stays' },
    activity: { color: '#7dd3fc', label: 'Activities' },
    restaurant: { color: '#fbbf24', label: 'Restaurants' },
};

// Stroke paths (24×24 viewBox, Lucide-style) drawn white on the kind color:
// waves = ride spot, bed = stay, compass = activity, cutlery = restaurant.
const KIND_ICON_PATHS: Record<MapPointKind, string[]> = {
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
    activity: [
        'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
        'm16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
    ],
    restaurant: [
        'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
        'M7 2v20',
        'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
    ],
};

// Shared by the DOM markers (innerHTML) and the React legend — one drawing
// per kind so the legend always previews exactly what's on the map.
const buildIconSvg = (kind: MapPointKind): string => {
    const paths = KIND_ICON_PATHS[kind]
        .map((d) => `<path d="${d}"/>`)
        .join('');
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#0b1220" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
};

// Real DOM node per marker (MapLibre paints the basemap on a <canvas> via
// WebGL but renders markers/popups as absolutely-positioned HTML elements
// layered on top — this is why they're built with document.createElement
// rather than passed as a Leaflet-style icon descriptor).
// MapLibre positions the outer element with an inline `transform`, so hover
// scaling lives on the inner badge — scaling the outer node would clobber the
// translate and teleport the marker.
const buildMarkerElement = (kind: MapPointKind, title: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'trip-map__marker';
    el.title = title;

    const badge = document.createElement('div');
    badge.className = `trip-map__marker-badge trip-map__marker-badge--${kind}`;
    badge.style.background = KIND_STYLE[kind].color;
    badge.innerHTML = buildIconSvg(kind);

    el.appendChild(badge);
    return el;
};

const buildPopupHtml = (point: TripMapPoint): string => {
    const container = document.createElement('div');
    container.className = 'trip-map__popup';

    const kindTag = document.createElement('span');
    kindTag.className = 'trip-map__popup-kind';
    kindTag.style.color = KIND_STYLE[point.kind].color;
    kindTag.textContent = KIND_STYLE[point.kind].label;
    container.appendChild(kindTag);

    const label = document.createElement('strong');
    label.textContent = point.label;
    container.appendChild(label);

    if (point.detail) {
        const detail = document.createElement('span');
        detail.className = 'trip-map__popup-detail';
        detail.textContent = point.detail;
        container.appendChild(detail);
    }
    return container.outerHTML;
};

const TripMapTab: React.FC<TripMapTabProps> = ({ trip, extraStays = [] }) => {
    const points = useMemo(() => getMapPoints(trip, extraStays), [trip, extraStays]);

    const legendKinds = useMemo(() => {
        const present = new Set(points.map((p) => p.kind));
        return (Object.keys(KIND_STYLE) as MapPointKind[]).filter((k) => present.has(k));
    }, [points]);

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    // State (not a ref) so the marker-sync effect re-runs once the map exists,
    // whatever order the effects fire in.
    const [map, setMap] = useState<maplibregl.Map | null>(null);

    // Mount-once map instantiation. This tab is conditionally rendered by the
    // dashboard (unmounted on tab switch, not just hidden), so "mount" and
    // "unmount" line up exactly with "tab opened" / "tab left" — the cleanup
    // below is what destroys the WebGL context each time the user navigates
    // away, instead of leaking one context per visit to this tab.
    useEffect(() => {
        if (!mapContainerRef.current || points.length === 0) {
            return undefined;
        }

        const initialCenter: [number, number] = [points[0].lon, points[0].lat];
        const instance = new maplibregl.Map({
            container: mapContainerRef.current,
            style: getMapStyle(),
            center: initialCenter,
            zoom: 13,
            attributionControl: { compact: true },
        });
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        // Parity with the previous Leaflet setup (scrollWheelZoom={false}) —
        // a scroll-jacked map inside a scrolling page is a bad experience.
        instance.scrollZoom.disable();
        setMap(instance);

        return () => {
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            instance.remove();
            setMap(null);
        };
        // Intentionally mount-once: `points` seeds only the initial center,
        // matching the old MapContainer's initial-only center/zoom props.
        // Live point updates are handled by the marker-sync effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Marker + viewport sync — reacts to point changes without tearing down
    // the map/WebGL context. Markers are DOM overlays, not style layers, so
    // they attach as soon as the map exists — no need to wait for the style's
    // 'load' event (which never fires at all if a basemap resource stalls).
    useEffect(() => {
        if (!map) {
            return;
        }

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = points.map((point) => {
            const popup = new maplibregl.Popup({ offset: 12 }).setHTML(buildPopupHtml(point));
            const marker = new maplibregl.Marker({ element: buildMarkerElement(point.kind, point.label) })
                .setLngLat([point.lon, point.lat])
                .setPopup(popup)
                .addTo(map);
            return marker;
        });

        if (points.length === 1) {
            map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: 14 });
        } else if (points.length > 1) {
            const bounds = points.reduce(
                (acc, point) => acc.extend([point.lon, point.lat]),
                new maplibregl.LngLatBounds([points[0].lon, points[0].lat], [points[0].lon, points[0].lat]),
            );
            map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
        }
    }, [points, map]);

    return (
        <article className="trip-explore-dashboard__card">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">On the map</p>
                    <h3 className="trip-explore-dashboard__card-title">Everything, geo-located</h3>
                </div>
                {points.length > 0 && (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {points.length} pins
                    </span>
                )}
            </div>

            {!hasMapTilerKey() && (
                <p className="trip-explore-dashboard__muted" role="status">
                    No MapTiler key configured (REACT_APP_MAPTILER_KEY) — showing the free OpenFreeMap basemap.
                </p>
            )}

            {points.length === 0 ? (
                <p className="trip-explore-dashboard__muted" role="status">
                    No mappable coordinates were returned for this destination yet.
                </p>
            ) : (
                <>
                    <div className="trip-explore-dashboard__map-legend">
                        {legendKinds.map((kind) => (
                            <span key={kind} className="trip-explore-dashboard__map-legend-item">
                                <span
                                    className="trip-explore-dashboard__map-legend-icon"
                                    style={{ background: KIND_STYLE[kind].color }}
                                    // Static, self-authored SVG string shared with the map markers.
                                    dangerouslySetInnerHTML={{ __html: buildIconSvg(kind) }}
                                />
                                {KIND_STYLE[kind].label}
                            </span>
                        ))}
                    </div>

                    <div className="trip-explore-dashboard__map" ref={mapContainerRef} />
                </>
            )}
        </article>
    );
};

export default TripMapTab;
