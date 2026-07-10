import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapPoints, MapPointKind, TripMapPoint } from '../services/tripExploreSelectors';
import { getMapStyleUrl, hasMapTilerKey } from '../services/mapStyle';
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

// Real DOM node per marker (MapLibre paints the basemap on a <canvas> via
// WebGL but renders markers/popups as absolutely-positioned HTML elements
// layered on top — this is why they're built with document.createElement
// rather than passed as a Leaflet-style icon descriptor).
const buildMarkerElement = (kind: MapPointKind): HTMLDivElement => {
    const isSpot = kind === 'spot';
    const size = isSpot ? 22 : 16;
    const color = KIND_STYLE[kind].color;

    const el = document.createElement('div');
    el.className = 'trip-map__marker';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = '50%';
    el.style.background = color;
    el.style.border = '2px solid #0f172a';
    el.style.boxSizing = 'border-box';
    el.style.cursor = 'pointer';
    if (isSpot) {
        el.style.boxShadow = '0 0 0 4px rgba(244,114,182,0.35)';
    }
    return el;
};

const buildPopupHtml = (point: TripMapPoint): string => {
    const label = document.createElement('strong');
    label.textContent = point.label;
    const container = document.createElement('div');
    container.appendChild(label);
    if (point.detail) {
        container.appendChild(document.createElement('br'));
        container.appendChild(document.createTextNode(point.detail));
    }
    return container.innerHTML;
};

const TripMapTab: React.FC<TripMapTabProps> = ({ trip, extraStays = [] }) => {
    const points = useMemo(() => getMapPoints(trip, extraStays), [trip, extraStays]);

    const legendKinds = useMemo(() => {
        const present = new Set(points.map((p) => p.kind));
        return (Object.keys(KIND_STYLE) as MapPointKind[]).filter((k) => present.has(k));
    }, [points]);

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const [isStyleLoaded, setIsStyleLoaded] = useState(false);

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
        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: getMapStyleUrl(),
            center: initialCenter,
            zoom: 13,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        // Parity with the previous Leaflet setup (scrollWheelZoom={false}) —
        // a scroll-jacked map inside a scrolling page is a bad experience.
        map.scrollZoom.disable();
        map.on('load', () => setIsStyleLoaded(true));
        mapRef.current = map;

        return () => {
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            map.remove();
            mapRef.current = null;
            setIsStyleLoaded(false);
        };
        // Intentionally mount-once: `points` seeds only the initial center,
        // matching the old MapContainer's initial-only center/zoom props.
        // Live point updates are handled by the marker-sync effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Marker + viewport sync — reacts to point changes without tearing down
    // the map/WebGL context. Waits for 'load' so markers land on a ready map.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isStyleLoaded) {
            return;
        }

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = points.map((point) => {
            const popup = new maplibregl.Popup({ offset: 12 }).setHTML(buildPopupHtml(point));
            const marker = new maplibregl.Marker({ element: buildMarkerElement(point.kind) })
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
            map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
        }
    }, [points, isStyleLoaded]);

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
                                    className="trip-explore-dashboard__map-legend-dot"
                                    style={{ background: KIND_STYLE[kind].color }}
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
