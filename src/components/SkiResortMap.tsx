import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
    SkiHotelOverlayGroup,
    SkiMapLayerData,
    SkiResortDiscoveryFilters,
    SkiResortMarker,
    filterSkiResorts,
    formatSourceFileLabel,
    matchPlannerSlug,
} from '../services/skiMap';
import { getMapStyle, hasMapTilerKey } from '../services/mapStyle';
import './SkiResortMap.css';

type SkiLayer = 'resorts' | 'hotels';

const SOURCE_ID = 'ski-points';
const CLUSTER_LAYER = 'ski-clusters';
const CLUSTER_COUNT_LAYER = 'ski-cluster-count';
const POINT_LAYER = 'ski-points-unclustered';

const RESORT_COLOR = '#0057b8';
const HOTEL_COLOR = '#ff6b00';
const CLUSTER_COLOR = '#003d82';
const DEFAULT_DISCOVERY_FILTERS: SkiResortDiscoveryFilters = {
    query: '',
    country: '',
    minPisteKm: null,
    maxDayPassPrice: null,
    minTopElevationM: null,
    childFriendly: false,
    snowpark: false,
    nightSkiing: false,
};

interface SkiMapPointBase {
    key: string;
    title: string;
    subtitle: string;
    latitude: number;
    longitude: number;
    sourceLabel: string;
}

interface SkiResortPoint extends SkiMapPointBase {
    kind: 'resort';
    data: SkiResortMarker;
}

interface SkiHotelPoint extends SkiMapPointBase {
    kind: 'hotel';
    data: SkiHotelOverlayGroup;
}

const formatMoney = (value: number | null | undefined, currency: string): string => {
    if (value == null || !Number.isFinite(value)) return 'n/a';
    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: value % 1 === 0 ? 0 : 2,
        }).format(value);
    } catch {
        return `${currency} ${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
    }
};

const formatNumber = (value: number | null | undefined, digits = 0): string => (
    value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits)
);

const formatBool = (value: boolean | null | undefined): string => {
    if (value == null) return 'n/a';
    return value ? 'yes' : 'no';
};

const appendStat = (container: HTMLElement, label: string, value: string): void => {
    const stat = document.createElement('div');
    stat.className = 'ski-map__popup-stat';

    const statLabel = document.createElement('span');
    statLabel.className = 'ski-map__popup-stat-label';
    statLabel.textContent = label;
    stat.appendChild(statLabel);

    const statValue = document.createElement('span');
    statValue.className = 'ski-map__popup-stat-value';
    statValue.textContent = value;
    stat.appendChild(statValue);

    container.appendChild(stat);
};

const buildResortPopupHtml = (point: SkiResortPoint, plannerSlug: string | null): string => {
    const resort = point.data;
    const root = document.createElement('div');
    root.className = 'ski-map__popup';

    const kind = document.createElement('span');
    kind.className = 'ski-map__popup-kind';
    kind.textContent = 'Resort';
    root.appendChild(kind);

    const title = document.createElement('strong');
    title.className = 'ski-map__popup-title';
    title.textContent = point.title;
    root.appendChild(title);

    const subtitle = document.createElement('span');
    subtitle.className = 'ski-map__popup-subtitle';
    subtitle.textContent = point.subtitle;
    root.appendChild(subtitle);

    const meta = document.createElement('div');
    meta.className = 'ski-map__popup-meta';
    ['Catalog', 'Rating', 'Price', 'Season'].forEach((label, index) => {
        const pill = document.createElement('span');
        pill.className = 'ski-map__popup-pill';
        if (index === 0) pill.textContent = `${label}: ${point.sourceLabel}`;
        if (index === 1) pill.textContent = `Rating: ${formatNumber(resort.rating, 1)}`;
        if (index === 2) pill.textContent = `Price: ${formatNumber(resort.price, 1)}`;
        if (index === 3) pill.textContent = `Season: ${resort.season ?? 'n/a'}`;
        meta.appendChild(pill);
    });
    root.appendChild(meta);

    const stats = document.createElement('div');
    stats.className = 'ski-map__popup-stats';
    appendStat(stats, 'Lifts', formatNumber(resort.totalLifts ?? resort.numberOfLifts));
    appendStat(stats, 'Slopes', formatNumber(resort.totalSlopes ?? resort.numberOfSlopes));
    appendStat(stats, 'Slope km', formatNumber(resort.totalSlopeLengthKm, 1));
    appendStat(stats, 'Snowfall', formatNumber(resort.annualSnowfallCm, 0));
    appendStat(stats, 'Elevation gain', formatNumber(resort.elevationDifferenceM, 0));
    appendStat(stats, 'Longest run', formatNumber(resort.longestRunKm, 0));
    appendStat(stats, 'Snow parks', formatBool(resort.snowparks));
    appendStat(stats, 'Night skiing', formatBool(resort.nightskiing));
    root.appendChild(stats);

    // Only rendered where a planning profile exists. Linking every pin and
    // letting most of them land on a 404 teaches users the feature is broken.
    if (plannerSlug) {
        const link = document.createElement('a');
        link.className = 'ski-map__popup-link';
        link.href = `/resorts/${plannerSlug}`;
        link.textContent = 'Plan this resort — weeks, menus & hire →';
        root.appendChild(link);
    }

    return root.outerHTML;
};

const buildHotelPopupHtml = (point: SkiHotelPoint): string => {
    const group = point.data;
    const root = document.createElement('div');
    root.className = 'ski-map__popup';

    const kind = document.createElement('span');
    kind.className = 'ski-map__popup-kind';
    kind.textContent = 'Hotel offers';
    root.appendChild(kind);

    const title = document.createElement('strong');
    title.className = 'ski-map__popup-title';
    title.textContent = point.title;
    root.appendChild(title);

    const subtitle = document.createElement('span');
    subtitle.className = 'ski-map__popup-subtitle';
    subtitle.textContent = `${point.subtitle} • joined by ${group.resortJoinKey}`;
    root.appendChild(subtitle);

    const meta = document.createElement('div');
    meta.className = 'ski-map__popup-meta';
    const sourcePill = document.createElement('span');
    sourcePill.className = 'ski-map__popup-pill';
    sourcePill.textContent = `Catalog: ${point.sourceLabel}`;
    meta.appendChild(sourcePill);

    const countPill = document.createElement('span');
    countPill.className = 'ski-map__popup-pill';
    countPill.textContent = `Offers: ${group.offers.length}`;
    meta.appendChild(countPill);

    const pricePill = document.createElement('span');
    pricePill.className = 'ski-map__popup-pill';
    pricePill.textContent = `Cheapest: ${formatMoney(group.cheapestPriceGbp, 'GBP')}`;
    meta.appendChild(pricePill);
    root.appendChild(meta);

    const offers = document.createElement('div');
    offers.className = 'ski-map__popup-offers';
    group.offers.slice(0, 5).forEach((offer) => {
        const item = document.createElement('div');
        item.className = 'ski-map__popup-offer';

        const offerTitle = document.createElement('p');
        offerTitle.className = 'ski-map__popup-offer-title';
        offerTitle.textContent = offer.hotel ?? 'Unnamed hotel';
        item.appendChild(offerTitle);

        const offerMeta = document.createElement('p');
        offerMeta.className = 'ski-map__popup-offer-meta';
        offerMeta.textContent = [
            formatMoney(offer.priceGbp, 'GBP'),
            offer.distanceFromLiftM != null ? `${offer.distanceFromLiftM} m from lift` : 'distance n/a',
            offer.sleeps != null ? `${offer.sleeps} sleeps` : 'sleeps n/a',
        ].join(' • ');
        item.appendChild(offerMeta);

        const note = document.createElement('p');
        note.className = 'ski-map__popup-offer-note';
        note.textContent = [
            offer.totalPisteKm != null ? `${offer.totalPisteKm} km pistes` : 'piste n/a',
            offer.totalLifts != null ? `${offer.totalLifts} lifts` : 'lift n/a',
            offer.link ? 'external booking link available' : 'no link',
        ].join(' • ');
        item.appendChild(note);

        offers.appendChild(item);
    });

    if (group.offers.length > 5) {
        const more = document.createElement('p');
        more.className = 'ski-map__popup-offer-note';
        more.textContent = `${group.offers.length - 5} more offers hidden`;
        offers.appendChild(more);
    }

    root.appendChild(offers);
    return root.outerHTML;
};

interface SkiResortMapProps {
    data: SkiMapLayerData;
    /** Slugs of resorts that have a planning profile; pins for these get a planner link. */
    plannerSlugs?: readonly string[];
}

const SkiResortMap: React.FC<SkiResortMapProps> = ({ data, plannerSlugs = [] }) => {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [layer, setLayer] = useState<SkiLayer>('resorts');
    const [filters, setFilters] = useState<SkiResortDiscoveryFilters>(DEFAULT_DISCOVERY_FILTERS);
    /** Layers cannot be added before the style loads, and data cannot be set before the layers exist. */
    const [styleReady, setStyleReady] = useState(false);

    const countries = useMemo(
        () => Array.from(new Set(data.resorts.map((resort) => resort.country).filter((country): country is string => Boolean(country))))
            .sort((a, b) => a.localeCompare(b)),
        [data.resorts],
    );

    const visibleResortPoints = useMemo(() => {
        return filterSkiResorts(data.resorts, filters)
            .map<SkiResortPoint>((resort) => ({
                kind: 'resort',
                key: resort.catalogKey,
                title: resort.name ?? 'Unnamed resort',
                subtitle: [resort.country, resort.region].filter(Boolean).join(' • '),
                latitude: resort.latitude as number,
                longitude: resort.longitude as number,
                sourceLabel: formatSourceFileLabel(resort.sourceFile),
                data: resort,
            }));
    }, [data.resorts, filters]);

    const visibleResortKeys = useMemo(
        () => new Set(visibleResortPoints.map((point) => point.data.resortJoinKey)),
        [visibleResortPoints],
    );

    const visibleHotelPoints = useMemo(() => {
        return data.hotelGroups
            .filter((group) => visibleResortKeys.has(group.resortJoinKey))
            .map<SkiHotelPoint>((group) => ({
                kind: 'hotel',
                key: group.catalogKey,
                title: group.resort,
                subtitle: [group.country, group.offers.length > 0 ? `${group.offers.length} offers` : 'no offers']
                    .filter(Boolean)
                    .join(' • '),
                latitude: group.latitude,
                longitude: group.longitude,
                sourceLabel: group.sourceLabel,
                data: group,
            }));
    }, [data.hotelGroups, visibleResortKeys]);

    const visiblePoints = layer === 'resorts' ? visibleResortPoints : visibleHotelPoints;

    // Handlers are bound once when the map loads, so they read the current points
    // and planner slugs through refs rather than being torn down and rebound on
    // every data change.
    const pointsByKeyRef = useRef(new Map<string, SkiResortPoint | SkiHotelPoint>());
    const plannerSlugsRef = useRef<readonly string[]>(plannerSlugs);
    plannerSlugsRef.current = plannerSlugs;
    pointsByKeyRef.current = useMemo(() => {
        const index = new Map<string, SkiResortPoint | SkiHotelPoint>();
        visiblePoints.forEach((point) => index.set(point.key, point));
        return index;
    }, [visiblePoints]);

    const featureCollection = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: 'FeatureCollection',
        features: visiblePoints.map((point) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
            // Only the lookup key travels in properties. GeoJSON flattens nested
            // objects to strings, so the full point stays in the ref index above.
            properties: { key: point.key, kind: point.kind },
        })),
    }), [visiblePoints]);

    useEffect(() => {
        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    // Map is created once. It used to depend on the visible points, which meant
    // every filter change ran this effect — harmless only because of the early
    // return, and easy to break.
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) {
            return;
        }

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: getMapStyle(),
            center: [6.4, 45.9],
            zoom: 4.5,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.scrollZoom.disable();
        mapRef.current = map;

        // Bound to the style, not to 'load'. 'load' waits for the first tiles as
        // well as the style, so a slow or blocked basemap host meant the layers
        // were never added and the map showed no pins at all — strictly worse
        // than the DOM markers this replaced, which never touched the network.
        // Adding layers only needs the style parsed.
        const ensureLayers = () => {
            // isStyleLoaded(), not just "a style object exists": addSource throws
            // "Style is not done loading" until the sprite and glyph requests
            // settle. styledata fires repeatedly, so a not-yet-ready style simply
            // means we try again on the next event.
            if (!map.isStyleLoaded() || map.getSource(SOURCE_ID)) {
                return;
            }
            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                // Clustering is what makes 3,800 points viable at all: MapLibre
                // aggregates them on a worker and only ever draws what is on
                // screen. Rendering one DOM marker per resort locked the tab.
                cluster: true,
                clusterRadius: 48,
                clusterMaxZoom: 11,
            });

            map.addLayer({
                id: CLUSTER_LAYER,
                type: 'circle',
                source: SOURCE_ID,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': CLUSTER_COLOR,
                    'circle-opacity': 0.85,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 100, 28, 500, 34],
                },
            });

            map.addLayer({
                id: CLUSTER_COUNT_LAYER,
                type: 'symbol',
                source: SOURCE_ID,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-size': 12,
                    'text-font': ['Noto Sans Regular'],
                },
                paint: { 'text-color': '#ffffff' },
            });

            map.addLayer({
                id: POINT_LAYER,
                type: 'circle',
                source: SOURCE_ID,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': [
                        'match', ['get', 'kind'], 'hotel', HOTEL_COLOR, RESORT_COLOR,
                    ],
                    'circle-radius': 7,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                },
            });

            // Clicking a cluster zooms into it rather than opening 400 popups.
            map.on('click', CLUSTER_LAYER, (event) => {
                const feature = event.features?.[0];
                const clusterId = feature?.properties?.cluster_id;
                if (clusterId == null) return;
                const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
                void source.getClusterExpansionZoom(clusterId).then((zoom) => {
                    map.easeTo({
                        center: (feature!.geometry as GeoJSON.Point).coordinates as [number, number],
                        zoom,
                    });
                });
            });

            map.on('click', POINT_LAYER, (event) => {
                const feature = event.features?.[0];
                const key = feature?.properties?.key as string | undefined;
                const point = key ? pointsByKeyRef.current.get(key) : undefined;
                if (!point) return;
                new maplibregl.Popup({ offset: 14 })
                    .setLngLat((feature!.geometry as GeoJSON.Point).coordinates as [number, number])
                    .setHTML(point.kind === 'resort'
                        ? buildResortPopupHtml(point, matchPlannerSlug(point.data.name, plannerSlugsRef.current))
                        : buildHotelPopupHtml(point))
                    .addTo(map);
            });

            [CLUSTER_LAYER, POINT_LAYER].forEach((layerId) => {
                map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
            });

            setStyleReady(true);
        };

        ensureLayers();
        // Fires repeatedly while the style settles, and again if the basemap is
        // ever swapped underneath us. ensureLayers is idempotent, so this is a
        // retry loop that costs nothing once the layers exist.
        map.on('styledata', ensureLayers);
        // Belt and braces: 'load' fires once the style *and* the first tiles are
        // in. Harmless duplication — ensureLayers returns early once the source
        // exists — and it covers any ordering where styledata alone missed.
        map.on('load', ensureLayers);
    }, []);

    // Data changes are a setData call, not a teardown. Switching layer or filter
    // used to remove and recreate thousands of DOM nodes, which is what made the
    // map appear to reload and the pins vanish while it worked.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleReady) {
            return;
        }
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (!source) {
            return;
        }
        source.setData(featureCollection);

        if (featureCollection.features.length === 0) {
            return;
        }
        if (featureCollection.features.length === 1) {
            const [lng, lat] = featureCollection.features[0].geometry.coordinates as [number, number];
            map.jumpTo({ center: [lng, lat], zoom: 8.5 });
            return;
        }
        const coordinates = featureCollection.features
            .map((feature) => feature.geometry.coordinates as [number, number]);
        const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
        coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate));
        map.fitBounds(bounds, { padding: 56, maxZoom: 9.5, duration: 0 });
    }, [featureCollection, styleReady]);

    return (
        <article className="ski-resort-map">
            <header className="ski-resort-map__header">
                <div>
                    <p className="ski-resort-map__eyebrow">Frozen Summer map</p>
                    <h2 className="ski-resort-map__title">Ski resorts and hotel offers</h2>
                    <p className="ski-resort-map__lead">
                        Find a mountain by the terrain and conditions you need, then inspect the resort and its
                        independent stay offers. Prices and availability stay with the external provider.
                    </p>
                </div>
                <div className="ski-resort-map__status">
                    {layer === 'resorts' ? `${visibleResortPoints.length} resort pins` : `${visibleHotelPoints.length} hotel groups`}
                </div>
            </header>

            {!hasMapTilerKey() && (
                <p className="ski-resort-map__note" role="status">
                    No MapTiler key configured (REACT_APP_MAPTILER_KEY) — showing the free OpenFreeMap basemap.
                </p>
            )}

            <div className="ski-resort-map__controls" role="tablist" aria-label="Ski map layers">
                <button
                    type="button"
                    role="tab"
                    aria-selected={layer === 'resorts'}
                    className={layer === 'resorts' ? 'ski-resort-map__control-button ski-resort-map__control-button--active' : 'ski-resort-map__control-button'}
                    onClick={() => setLayer('resorts')}
                >
                    Resort pins
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={layer === 'hotels'}
                    className={layer === 'hotels' ? 'ski-resort-map__control-button ski-resort-map__control-button--active' : 'ski-resort-map__control-button'}
                    onClick={() => setLayer('hotels')}
                >
                    Hotel offers
                </button>
            </div>

            <fieldset className="ski-resort-map__filters">
                <legend>Find the right mountain</legend>
                <label className="ski-resort-map__filter-field ski-resort-map__filter-field--search">
                    <span>Resort or region</span>
                    <input
                        type="search"
                        value={filters.query}
                        placeholder="e.g. Dolomites or La Clusaz"
                        onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                    />
                </label>
                <label className="ski-resort-map__filter-field">
                    <span>Country</span>
                    <select value={filters.country} onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value }))}>
                        <option value="">Any country</option>
                        {countries.map((country) => <option key={country} value={country}>{country}</option>)}
                    </select>
                </label>
                <label className="ski-resort-map__filter-field">
                    <span>Terrain</span>
                    <select value={filters.minPisteKm ?? ''} onChange={(event) => setFilters((current) => ({ ...current, minPisteKm: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">Any size</option>
                        <option value="50">50+ km pistes</option>
                        <option value="150">150+ km pistes</option>
                        <option value="300">300+ km pistes</option>
                    </select>
                </label>
                <label className="ski-resort-map__filter-field">
                    <span>Top altitude</span>
                    <select value={filters.minTopElevationM ?? ''} onChange={(event) => setFilters((current) => ({ ...current, minTopElevationM: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">Any altitude</option>
                        <option value="2000">2,000 m+</option>
                        <option value="2500">2,500 m+</option>
                        <option value="3000">3,000 m+</option>
                    </select>
                </label>
                <label className="ski-resort-map__filter-field">
                    <span>Listed day price</span>
                    <select value={filters.maxDayPassPrice ?? ''} onChange={(event) => setFilters((current) => ({ ...current, maxDayPassPrice: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">Any listed price</option>
                        <option value="40">Up to 40</option>
                        <option value="60">Up to 60</option>
                        <option value="80">Up to 80</option>
                    </select>
                </label>
                {([
                    ['childFriendly', 'Family friendly'],
                    ['snowpark', 'Snow park'],
                    ['nightSkiing', 'Night skiing'],
                ] as const).map(([key, label]) => (
                    <label key={key} className="ski-resort-map__filter-check">
                        <input
                            type="checkbox"
                            checked={filters[key]}
                            onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        {label}
                    </label>
                ))}
                <button type="button" className="ski-resort-map__reset" onClick={() => setFilters(DEFAULT_DISCOVERY_FILTERS)}>
                    Clear filters
                </button>
            </fieldset>

            {visibleResortPoints.length === 0 && (
                <p className="ski-resort-map__alert" role="status">
                    No resorts match these filters. Loosen a filter rather than assuming the catalog has no answer.
                </p>
            )}

            <div className="ski-resort-map__map-shell">
                <div className="ski-resort-map__map" ref={mapContainerRef} />
                {visiblePoints.length === 0 && (
                    <p className="ski-resort-map__empty" role="status">
                        No mappable ski data is available for the selected layer and filters.
                    </p>
                )}
            </div>
        </article>
    );
};

export default SkiResortMap;
