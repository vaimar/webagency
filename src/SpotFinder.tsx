import {
    faArrowUp, faBed, faBuilding, faCableCar, faCampground, faCar, faChair, faChildren,
    faHotel, faHouse, faLocationDot, faMoon, faPersonSkiing,
    faPersonSnowboarding, faPlane, faShip, faSnowflake, faSun, faTemperatureLow,
    faTrain, faUmbrellaBeach, faWater,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyleUrl } from './services/mapStyle';
import { API_BASE, SkiHotel, SkiResort, SkiMapResponse } from './services/api';
import { buildResortJoinKey, cleanResortName } from './services/skiMap';
import { resolveOriginAirport } from './services/destinationDirectory';
import { accommodationUrls, placeUrls } from './services/affiliates';
import { NearbyStay, StayCategory, loadStaysNear } from './services/stayGuide';
import { buildMapMarker, MAP_MARKER_COLOR, POI_RADIUS_M } from './services/mapMarkers';
import { useNearbyPois } from './hooks/useNearbyPois';
import './SpotFinder.css';
import SpotTile from './components/SpotTile';
import NightlyRateCaveat from './components/NightlyRateCaveat';

export type SpotActivity = 'surf' | 'wakeboarding' | 'skiing' | 'snorkeling';

/** Fare on a flyable way in. Absent for ferry/train — we have no feed, so we show none. */
interface SpotAccessFare {
    price: number;
    currency: string;
    /** Fare + known extras. Excludes the last mile, which stays a hint. */
    entryPrice: number;
    departureDate: string | null;
    priceLabel: string | null;
    priceDisclaimer: string | null;
}

/** The rich record from /api/spots/{slug} — everything the enrichment pass fills. */
interface SpotDetailData {
    tractionType: string | null;
    cableTowers: number | null;
    fullCableCount: number | null;
    systemTwoCount: number | null;
    obstacleCount: number | null;
    transferLine: boolean | null;
    proShop: boolean | null;
    gearRental: boolean | null;
    setupNotes: string | null;
    seasonStartMonth: number | null;
    seasonEndMonth: number | null;
    dayPassPrice: number | null;
    hourPassPrice: number | null;
    priceCurrency: string | null;
    websiteUrl: string | null;
    moduleTypes: string[];
    photoUrl: string | null;
    photoCredit: string | null;
}

const TRACTION_LABEL: Record<string, string> = {
    FULL_CABLE: 'Full-size cable',
    SYSTEM_2_0: 'System 2.0',
    CABLE_UNSPECIFIED: 'Cable',
    BOAT: 'Boat-towed',
    WINCH: 'Winch',
    MIXED: 'Full cable + System 2.0',
};

const MODULE_LABEL: Record<string, string> = {
    KICKER: 'kicker', ROOFTOP: 'rooftop', FLAT_BAR: 'flat bar', DOWN_BAR: 'down bar',
    DFD: 'down-flat-down', KINK_BAR: 'kink bar', A_FRAME: 'A-frame', RAINBOW: 'rainbow',
    POLE_JAM: 'pole jam', WALLRIDE: 'wallride', FUNBOX: 'fun box', SLIDER: 'slider',
    TUBE: 'tube', TRANSFER: 'transfer', AIRBAG: 'airbag', OTHER: 'other',
};

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How many spots the gallery shows before deferring to the map. Twenty-four fills
 * roughly two screens on a laptop, which is enough to browse without turning the
 * page back into the exhaustive list the map already replaced.
 */
const GALLERY_LIMIT = 24;

interface NearbyAirport {
    iata: string;
    name: string;
    municipality: string | null;
    country: string | null;
    distanceKm: number;
}

interface NearbyStation {
    name: string;
    distanceKm: number;
}

/** Derived from coordinates, not curated. Straight-line distances, never drive time. */
interface ArrivalOptions {
    airports: NearbyAirport[];
    station: NearbyStation | null;
    /** The station lookup is still running server-side — ask again shortly. */
    stationPending?: boolean;
    drivingDirectionsUrl: string | null;
    websiteUrl: string | null;
}

/**
 * How many times to go back for a station that was still being looked up. Five at
 * five seconds covers the ~25s a slow Overpass mirror takes on a dense city; past
 * that the lookup still finishes and warms the cache for the next visit.
 */
const STATION_RETRIES = 5;
const STATION_RETRY_DELAY_MS = 5000;

interface SpotAccessWay {
    mode: string;
    hub: string;
    lastMile: string;
    fare?: SpotAccessFare | null;
}

interface SpotCard {
    /** Database identity. Null for rows that come from the curated JSON catalogs. */
    slug: string | null;
    destinationLabel: string;
    arrivalAirport: string | null;
    activity: string;
    country: string | null;
    towType: string | null;
    modes: string[];
    imageUrl: string | null;
    imageCredit: string | null;
    imageLicense: string | null;
    curationLevel: string | null;
    cityLatitude: number | null;
    cityLongitude: number | null;
    airportLatitude: number | null;
    airportLongitude: number | null;
    bboxLonMin: number | null;
    bboxLatMin: number | null;
    bboxLonMax: number | null;
    bboxLatMax: number | null;
    aliases: string[] | null;
    access: SpotAccessWay[] | null;
    /** The full catalogue row, for ski resorts. Absent for every other activity. */
    ski?: SkiResort;
    /** Ski package offers whose resortKey joined to this resort. */
    skiHotels?: SkiHotel[];
}

/**
 * The finder endpoint returns flat `latitude`/`longitude`; the rest of this file
 * (and the access endpoint) speak `cityLatitude`/`cityLongitude`. Normalised once
 * on load so there is a single coordinate shape downstream.
 */
const normaliseSpot = (raw: SpotCard & { latitude?: number | null; longitude?: number | null }): SpotCard => ({
    ...raw,
    cityLatitude: raw.cityLatitude ?? raw.latitude ?? null,
    cityLongitude: raw.cityLongitude ?? raw.longitude ?? null,
});

const DEPARTURES = ['Limerick, Ireland', 'Dublin, Ireland', 'Cork, Ireland', 'Galway, Ireland'];

const EXPLORE_ACTIVITY: Record<string, string> = {
    wakeboarding: 'wakeboard',
    skiing: 'snowboard',
};

const MODE_ICON: Record<string, IconDefinition> = {
    PLANE: faPlane,
    FERRY: faShip,
    TRAIN: faTrain,
};

const COUNTRY_NAME: Record<string, string> = {
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    IE: 'Ireland',
    PT: 'Portugal',
    NL: 'Netherlands',
    DE: 'Germany',
    GR: 'Greece',
    LT: 'Lithuania',
    TR: 'Turkey',
    AT: 'Austria',
    CH: 'Switzerland',
    NO: 'Norway',
    SE: 'Sweden',
    FI: 'Finland',
    JP: 'Japan',
    CA: 'Canada',
    US: 'United States',
    AD: 'Andorra',
    NZ: 'New Zealand',
    AU: 'Australia',
    CL: 'Chile',
    SK: 'Slovakia',
    SI: 'Slovenia',
    GB: 'United Kingdom',
    PL: 'Poland',
    RO: 'Romania',
    BG: 'Bulgaria',
    RS: 'Serbia',
    BA: 'Bosnia and Herzegovina',
    CZ: 'Czech Republic',
    GE: 'Georgia',
    KZ: 'Kazakhstan',
    KR: 'South Korea',
    CN: 'China',
    AR: 'Argentina',
    IR: 'Iran',
    LB: 'Lebanon',
    LI: 'Liechtenstein',
    UA: 'Ukraine',
    RU: 'Russia',
};

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
    Object.entries(COUNTRY_NAME).map(([code, name]) => [name, code]),
);
NAME_TO_CODE['USA'] = 'US';

const countryLabel = (code: string | null): string => (code ? COUNTRY_NAME[code] ?? code : 'Other');

/**
 * The catalogue is two CSV imports stacked in one table, and they carry disjoint
 * columns. `resorts.csv` (499 rows) has the deep stats — day pass, season, the
 * slope and lift breakdown, the amenities. `ski-resorts.csv` (3,284 rows) has the
 * wide coverage instead — rating, region, top elevation, snowfall, official site.
 * Nothing has both, so every panel below renders only what its row actually holds.
 */
const hasDeepSkiStats = (resort: SkiResort): boolean => (
    resort.totalSlopes != null || resort.totalLifts != null || resort.price != null
);

const skiResortToSpot = (resort: SkiResort, hotels: Map<string, SkiHotel[]>): SpotCard => ({
    slug: null,
    // Cleaned at the boundary so the label the map plots, the key the user
    // selects on and the heading on the card are all the same clean string.
    destinationLabel: cleanResortName(resort.name) || 'Unknown resort',
    arrivalAirport: null,
    activity: 'skiing',
    country: NAME_TO_CODE[resort.country ?? ''] ?? resort.country ?? null,
    towType: null,
    modes: [],
    imageUrl: null,
    imageCredit: null,
    imageLicense: null,
    // Curation levels describe the wakeboard pipeline (OSM discovery → enrichment →
    // check). A resort came out of a catalogue and never went through any of it, so
    // claiming one of those grades would be inventing a provenance it does not have.
    curationLevel: null,
    cityLatitude: resort.latitude ?? null,
    cityLongitude: resort.longitude ?? null,
    airportLatitude: null,
    airportLongitude: null,
    bboxLonMin: null,
    bboxLatMin: null,
    bboxLonMax: null,
    bboxLatMax: null,
    aliases: null,
    access: null,
    ski: resort,
    // Cleaning first also widens the join: "Arcali?s" normalised to `arcali-s`
    // and matched no offer; "Arcalis" matches the hotel side's `arcalis`.
    skiHotels: hotels.get(buildResortJoinKey(resort.country, cleanResortName(resort.name))),
});

const formatPrice = (amount: number, currency = 'EUR'): string => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
}).format(amount);

/** Distance from the spot, in the unit that reads naturally at that range. */
const formatDistanceKm = (km: number): string => (
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
);

/**
 * Why a way in has no price. Ferry and train fares have no feed behind them, so
 * they stay curated hints; a plane leg with no fare means we found no service on
 * that route — which is itself the useful signal.
 */
const unpricedNote = (mode: string): string => (
    mode === 'PLANE' ? 'no direct fare found' : 'curated, no live price'
);

const hasCoordinates = (spot: SpotCard): boolean => (
    spot.cityLatitude != null && spot.cityLongitude != null
    && spot.cityLatitude !== 0 && spot.cityLongitude !== 0
);

/**
 * How much we actually know about a spot. DISCOVERED spots come straight from
 * OpenStreetMap with coordinates but no checked access block, so they show "0 ways
 * in" — the badge is what stops that reading as a bug rather than as honesty.
 */
const CURATION_BADGE: Record<string, string> = {
    VENUE_READY: 'Verified',
    CURATED: 'Curated',
    ENRICHED: 'Unverified',
    DISCOVERED: 'Unverified',
    ROUTE_ONLY: 'Route only',
};

// ─── Spot map ────────────────────────────────────────────────────────────────

interface SpotMapProps {
    spot: SpotCard;
    /** Places to sleep, pinned alongside the spot. Empty until the lookup lands. */
    stays?: NearbyStay[];
    arrival?: ArrivalOptions | null;
}

type MapLayer = 'stay' | 'transport' | 'restaurant' | 'shop';
const MAP_LAYER_LABELS: Record<MapLayer, string> = {
    stay: 'Hotels',
    restaurant: 'Restaurants',
    shop: 'Shops',
    transport: 'Transport',
};

const SpotMap: React.FC<SpotMapProps> = ({ spot, stays = [] }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const stayMarkersRef = useRef<maplibregl.Marker[]>([]);
    const transportMarkersRef = useRef<maplibregl.Marker[]>([]);
    const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
    const [threeD, setThreeD] = useState(false);
    const [layers, setLayers] = useState<Record<MapLayer, boolean>>({
        stay: true, transport: true, restaurant: false, shop: false,
    });
    // Both POI layers share one lookup. See useNearbyPois for why this is keyed
    // on coordinates instead of the fetched-once ref it replaced.
    const wantsPois = layers.restaurant || layers.shop;
    const { pois, status: poiStatus, retry: retryPois } = useNearbyPois(
        spot.cityLatitude,
        spot.cityLongitude,
        wantsPois,
    );

    const toggleLayer = (layer: MapLayer) => {
        setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    };

    const toggleThreeD = () => {
        const map = mapRef.current;
        if (!map) return;
        const next = !threeD;
        setThreeD(next);

        if (next) {
            if (!map.getSource('terrain-dem')) {
                map.addSource('terrain-dem', {
                    type: 'raster-dem',
                    tiles: [TERRAIN_TILES],
                    tileSize: 256,
                    encoding: 'terrarium',
                    maxzoom: 13,
                });
            }
            map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
            map.easeTo({ pitch: 62, bearing: -20, zoom: 14, duration: 900 });
        } else {
            map.setTerrain(null);
            map.easeTo({ pitch: 0, bearing: 0, zoom: 13, duration: 700 });
        }
    };

    useEffect(() => {
        if (!containerRef.current || !hasCoordinates(spot)) return undefined;

        const lat = spot.cityLatitude!;
        const lon = spot.cityLongitude!;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: getMapStyleUrl(),
            center: [lon, lat],
            zoom: 13,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.scrollZoom.disable();
        mapRef.current = map;

        map.on('load', () => {
            new maplibregl.Marker({ element: buildMapMarker('spot', spot.destinationLabel) })
                .setLngLat([lon, lat])
                .setPopup(new maplibregl.Popup({ offset: 16 }).setText(spot.destinationLabel))
                .addTo(map);

            if (spot.bboxLonMin != null && spot.bboxLatMin != null && spot.bboxLonMax != null && spot.bboxLatMax != null) {
                const bounds = new maplibregl.LngLatBounds(
                    [spot.bboxLonMin, spot.bboxLatMin],
                    [spot.bboxLonMax, spot.bboxLatMax],
                );
                if (spot.airportLatitude != null && spot.airportLongitude != null) {
                    bounds.extend([spot.airportLongitude, spot.airportLatitude]);
                }
                map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
            }
        });

        // Deliberately no setPois([]) here. A fresh [] is never Object.is-equal
        // to the previous state, so resetting it inside this effect forced a
        // re-render, which (while `spot` was a new object each render) re-ran
        // this effect and rebuilt the whole map — over and over. The POI effect
        // below owns that state and clears it when the coordinates change.

        return () => {
            map.remove();
            mapRef.current = null;
            stayMarkersRef.current = [];
            transportMarkersRef.current = [];
            poiMarkersRef.current = [];
            setThreeD(false);
        };
    }, [spot]);

    // Transport markers (airport)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        transportMarkersRef.current.forEach((m) => m.remove());
        transportMarkersRef.current = [];

        if (!layers.transport) return;

        if (spot.airportLatitude != null && spot.airportLongitude != null) {
            const m = new maplibregl.Marker({ element: buildMapMarker('transport', spot.arrivalAirport ?? 'Airport') })
                .setLngLat([spot.airportLongitude, spot.airportLatitude])
                .setPopup(new maplibregl.Popup({ offset: 14 }).setText(`${spot.arrivalAirport ?? 'Airport'}`))
                .addTo(map);
            transportMarkersRef.current.push(m);
        }
    }, [spot, layers.transport]);

    // Hotel stay markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        stayMarkersRef.current.forEach((marker) => marker.remove());
        stayMarkersRef.current = [];

        if (!layers.stay) return;

        stayMarkersRef.current = stays
            .filter((stay) => stay.latitude != null && stay.longitude != null)
            .map((stay) => {
                const distance = stay.distanceKm != null ? ` · ${formatDistanceKm(stay.distanceKm)}` : '';
                return new maplibregl.Marker({ element: buildMapMarker('stay', stay.name) })
                    .setLngLat([stay.longitude!, stay.latitude!])
                    .setPopup(new maplibregl.Popup({ offset: 14 }).setText(`${stay.name}${distance}`))
                    .addTo(map);
            });
    }, [stays, layers.stay]);


    // Restaurant + shop markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        poiMarkersRef.current.forEach((m) => m.remove());
        poiMarkersRef.current = pois
            .filter((poi) => (poi.kind === 'restaurant' && layers.restaurant) || (poi.kind === 'shop' && layers.shop))
            .map((poi) => {
                return new maplibregl.Marker({ element: buildMapMarker(poi.kind, poi.name) })
                    .setLngLat([poi.lon, poi.lat])
                    .setPopup(new maplibregl.Popup({ offset: 14 }).setText(poi.name))
                    .addTo(map);
            });
    }, [pois, layers.restaurant, layers.shop]);

    if (!hasCoordinates(spot)) return null;

    return (
        <div className="spot-map-wrap">
            <div className="spot-map" ref={containerRef} />
            <div className="spot-map__controls">
                <button
                    type="button"
                    className={`spot-map__3d ${threeD ? 'spot-map__3d--on' : ''}`}
                    onClick={toggleThreeD}
                    aria-pressed={threeD}
                    title={threeD ? 'Back to flat view' : 'Tilt into a 3D terrain view'}
                >
                    {threeD ? '2D' : '3D'}
                </button>
                <div className="spot-map__layers">
                    {(Object.keys(MAP_LAYER_LABELS) as MapLayer[]).map((layer) => (
                        <label key={layer} className="spot-map__layer-toggle">
                            <input
                                type="checkbox"
                                checked={layers[layer]}
                                onChange={() => toggleLayer(layer)}
                            />
                            <span
                                className="spot-map__layer-dot"
                                style={{ background: MAP_MARKER_COLOR[layer] }}
                            />
                            {MAP_LAYER_LABELS[layer]}
                        </label>
                    ))}
                </div>

                {/* The POI layers load from Overpass, which takes seconds and
                    legitimately returns nothing for rural spots. Without this the
                    checkbox went on and simply no pins appeared, which reads as a
                    broken toggle whether the lookup was slow, empty or failed. */}
                {wantsPois && poiStatus === 'loading' && (
                    <p className="spot-map__layer-status" role="status">Loading places nearby...</p>
                )}
                {wantsPois && poiStatus === 'done' && pois.length === 0 && (
                    <p className="spot-map__layer-status" role="status">
                        Nothing tagged within {POI_RADIUS_M / 1000} km in OpenStreetMap.
                    </p>
                )}
                {wantsPois && poiStatus === 'error' && (
                    <p className="spot-map__layer-status" role="alert">
                        Lookup failed.{' '}
                        <button
                            type="button"
                            className="spot-map__layer-retry"
                            onClick={retryPois}
                        >
                            Try again
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
};

// ─── Overview map: every spot in the country, clickable ──────────────────────

interface SpotOverviewMapProps {
    spots: SpotCard[];
    selected: string | null;
    onSelect: (label: string) => void;
    activity: SpotActivity;
}

/**
 * Ready to ride: verified access, real ways in. Darkened from the mint that read
 * as "go" on the old dark basemap — on the light one it washed out to nearly the
 * same value as the landmass.
 */
const VERIFIED_COLOR = '#047857';
/** Discovered but unchecked. Deliberately muted so it recedes behind the verified set. */
const UNVERIFIED_COLOR = '#475569';

/** Keyless DEM for the 3D view. Verified reachable; needs no MapTiler key. */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/**
 * A teardrop map pin, drawn to a canvas at load and registered as a style image.
 * A filled circle is what a map draws when it has nothing to say; a pin reads as a
 * place. Drawn rather than shipped as an asset so the colour stays driven by
 * curation and there is no sprite to keep in sync.
 */
const createPin = (color: string, glyph: string) => {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size * 0.38;
    const r = size * 0.28;

    // Drop shadow, so pins lift off a dark basemap instead of merging into it.
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // Teardrop: a disc with a tangent point pulled down to the coordinate.
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.22);
    ctx.lineTo(cx, size * 0.94);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.stroke();

    // Inner disc + glyph: the wave mark reads at a glance as "water", and keeps the
    // pin legible when several overlap at country zoom.
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx, cy + 1);

    return {
        width: size,
        height: size,
        data: new Uint8Array(ctx.getImageData(0, 0, size, size).data),
    };
};

/**
 * An animated marker for the current pick — a soft ring expanding out of a solid
 * core, redrawn every frame. A static highlight gets lost among 124 neighbours in
 * a dense region; motion is the one channel nothing else on the map is using.
 */
const createPulsingDot = (map: maplibregl.Map, color: string) => {
    const size = 140;
    return {
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4),
        context: null as CanvasRenderingContext2D | null,
        onAdd() {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            this.context = canvas.getContext('2d');
        },
        render() {
            const duration = 1600;
            const t = (performance.now() % duration) / duration;
            const core = size * 0.16;
            const halo = core + t * core * 2.2;
            const ctx = this.context;
            if (!ctx) return false;

            ctx.clearRect(0, 0, size, size);

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, halo, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(52, 211, 153, ${0.45 * (1 - t)})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, core * 1.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, core, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.fill();
            ctx.stroke();

            this.data = new Uint8Array(ctx.getImageData(0, 0, size, size).data);
            map.triggerRepaint();
            return true;
        },
    };
};

/**
 * All spots for the current country on one map. Rendered as a GeoJSON circle layer
 * rather than one DOM marker per spot: France alone returns 120+ venues, and that
 * many absolutely-positioned elements makes panning stutter. A vector layer also
 * lets the fill be driven by curation, so verified spots read differently from
 * machine-discovered ones without a second pass.
 *
 * <p>Spots with no coordinates are simply absent. That is deliberate — a map that
 * invents a position is worse than a map with a gap in it.
 */
const ACTIVITY_GLYPH: Record<SpotActivity, string> = {
    wakeboarding: '≈',
    surf: '≈',
    skiing: '▲',
    snorkeling: '≈',
};

const SKI_VERIFIED_COLOR = '#1d4ed8';
const SKI_UNVERIFIED_COLOR = '#6366f1';

const SpotOverviewMap: React.FC<SpotOverviewMapProps> = ({ spots, selected, onSelect, activity }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const loadedRef = useRef(false);
    // Whether the initial fitBounds has been applied against a real, sized viewport.
    const fittedRef = useRef(false);
    // Kept in a ref so the click handler, registered once, always sees the current
    // callback instead of the one captured at mount.
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;

    const isSki = activity === 'skiing';
    const mappable = useMemo(() => spots.filter(hasCoordinates), [spots]);

    const featureCollection = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: mappable.map((spot) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [spot.cityLongitude!, spot.cityLatitude!] },
            properties: {
                label: spot.destinationLabel,
                // For ski the prominent pin means "we hold the full stat block", which
                // is the distinction that actually matters when picking a resort.
                // Everywhere else it means the access has been checked by a human.
                verified: spot.ski
                    ? hasDeepSkiStats(spot.ski)
                    : spot.curationLevel != null && CURATION_BADGE[spot.curationLevel] === 'Verified',
            },
        })),
    }), [mappable]);

    useEffect(() => {
        if (!containerRef.current || mappable.length === 0) return undefined;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: getMapStyleUrl(),
            center: [mappable[0].cityLongitude!, mappable[0].cityLatitude!],
            zoom: 4,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
        loadedRef.current = false;

        // MapLibre measures its container once at construction. Here that happens
        // before the surrounding flex layout has settled, so the canvas came out
        // 400x260 inside a 1172x360 box. Worse, fitBounds against a zero-width
        // viewport leaves the map with a transform that never resolves to any tile
        // — the style loads, no vector tiles are ever requested, and the map paints
        // black. So the initial fit is deferred until the container actually has a
        // size, and re-applied the first time it gets one.
        const fitToSpots = () => {
            if (mappable.length === 0) return;
            const bounds = new maplibregl.LngLatBounds();
            mappable.forEach((spot) => bounds.extend([spot.cityLongitude!, spot.cityLatitude!]));
            map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
        };

        const resizeObserver = new ResizeObserver((entries) => {
            map.resize();
            const width = entries[0]?.contentRect.width ?? 0;
            if (width > 0 && !fittedRef.current && loadedRef.current) {
                fittedRef.current = true;
                fitToSpots();
            }
        });
        resizeObserver.observe(containerRef.current);

        map.on('load', () => {
            loadedRef.current = true;
            map.resize();
            map.addSource('spots', { type: 'geojson', data: featureCollection });
            const glyph = ACTIVITY_GLYPH[activity] ?? '\u2248';
            const vColor = activity === 'skiing' ? SKI_VERIFIED_COLOR : VERIFIED_COLOR;
            const uColor = activity === 'skiing' ? SKI_UNVERIFIED_COLOR : UNVERIFIED_COLOR;
            if (!map.hasImage('spot-pin-verified')) {
                map.addImage('spot-pin-verified', createPin(vColor, glyph), { pixelRatio: 3 });
            }
            if (!map.hasImage('spot-pin-unverified')) {
                map.addImage('spot-pin-unverified', createPin(uColor, glyph), { pixelRatio: 3 });
            }

            map.addLayer({
                id: 'spot-halo',
                type: 'circle',
                source: 'spots',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 12, 22],
                    'circle-color': ['case', ['get', 'verified'], vColor, uColor],
                    'circle-opacity': ['case', ['get', 'verified'], 0.2, 0.1],
                    'circle-blur': 0.85,
                },
            });
            map.addLayer({
                id: 'spot-circles',
                type: 'symbol',
                source: 'spots',
                layout: {
                    'icon-image': ['case', ['get', 'verified'], 'spot-pin-verified', 'spot-pin-unverified'],
                    'icon-anchor': 'bottom',
                    'icon-allow-overlap': true,
                    // Verified pins sit slightly larger, and everything grows on zoom.
                    'icon-size': [
                        'interpolate', ['linear'], ['zoom'],
                        4, ['case', ['get', 'verified'], 0.42, 0.3],
                        12, ['case', ['get', 'verified'], 0.85, 0.65],
                    ],
                    // Verified pins win when pins collide.
                    'symbol-sort-key': ['case', ['get', 'verified'], 0, 1],
                },
            });

            // The current pick, animated. A static highlight gets lost among 124
            // neighbours in a dense region; motion is the one channel nothing else
            // on this map is using. Drawn last so it is never occluded.
            if (!map.hasImage('spot-pulse')) {
                map.addImage('spot-pulse', createPulsingDot(map, VERIFIED_COLOR), { pixelRatio: 2 });
            }
            map.addLayer({
                id: 'spot-selected',
                type: 'symbol',
                source: 'spots',
                filter: ['==', ['get', 'label'], selected ?? ' '],
                layout: { 'icon-image': 'spot-pulse', 'icon-allow-overlap': true },
            });

            const popup = new maplibregl.Popup({ closeButton: false, offset: 12 });
            map.on('mouseenter', 'spot-circles', (event) => {
                map.getCanvas().style.cursor = 'pointer';
                const feature = event.features?.[0];
                if (feature) {
                    popup.setLngLat(event.lngLat).setText(String(feature.properties?.label ?? '')).addTo(map);
                }
            });
            map.on('mouseleave', 'spot-circles', () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });
            map.on('click', 'spot-circles', (event) => {
                const label = event.features?.[0]?.properties?.label;
                if (label) onSelectRef.current(String(label));
            });

            if ((containerRef.current?.clientWidth ?? 0) > 0) {
                fittedRef.current = true;
                fitToSpots();
            }
        });

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapRef.current = null;
            loadedRef.current = false;
            fittedRef.current = false;
        };
        // Rebuilt when the plotted set changes (country or activity switch).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mappable]);

    // Selection changes only repaint the highlight — rebuilding the map would throw
    // away the user's pan and zoom every time they clicked a spot.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current || !map.getLayer('spot-selected')) return;
        map.setFilter('spot-selected', ['==', ['get', 'label'], selected ?? ' ']);
        const picked = mappable.find((s) => s.destinationLabel === selected);
        if (picked) {
            // Picking a resort drops the camera onto the mountain. A resort is a
            // shape in the terrain, and a flat overhead tile says nothing about
            // whether the vertical just read off the card is one face or a whole
            // valley. Water spots stay top-down — a lake reads better flat.
            map.easeTo({
                center: [picked.cityLongitude!, picked.cityLatitude!],
                ...(isSki ? { pitch: 55, zoom: 12.5 } : {}),
                duration: isSki ? 1200 : 500,
                essential: true,
            });
        } else if (isSki && map.getPitch() !== 0) {
            // Clearing the pick returns to plan view. Without this the overview
            // stays tilted and the next country arrives on an oblique camera.
            map.easeTo({ pitch: 0, duration: 600, essential: true });
        }
    }, [selected, mappable, isSki]);

    if (mappable.length === 0) return null;

    return (
        <div className="spot-overview">
            <div className="spot-overview__map" ref={containerRef} />
            <div className={`spot-overview__legend ${isSki ? 'spot-overview__legend--ski' : ''}`}>
                <span>
                    <i className="spot-overview__dot spot-overview__dot--verified" />
                    {isSki ? 'full stats' : 'verified'}
                </span>
                <span>
                    <i className="spot-overview__dot spot-overview__dot--unverified" />
                    {isSki ? 'listing only' : 'unverified'}
                </span>
                <span className="spot-overview__count">
                    {mappable.length} of {spots.length} mapped
                </span>
            </div>
        </div>
    );
};

// ─── Where to sleep: stays around the spot itself ────────────────────────────

const STAY_ICON: Record<StayCategory, IconDefinition> = {
    hotel: faHotel,
    resort: faUmbrellaBeach,
    apartment: faBuilding,
    guest_house: faHouse,
    hostel: faBed,
    motel: faCar,
    camp: faCampground,
    other: faLocationDot,
};

/**
 * How far out to look for a bed. Wider than the city guide's 8 km because a cable
 * park is a lake outside a town — at 8 km most of them come back empty, which
 * reads as "nowhere to stay" rather than "look one valley over".
 */
const SPOT_STAY_RADIUS_KM = 15;

/** How many stays show before the list is expanded. Enough to judge the area. */
const STAY_PREVIEW_COUNT = 6;
/** The ceiling once expanded. Past this it stops being a shortlist and the Stay
 *  Guide is the better tool. */
const STAY_MAX_COUNT = 20;

interface NearbyStaysProps {
    /** The spot's own coordinates — the centre everything is measured from. */
    latitude: number;
    longitude: number;
    /** Used for the deep-link query text, so "Book" lands on the right region. */
    placeLabel: string;
    stays: NearbyStay[];
    status: 'loading' | 'done' | 'error';
    radiusKm: number;
}

/**
 * Somewhere to sleep, measured from the spot rather than from a city centre.
 * Wake parks sit outside towns, so the honest ordering here is nearest-first:
 * a rated hotel 30 km away is not a better answer than the guest house across
 * the lake, and the price — when we have one — is a tie-breaker, not the sort.
 */
const NearbyStays: React.FC<NearbyStaysProps> = ({
    latitude, longitude, placeLabel, stays, status, radiusKm,
}) => {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? stays.slice(0, STAY_MAX_COUNT) : stays.slice(0, STAY_PREVIEW_COUNT);
    const pricedCount = stays.filter((stay) => stay.pricePerNight != null).length;

    return (
        <div className="spot-detail__section">
            <div className="spot-detail__section-head">
                <h4 className="spot-detail__section-title">Where to sleep</h4>
                {status === 'done' && stays.length > 0 && (
                    <span className="spot-detail__derived">
                        within {radiusKm} km
                        {pricedCount > 0 ? ` · ${pricedCount} with a live rate` : ''}
                    </span>
                )}
            </div>

            {status === 'loading' && <p className="spot-finder__muted">Looking for places to sleep…</p>}

            {status === 'error' && (
                <p className="spot-finder__muted">
                    Couldn't load stays for this spot just now.{' '}
                    <a
                        className="spot-detail__link"
                        href={accommodationUrls(placeLabel).booking}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Search Booking directly ↗
                    </a>
                </p>
            )}

            {status === 'done' && stays.length === 0 && (
                <p className="spot-finder__muted">
                    Nothing mapped within {radiusKm} km — these lakes are rural, and
                    OpenStreetMap simply may not list what is there.{' '}
                    <a
                        className="spot-detail__link"
                        href={accommodationUrls(placeLabel).booking}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Try Booking for the area ↗
                    </a>
                </p>
            )}

            {shown.length > 0 && (
                <ul className="spot-stays">
                    {shown.map((stay) => {
                        // The backend's matched property page when it has one; a
                        // plain area search otherwise, so every row is still an action.
                        const booking = stay.bookingLink ?? accommodationUrls(stay.name, placeLabel).booking;
                        const maps = stay.latitude != null && stay.longitude != null
                            ? `https://www.google.com/maps/search/?api=1&query=${stay.latitude},${stay.longitude}`
                            : placeUrls(stay.name, placeLabel).googleMaps;
                        return (
                            <li key={stay.id} className={`spot-stay${stay.curated ? ' spot-stay--curated' : ''}`}>
                                <div className="spot-detail__way-icon">
                                    <FontAwesomeIcon icon={STAY_ICON[stay.category]} />
                                </div>
                                <div className="spot-detail__way-content">
                                    <span className="spot-detail__way-hub">{stay.name}</span>
                                    <span className="spot-detail__way-hint">
                                        {stay.distanceKm != null
                                            ? `${formatDistanceKm(stay.distanceKm)} from the spot`
                                            : 'distance unknown'}
                                        {stay.rating != null && ` · ★ ${stay.rating.toFixed(1)}`}
                                        {stay.rating != null && stay.reviewsCount != null && ` (${stay.reviewsCount})`}
                                    </span>
                                    <span className="spot-stay__links">
                                        <a
                                            className="spot-detail__link"
                                            href={booking}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {stay.pricePerNight != null ? 'Book ↗' : 'Check rate ↗'}
                                        </a>
                                        <a
                                            className="spot-detail__link"
                                            href={maps}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Map ↗
                                        </a>
                                    </span>
                                </div>
                                <div className="spot-detail__way-fare">
                                    {stay.pricePerNight != null ? (
                                        <>
                                            <span className="spot-detail__fare-price">
                                                {formatPrice(stay.pricePerNight, stay.priceCurrency ?? 'EUR')}
                                            </span>
                                            <span className="spot-detail__fare-note">per night</span>
                                            <NightlyRateCaveat />
                                        </>
                                    ) : (
                                        <span className="spot-detail__fare-none">no live rate</span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {!expanded && stays.length > STAY_PREVIEW_COUNT && (
                <button type="button" className="spot-stays__more" onClick={() => setExpanded(true)}>
                    Show {Math.min(stays.length, STAY_MAX_COUNT) - STAY_PREVIEW_COUNT} more nearby
                </button>
            )}

            {stays.length > 0 && (
                <p className="spot-detail__ways-footnote">
                    Straight-line distance from the spot, not drive time. Rates are live
                    TripAdvisor quotes where we have a match — everything else links out
                    unpriced rather than guessing. Coordinates: {latitude.toFixed(3)}, {longitude.toFixed(3)}.
                </p>
            )}
        </div>
    );
};

// ─── Spot detail card ────────────────────────────────────────────────────────

interface AccessDetail {
    ways: SpotAccessWay[];
    /** Cheapest flight entry price across the priced ways; null when nothing was flyable. */
    cheapestEntryPrice?: number | null;
    cityLatitude?: number | null;
    cityLongitude?: number | null;
    airportLatitude?: number | null;
    airportLongitude?: number | null;
}

// ─── Ski: everything the resort catalogue holds ──────────────────────────────

const num = (value: number | null | undefined): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const intFmt = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });

/** A stat only earns a row if the catalogue actually has it. Zero is a fact; null is not. */
const Stat: React.FC<{ label: React.ReactNode; value: React.ReactNode | null; hint?: string }> = (
    { label, value, hint },
) => (value == null ? null : (
    <div className="ski-stat">
        <span className="ski-stat__label">{label}</span>
        <span className="ski-stat__value">{value}</span>
        {hint && <span className="ski-stat__hint">{hint}</span>}
    </div>
));

/**
 * Draws a Font Awesome glyph inside our own SVG rather than as an <i> next to it.
 * The icon tuple carries its own path and viewBox dimensions, so a figure can be
 * placed on the slope at an arbitrary point and scale — which is the whole reason
 * the mountain below reads as a piste and not as a triangle.
 */
const FaGlyph: React.FC<{
    icon: IconDefinition; x: number; y: number; size: number; fill: string; flip?: boolean;
}> = ({ icon, x, y, size, fill, flip }) => {
    const [w, h, , , path] = icon.icon;
    const scale = size / h;
    const d = Array.isArray(path) ? path.join(' ') : path;
    return (
        <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale}) translate(${-w / 2} ${-h / 2})`}>
            <path d={d} fill={fill} />
        </g>
    );
};

/**
 * The resort drawn to its own numbers: the ridge line is the real vertical, the
 * two altitude labels are the real summit and base, and the riders sit on the
 * piste rather than beside it.
 *
 * <p>This is deliberately not decoration. It renders only when the catalogue knows
 * the summit and base — a mountain drawn without them would be a picture of
 * nothing, and the panel is better off going straight to the numbers.
 */
const SkiMountainProfile: React.FC<{ top: number; bottom: number; vertical: number }> = (
    { top, bottom, vertical },
) => (
    <svg
        className="ski-hero__svg"
        viewBox="0 0 640 190"
        role="img"
        aria-label={`Summit ${intFmt.format(top)} metres, base ${intFmt.format(bottom)} metres, ${intFmt.format(vertical)} metres of vertical`}
    >
        <defs>
            <linearGradient id="skySky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8f1fb" />
                <stop offset="100%" stopColor="#f7fafd" />
            </linearGradient>
            <linearGradient id="skyRock" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b7fae" />
                <stop offset="100%" stopColor="#8aa6c4" />
            </linearGradient>
        </defs>

        <rect width="640" height="190" fill="url(#skySky)" />

        {/* Far ridge, held back so the near face reads as the subject. */}
        <path d="M0 158 L118 74 L196 122 L268 66 L360 158 Z" fill="#c3d5e8" opacity="0.75" />

        {/* The near face. Its right flank is the piste the riders are on. */}
        <path d="M196 158 L330 40 L470 158 Z" fill="url(#skyRock)" />
        {/* Snow cap, sitting on the summit third. */}
        <path d="M330 40 L378 81 L360 88 L342 79 L322 92 L302 78 L282 81 Z" fill="#ffffff" />

        {/* Piste: the descent line the two figures are riding. */}
        <path d="M330 46 L452 156" stroke="#ffffff" strokeWidth="13" strokeLinecap="round" opacity="0.95" />
        <path
            d="M330 46 L452 156"
            stroke="#1d63c9"
            strokeWidth="2"
            strokeDasharray="7 9"
            strokeLinecap="round"
            opacity="0.55"
        />

        <FaGlyph icon={faPersonSkiing} x={378} y={88} size={30} fill="#12325c" />
        <FaGlyph icon={faPersonSnowboarding} x={423} y={128} size={28} fill="#c0261f" />

        {/* Summit and base, pinned to the altitudes they describe. */}
        <g className="ski-hero__pin">
            <circle cx="330" cy="40" r="4.5" fill="#ffffff" stroke="#12325c" strokeWidth="2.5" />
            <text x="342" y="34" className="ski-hero__label">{intFmt.format(top)} m</text>
            <text x="342" y="48" className="ski-hero__sub">summit</text>
        </g>
        <g className="ski-hero__pin">
            <circle cx="470" cy="158" r="4.5" fill="#ffffff" stroke="#12325c" strokeWidth="2.5" />
            <text x="482" y="153" className="ski-hero__label">{intFmt.format(bottom)} m</text>
            <text x="482" y="167" className="ski-hero__sub">base</text>
        </g>

        {/* Vertical drop, measured between exactly those two heights. */}
        <g>
            <line x1="150" y1="46" x2="150" y2="152" stroke="#12325c" strokeWidth="1.5" opacity="0.55" />
            <path d="M146 50 L150 42 L154 50 Z" fill="#12325c" opacity="0.55" />
            <path d="M146 148 L150 156 L154 148 Z" fill="#12325c" opacity="0.55" />
            <text x="140" y="94" className="ski-hero__drop" textAnchor="end">{intFmt.format(vertical)} m</text>
            <text x="140" y="108" className="ski-hero__sub" textAnchor="end">vertical</text>
        </g>
    </svg>
);

/**
 * Piste counts shown the way the mountain shows them: a coloured disc per grade.
 * European signage runs blue → red → black, which is the grading a rider already
 * knows how to read, so the colour does the work the word would otherwise do.
 */
const PISTE_GRADES = [
    { key: 'easy', label: 'Easy', hint: 'blue' },
    { key: 'mid', label: 'Intermediate', hint: 'red' },
    { key: 'hard', label: 'Difficult', hint: 'black' },
] as const;

const PisteMarkers: React.FC<{ easy: number; mid: number; hard: number }> = ({ easy, mid, hard }) => {
    const counts = { easy, mid, hard };
    const total = easy + mid + hard;
    const pct = (n: number) => Math.round((n / total) * 100);
    return (
        <div className="ski-pistes">
            <div
                className="ski-pistes__bar"
                role="img"
                aria-label={PISTE_GRADES
                    .map(({ key, label }) => `${counts[key]} ${label.toLowerCase()} (${pct(counts[key])}%)`)
                    .join(', ')}
            >
                {PISTE_GRADES.map(({ key }) => (counts[key] ? (
                    <span
                        key={key}
                        className={`ski-pistes__seg ski-pistes__seg--${key}`}
                        style={{ flexGrow: counts[key] }}
                    >
                        {/* Hidden by CSS when the segment is too narrow to hold it. */}
                        <span className="ski-pistes__seg-pct">{pct(counts[key])}%</span>
                    </span>
                ) : null))}
            </div>
            <div className="ski-pistes__key">
                {PISTE_GRADES.map(({ key, label, hint }) => (
                    <div key={key} className={`ski-piste ski-piste--${key}`}>
                        <span className="ski-piste__swatch" />
                        <span className="ski-piste__count">{counts[key]}</span>
                        <span className="ski-piste__label">{label}</span>
                        <span className="ski-piste__hint">{hint} · {pct(counts[key])}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/**
 * Base → summit as one object, with the drop between them as the headline. The
 * three numbers only mean anything relative to each other, so reading them off
 * three separate cards made the user do the subtraction the panel already knows.
 */
const ElevationBadge: React.FC<{ top: number; bottom: number; vertical: number }> = (
    { top, bottom, vertical },
) => (
    <div className="ski-elevation">
        <div className="ski-elevation__end">
            <span className="ski-elevation__label">Base</span>
            <span className="ski-elevation__value">{intFmt.format(bottom)} m</span>
        </div>
        <div className="ski-elevation__drop">
            <span className="ski-elevation__drop-value">{intFmt.format(vertical)} m</span>
            <span className="ski-elevation__label">vertical</span>
        </div>
        <div className="ski-elevation__end ski-elevation__end--top">
            <span className="ski-elevation__label">Summit</span>
            <span className="ski-elevation__value">{intFmt.format(top)} m</span>
        </div>
    </div>
);

/** 37400 → "37.4k". An uphill capacity is a magnitude, not an exact headcount. */
const compactRiders = (value: number): string => (
    value >= 10000
        ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
        : intFmt.format(value)
);

/**
 * The full catalogue row for a resort, laid out the way a skier reads one: how big
 * the mountain is, what the terrain splits into, how you get up it, how much snow
 * falls on it, and what a day costs. Sections disappear entirely when the row has
 * nothing for them — see {@link hasDeepSkiStats} for why that is the normal case
 * rather than an error.
 */
const SkiFacts: React.FC<{ resort: SkiResort; offers: SkiHotel[] }> = ({ resort, offers }) => {
    // The two imports describe elevation differently; reconcile to one shape.
    const top = num(resort.elevationTopM) ?? num(resort.highestPointM);
    const bottom = num(resort.lowestPointM)
        ?? (num(resort.elevationTopM) != null && num(resort.elevationDifferenceM) != null
            ? resort.elevationTopM! - resort.elevationDifferenceM!
            : null);
    const vertical = num(resort.elevationDifferenceM)
        ?? (top != null && bottom != null ? top - bottom : null);

    const easy = num(resort.beginnerSlopes);
    const mid = num(resort.intermediateSlopes);
    const hard = num(resort.difficultSlopes);
    const slopeTotal = num(resort.totalSlopes) ?? ((easy ?? 0) + (mid ?? 0) + (hard ?? 0) || null);
    const gradedTotal = (easy ?? 0) + (mid ?? 0) + (hard ?? 0);

    const surface = num(resort.surfaceLifts);
    const chair = num(resort.chairLifts);
    const gondola = num(resort.gondolaLifts);
    const lifts = num(resort.totalLifts);

    const amenities = ([
        ['Beginner friendly', resort.childFriendly, faChildren],
        ['Snowpark', resort.snowparks, faPersonSnowboarding],
        ['Night skiing', resort.nightskiing, faMoon],
        ['Summer skiing', resort.summerskiing, faSun],
    ] as const).filter(([, on]) => on === true);

    const hasMountain = top != null || vertical != null || num(resort.longestRunKm) != null;
    const hasTerrain = num(resort.totalSlopeLengthKm) != null || slopeTotal != null;
    const hasLifts = lifts != null || surface != null || chair != null || gondola != null;
    const hasSnow = num(resort.annualSnowfallCm) != null || num(resort.snowCannons) != null
        || !!resort.season;
    const cheapestOffer = offers.find((offer) => num(offer.priceGbp) != null);

    return (
        <div className="ski-facts">
            {/* Only drawn when the summit and base are both known — see
                {@link SkiMountainProfile}. */}
            {top != null && bottom != null && vertical != null && vertical > 0 && (
                <figure className="ski-hero">
                    <SkiMountainProfile top={top} bottom={bottom} vertical={vertical} />
                </figure>
            )}

            <div className="ski-facts__head">
                <div className="ski-facts__identity">
                    <div className="ski-facts__badges">
                        {resort.region && <span className="spot-detail__badge">{resort.region}</span>}
                        {resort.continent && <span className="spot-detail__badge">{resort.continent}</span>}
                        {/* rank is the catalogue's own ordering, and it is sorted by score —
                            #4 of 3,284 says something a raw score of 1214.2 does not. */}
                        {num(resort.rank) != null && resort.sourceFile === 'ski-resorts.csv' && (
                            <span className="spot-detail__badge spot-detail__badge--verified">
                                #{intFmt.format(resort.rank!)} of 3,284
                            </span>
                        )}
                    </div>
                    {amenities.length > 0 && (
                        <div className="ski-amenities">
                            {amenities.map(([label, , icon]) => (
                                <span key={label} className="ski-amenity">
                                    <FontAwesomeIcon icon={icon} />
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {num(resort.price) != null && (
                    <div className="ski-facts__price">
                        <b>€{intFmt.format(resort.price!)}</b>
                        <span>day pass</span>
                        {/* The catalogue's own figure, not a live quote. The house rule is
                            that anything priced says which of those two it is. */}
                        <em className="ski-facts__price-note">catalogue rate</em>
                    </div>
                )}
            </div>

            {hasMountain && (
                <div className="ski-facts__group">
                    <h5 className="ski-facts__group-title">The mountain</h5>
                    {top != null && bottom != null && vertical != null && (
                        <ElevationBadge top={top} bottom={bottom} vertical={vertical} />
                    )}
                    <div className="ski-facts__stats">
                        {/* Only shown standalone when the badge above could not be built. */}
                        {(top == null || bottom == null || vertical == null) && (
                            <>
                                <Stat label="Top" value={top != null ? `${intFmt.format(top)} m` : null} />
                                <Stat label="Base" value={bottom != null ? `${intFmt.format(bottom)} m` : null} />
                                <Stat
                                    label="Vertical"
                                    value={vertical != null ? `${intFmt.format(vertical)} m` : null}
                                />
                            </>
                        )}
                        <Stat
                            label="Longest run"
                            value={num(resort.longestRunKm) != null ? `${resort.longestRunKm} km` : null}
                        />
                    </div>
                </div>
            )}

            {hasTerrain && (
                <div className="ski-facts__group">
                    <h5 className="ski-facts__group-title">Terrain</h5>
                    <div className="ski-facts__stats">
                        <Stat
                            label="Pisted"
                            value={num(resort.totalSlopeLengthKm) != null
                                ? `${resort.totalSlopeLengthKm} km` : null}
                        />
                        <Stat label="Runs" value={slopeTotal != null ? intFmt.format(slopeTotal) : null} />
                    </div>
                    {gradedTotal > 0 && (
                        <PisteMarkers easy={easy ?? 0} mid={mid ?? 0} hard={hard ?? 0} />
                    )}
                </div>
            )}

            {hasLifts && (
                <div className="ski-facts__group">
                    <h5 className="ski-facts__group-title">Lifts</h5>
                    {/* Lift type is the one stat where the icon carries it faster than the
                        word: a rider scanning for gondolas is looking for the shape. */}
                    <div className="ski-lifts">
                        {([
                            ['Gondolas', gondola, faCableCar],
                            ['Chairs', chair, faChair],
                            // No drag-lift glyph exists in the free set; an upward
                            // arrow is at least honest about what a surface lift does.
                            ['Surface', surface, faArrowUp],
                        ] as const).map(([label, count, icon]) => (count == null ? null : (
                            <div key={label} className="ski-lift">
                                <FontAwesomeIcon icon={icon} className="ski-lift__icon" />
                                <span className="ski-lift__count">{intFmt.format(count)}</span>
                                <span className="ski-lift__label">{label}</span>
                            </div>
                        )))}
                    </div>
                    <div className="ski-facts__stats">
                        <Stat label="Total lifts" value={lifts != null ? intFmt.format(lifts) : null} />
                        <Stat
                            label="Uphill capacity"
                            value={num(resort.liftCapacity) != null
                                ? `${compactRiders(resort.liftCapacity!)} riders/h` : null}
                        />
                    </div>
                </div>
            )}

            {hasSnow && (
                <div className="ski-facts__group">
                    <h5 className="ski-facts__group-title">Snow</h5>
                    <div className="ski-facts__stats">
                        <Stat
                            label={<><FontAwesomeIcon icon={faSnowflake} /> Annual snowfall</>}
                            value={num(resort.annualSnowfallCm) != null
                                ? `${intFmt.format(resort.annualSnowfallCm!)} cm` : null}
                        />
                        <Stat
                            label={<><FontAwesomeIcon icon={faTemperatureLow} /> Snow cannons</>}
                            value={num(resort.snowCannons) != null
                                ? intFmt.format(resort.snowCannons!) : null}
                        />
                        <Stat label="Season" value={resort.season || null} />
                    </div>
                </div>
            )}

            {offers.length > 0 && (
                <div className="ski-facts__group">
                    <h5 className="ski-facts__group-title">
                        Package deals <span className="ski-facts__count">{offers.length}</span>
                    </h5>
                    <div className="ski-offers">
                        {offers.map((offer) => (
                            <a
                                key={offer.id ?? offer.hotel}
                                className="ski-offer"
                                href={offer.link}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                            >
                                <span className="ski-offer__name">
                                    {(offer.hotel ?? '').replace(/-/g, ' ')}
                                </span>
                                <span className="ski-offer__meta">
                                    {num(offer.distanceFromLiftM) != null && (
                                        <span>{intFmt.format(offer.distanceFromLiftM!)} m to lift</span>
                                    )}
                                    {num(offer.sleeps) != null && <span>sleeps {offer.sleeps}</span>}
                                </span>
                                {num(offer.priceGbp) != null && (
                                    <span className="ski-offer__price">
                                        £{intFmt.format(offer.priceGbp!)}
                                    </span>
                                )}
                            </a>
                        ))}
                    </div>
                    <p className="spot-detail__ways-footnote">
                        Catalogue prices from igluski, not live — check the operator before booking.
                    </p>
                </div>
            )}

            {resort.url && (
                <p className="spot-setup__site">
                    <a href={resort.url} target="_blank" rel="noopener noreferrer">
                        Official site
                    </a>
                </p>
            )}

            <aside className="ski-cost-boundary">
                <strong>What is known — and what is not</strong>
                <div className="ski-cost-boundary__grid">
                    <span>
                        <b>Lift pass</b>
                        {num(resort.price) != null ? ` €${intFmt.format(resort.price!)} catalogue rate` : ' no current price'}
                    </span>
                    <span>
                        <b>Sleep</b>
                        {cheapestOffer ? ` from £${intFmt.format(cheapestOffer.priceGbp!)} in an external listing` : ' no matching offer'}
                    </span>
                    <span><b>Airport transfer</b> checked only after a route is selected</span>
                    <span><b>Equipment hire and food</b> excluded — no verified price here</span>
                </div>
                <p>These are separate costs, not an all-in checkout. Check the resort and provider before booking.</p>
            </aside>
        </div>
    );
};

interface SpotDetailProps {
    spot: SpotCard;
    accessDetail: AccessDetail | null;
    accessLoading: boolean;
    departure: string;
    onPlanTrip: (arrivalAirport: string | null) => void;
}

const SpotDetail: React.FC<SpotDetailProps> = ({ spot, accessDetail, accessLoading, departure, onPlanTrip }) => {
    const ways = accessDetail?.ways ?? spot.access ?? [];
    const [arrival, setArrival] = useState<ArrivalOptions | null>(null);
    const [arrivalLoading, setArrivalLoading] = useState(false);
    const [stationRetry, setStationRetry] = useState(0);
    const [detail, setDetail] = useState<SpotDetailData | null>(null);
    const [stays, setStays] = useState<NearbyStay[]>([]);
    const [staysStatus, setStaysStatus] = useState<'loading' | 'done' | 'error'>('loading');
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    /**
     * Attaches a photo to this spot. Stored as OWN/SELF_HOSTED and promoted to the
     * front of the display order server-side, so your own picture immediately
     * replaces whatever was scraped from the park's website.
     */
    const uploadPhoto = (file: File) => {
        if (!spot.slug || uploading) return;
        setUploading(true);
        setUploadError(null);
        const body = new FormData();
        body.append('file', file);
        fetch(`${API_BASE}/api/spots/${encodeURIComponent(spot.slug)}/photo?subject=OVERVIEW`, {
            method: 'POST',
            body,
        })
            .then(async (res) => {
                if (!res.ok) {
                    const problem = await res.json().catch(() => null);
                    throw new Error(problem?.message ?? `Upload failed (HTTP ${res.status})`);
                }
                return res.json();
            })
            .then((updated) => setDetail(updated))
            .catch((err) => setUploadError(err.message))
            .finally(() => setUploading(false));
    };

    // The rich record, for every database-backed spot. Curated JSON venues have no
    // slug and simply skip this — they carry their detail in the catalog already.
    useEffect(() => {
        if (!spot.slug) {
            setDetail(null);
            return undefined;
        }
        let cancelled = false;
        fetch(`${API_BASE}/api/spots/${encodeURIComponent(spot.slug)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (!cancelled) setDetail(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [spot.slug]);

    const curationBadge = spot.curationLevel ? CURATION_BADGE[spot.curationLevel] : null;
    // Memoised because SpotMap takes this as a prop and keys its map-creation
    // effect on it. Built inline, it was a new object on every render, so the
    // effect tore the maplibre map down and rebuilt it continuously.
    const spotWithCoords: SpotCard = useMemo(() => ({
        ...spot,
        cityLatitude: spot.cityLatitude ?? accessDetail?.cityLatitude ?? null,
        cityLongitude: spot.cityLongitude ?? accessDetail?.cityLongitude ?? null,
        airportLatitude: spot.airportLatitude ?? accessDetail?.airportLatitude ?? null,
        airportLongitude: spot.airportLongitude ?? accessDetail?.airportLongitude ?? null,
    }), [spot, accessDetail]);
    const lat = spotWithCoords.cityLatitude;
    const lon = spotWithCoords.cityLongitude;

    // Only for spots with no curated access block. A curated way in carries local
    // knowledge ("Avignon TGV is 2h40 from Paris"); this is the derived fallback, and
    // fetching it for a spot that already has the real thing would just add noise.
    //
    // A slug is not required. The curated JSON venues have none, so before the
    // coordinate form of this endpoint existed they fell through both paths and the
    // card said nothing at all about getting there. Coordinates are all it needs.
    // Places to sleep around the spot. Keyed on the coordinates rather than the
    // spot object so the lookup does not re-run when an unrelated field (the
    // access block, an uploaded photo) lands on the same spot.
    useEffect(() => {
        if (lat == null || lon == null) {
            setStays([]);
            setStaysStatus('done');
            return undefined;
        }
        let cancelled = false;
        setStays([]);
        setStaysStatus('loading');
        loadStaysNear(lat, lon, SPOT_STAY_RADIUS_KM)
            .then((result) => {
                if (cancelled) return;
                setStays(result.stays);
                setStaysStatus('done');
            })
            .catch(() => {
                if (!cancelled) setStaysStatus('error');
            });
        return () => { cancelled = true; };
    }, [lat, lon]);

    const arrivalUrl = spot.slug
        ? `${API_BASE}/api/spots/${encodeURIComponent(spot.slug)}/arrival`
        : lat != null && lon != null
            ? `${API_BASE}/api/spots/arrival?lat=${lat}&lon=${lon}&label=${encodeURIComponent(spot.destinationLabel)}`
            : null;
    const needsArrival = !accessLoading && ways.length === 0 && !!arrivalUrl;
    useEffect(() => {
        if (!needsArrival) {
            setArrival(null);
            setStationRetry(0);
            return undefined;
        }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Only the first attempt shows a spinner. The retries below are topping up a
        // card that is already on screen, and blanking it back to "working it out"
        // would look like a page that keeps losing its place.
        if (stationRetry === 0) setArrivalLoading(true);
        fetch(arrivalUrl!)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: ArrivalOptions | null) => {
                if (cancelled) return;
                setArrival(data);
                // The airports come from our own database and are already in hand; the
                // station is an OpenStreetMap lookup that sometimes runs long and
                // finishes in the background. Ask again rather than making the whole
                // card wait for it — or drop it silently.
                if (data?.stationPending && stationRetry < STATION_RETRIES) {
                    timer = setTimeout(() => setStationRetry((n) => n + 1), STATION_RETRY_DELAY_MS);
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setArrivalLoading(false); });
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [needsArrival, arrivalUrl, stationRetry]);

    return (
        <div className="spot-detail">
            <div className="spot-detail__header">
                <h3 className="spot-detail__name">{spot.destinationLabel}</h3>
                <div className="spot-detail__badges">
                    {curationBadge && (
                        <span className="spot-detail__badge spot-detail__badge--verified">{curationBadge}</span>
                    )}
                    {spot.towType && (
                        <span className="spot-detail__badge">{spot.towType.toLowerCase()}</span>
                    )}
                    {spot.country && (
                        <span className="spot-detail__badge">{countryLabel(spot.country)}</span>
                    )}
                </div>
            </div>

            {hasCoordinates(spotWithCoords) && (
                <div className="spot-detail__coords">
                    <FontAwesomeIcon icon={faLocationDot} /> {spotWithCoords.cityLatitude!.toFixed(4)}, {spotWithCoords.cityLongitude!.toFixed(4)}
                    {spot.arrivalAirport && (
                        <span className="spot-detail__airport"> · Nearest airport: {spot.arrivalAirport}</span>
                    )}
                </div>
            )}

            {spot.ski && (
                <div className="spot-detail__ski-preview">
                    <SpotTile
                        slug={null}
                        label={spot.destinationLabel}
                        photoUrl={null}
                        towType={null}
                        variant="hero"
                    />
                    <div>
                        <p className="spot-detail__section-title">Ski resort</p>
                        <p className="spot-detail__ski-preview-copy">
                            Terrain, snow and listed costs first. Flights, transfers and live availability come next.
                        </p>
                        <button
                            type="button"
                            className="spot-detail__ski-preview-cta"
                            onClick={() => onPlanTrip(null)}
                        >
                            Check flights and trip costs
                        </button>
                    </div>
                </div>
            )}

            {spot.ski && <SkiFacts resort={spot.ski} offers={spot.skiHotels ?? []} />}

            {/* Drop a photo straight onto the spot you are looking at. Only for
                database-backed spots — curated JSON venues have no slug to post to. */}
            {spot.slug && (
                <div
                    className={`spot-drop ${dragOver ? 'spot-drop--over' : ''} ${uploading ? 'spot-drop--busy' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) uploadPhoto(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        hidden
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPhoto(file);
                            e.target.value = '';
                        }}
                    />
                    {uploading
                        ? 'Uploading…'
                        : dragOver
                            ? 'Drop to attach'
                            : '📷 Drop a photo here, or click to choose one'}
                </div>
            )}
            {uploadError && <p className="spot-drop__error">{uploadError}</p>}

            {/* The park's own photo. Credit and a link back are not decoration: these
                images stay the park's copyright and are hotlinked, never copied. */}
            {(detail?.photoUrl || spot.imageUrl) && (
                <figure className="spot-photo">
                    <img
                        src={detail?.photoUrl ?? spot.imageUrl ?? ''}
                        alt={spot.destinationLabel}
                        loading="lazy"
                        onError={(event) => { (event.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {(detail?.photoCredit || spot.imageCredit) && (
                        <figcaption>
                            {detail?.websiteUrl ? (
                                <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
                                    {detail?.photoCredit ?? spot.imageCredit}
                                </a>
                            ) : (detail?.photoCredit ?? spot.imageCredit)}
                        </figcaption>
                    )}
                </figure>
            )}

            {detail && (detail.tractionType || detail.obstacleCount || detail.moduleTypes.length > 0
                || detail.seasonStartMonth || detail.dayPassPrice || detail.websiteUrl) && (
                <div className="spot-detail__section spot-setup">
                    <h4 className="spot-detail__section-title">The setup</h4>
                    <div className="spot-setup__facts">
                        {detail.tractionType && (
                            <span className="spot-setup__fact">
                                <b>{TRACTION_LABEL[detail.tractionType] ?? detail.tractionType}</b>
                                {detail.cableTowers ? ` · ${detail.cableTowers} towers` : ''}
                                {detail.systemTwoCount ? ` · ${detail.systemTwoCount}× System 2.0` : ''}
                            </span>
                        )}
                        {detail.obstacleCount != null && (
                            <span className="spot-setup__fact">{detail.obstacleCount} obstacles</span>
                        )}
                        {detail.seasonStartMonth && detail.seasonEndMonth && (
                            <span className="spot-setup__fact">
                                Open {MONTHS[detail.seasonStartMonth]}–{MONTHS[detail.seasonEndMonth]}
                            </span>
                        )}
                        {detail.dayPassPrice != null && (
                            <span className="spot-setup__fact">
                                Day pass {formatPrice(detail.dayPassPrice, detail.priceCurrency ?? 'EUR')}
                            </span>
                        )}
                        {detail.hourPassPrice != null && (
                            <span className="spot-setup__fact">
                                1h {formatPrice(detail.hourPassPrice, detail.priceCurrency ?? 'EUR')}
                            </span>
                        )}
                        {detail.gearRental && <span className="spot-setup__fact">gear rental</span>}
                        {detail.proShop && <span className="spot-setup__fact">pro shop</span>}
                    </div>

                    {detail.moduleTypes.length > 0 && (
                        <div className="spot-setup__modules">
                            {detail.moduleTypes.map((m) => (
                                <span key={m} className="spot-setup__module">{MODULE_LABEL[m] ?? m.toLowerCase()}</span>
                            ))}
                        </div>
                    )}

                    {detail.setupNotes && <p className="spot-setup__notes">{detail.setupNotes}</p>}

                    {detail.websiteUrl && (
                        <p className="spot-setup__site">
                            <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
                                {new URL(detail.websiteUrl).hostname.replace(/^www\./, '')} ↗
                            </a>
                            {' — prices and opening hours are theirs, and more current than ours.'}
                        </p>
                    )}
                </div>
            )}

            <SpotMap spot={spotWithCoords} stays={stays} arrival={arrival} />

            {accessLoading && (
                <p className="spot-finder__muted" style={{ padding: '8px 16px' }}>Loading spot details…</p>
            )}

            {!accessLoading && ways.length === 0 && (
                <div className="spot-detail__section">
                    <div className="spot-detail__section-head">
                        <h4 className="spot-detail__section-title">Getting there</h4>
                        <span className="spot-detail__derived">worked out from the map, not curated</span>
                    </div>

                    {arrivalLoading && <p className="spot-finder__muted">Working out the nearest options…</p>}

                    {!arrivalLoading && arrival && (
                        <div className="spot-detail__ways">
                            {(arrival.airports ?? []).map((airport) => (
                                <div key={airport.iata} className="spot-detail__way">
                                    <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faPlane} /></div>
                                    <div className="spot-detail__way-content">
                                        <span className="spot-detail__way-hub">{airport.iata} · {airport.name}</span>
                                        <span className="spot-detail__way-hint">
                                            {airport.municipality ? `${airport.municipality} — ` : ''}
                                            {airport.distanceKm} km away
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {arrival.station && (
                                <div className="spot-detail__way">
                                    <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faTrain} /></div>
                                    <div className="spot-detail__way-content">
                                        <span className="spot-detail__way-hub">{arrival.station.name}</span>
                                        <span className="spot-detail__way-hint">
                                            nearest station — {arrival.station.distanceKm} km away
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!arrival.station && arrival.stationPending && (
                                <div className="spot-detail__way">
                                    <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faTrain} /></div>
                                    <div className="spot-detail__way-content">
                                        <span className="spot-detail__way-hub">Checking for a station…</span>
                                        <span className="spot-detail__way-hint">
                                            {stationRetry < STATION_RETRIES
                                                ? 'OpenStreetMap is being slow — this fills itself in'
                                                : 'OpenStreetMap did not answer; the airports above are unaffected'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {arrival.drivingDirectionsUrl && (
                                <div className="spot-detail__way">
                                    <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faCar} /></div>
                                    <div className="spot-detail__way-content">
                                        <span className="spot-detail__way-hub">
                                            <a
                                                className="spot-detail__link"
                                                href={arrival.drivingDirectionsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Driving directions ↗
                                            </a>
                                        </span>
                                        <span className="spot-detail__way-hint">opens directions to the exact coordinates</span>
                                    </div>
                                </div>
                            )}

                            {arrival.websiteUrl && (
                                <div className="spot-detail__way">
                                    <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faWater} /></div>
                                    <div className="spot-detail__way-content">
                                        <span className="spot-detail__way-hub">
                                            <a
                                                className="spot-detail__link"
                                                href={arrival.websiteUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                The park's own site ↗
                                            </a>
                                        </span>
                                        <span className="spot-detail__way-hint">prices and opening hours live here, not with us</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!arrivalLoading && arrival && (arrival.airports ?? []).length === 0
                        && !arrival.station && !arrival.stationPending && (
                        <p className="spot-finder__muted">
                            Nothing close enough to be useful — no commercial airport within 250 km
                            and no station within 30 km.
                        </p>
                    )}

                    {/* No coordinates and no slug: there is nothing to derive from, and
                        saying so beats an empty heading that reads like a broken page. */}
                    {!arrivalLoading && !arrival && (
                        <p className="spot-finder__muted">
                            {arrivalUrl
                                ? 'Could not work out the nearest options just now — try again in a moment.'
                                : 'No coordinates for this spot yet, so there is nothing to work out from.'}
                        </p>
                    )}

                    <p className="spot-detail__ways-footnote">
                        Straight-line distances from the spot's coordinates, not drive times, and
                        nobody has checked this route on the ground. The curated ways in on verified
                        spots are the ones we stand behind.
                    </p>
                </div>
            )}

            {!accessLoading && ways.length > 0 && (
                <div className="spot-detail__section">
                    <div className="spot-detail__section-head">
                        <h4 className="spot-detail__section-title">
                            Getting there from {departure.split(',')[0]}
                        </h4>
                        {accessDetail?.cheapestEntryPrice != null && (
                            <span className="spot-detail__from">
                                flights from {formatPrice(accessDetail.cheapestEntryPrice)}
                            </span>
                        )}
                    </div>
                    <div className="spot-detail__ways">
                        {ways.map((way, index) => (
                            <div key={`${way.mode}-${index}`} className="spot-detail__way">
                                <div className="spot-detail__way-icon">
                                    <FontAwesomeIcon icon={MODE_ICON[way.mode] ?? faPlane} />
                                </div>
                                <div className="spot-detail__way-content">
                                    <span className="spot-detail__way-hub">{way.hub}</span>
                                    <span className="spot-detail__way-hint">{way.lastMile}</span>
                                </div>
                                <div className="spot-detail__way-fare">
                                    {way.fare ? (
                                        <>
                                            <span className="spot-detail__fare-price">
                                                {formatPrice(way.fare.entryPrice, way.fare.currency)}
                                            </span>
                                            <span className="spot-detail__fare-note">
                                                fare {formatPrice(way.fare.price, way.fare.currency)}
                                                {way.fare.priceLabel ? ` · ${way.fare.priceLabel.toLowerCase()}` : ''}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="spot-detail__fare-none">{unpricedNote(way.mode)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="spot-detail__ways-footnote">
                        Flight fare plus known extras. The last mile above is a hint, not a price —
                        check it before you book.
                    </p>
                </div>
            )}

            {lat != null && lon != null && (
                <NearbyStays
                    latitude={lat}
                    longitude={lon}
                    placeLabel={spot.destinationLabel}
                    stays={stays}
                    status={staysStatus}
                    radiusKm={SPOT_STAY_RADIUS_KM}
                />
            )}

            {spot.slug && (
                <Link
                    to={`/spots/${encodeURIComponent(spot.slug)}`}
                    className="spot-finder__page-link"
                >
                    View full spot page — restaurants, flights &amp; more →
                </Link>
            )}

            <button
                type="button"
                className="spot-finder__plan-cta"
                onClick={() => onPlanTrip(spot.arrivalAirport ?? arrival?.airports[0]?.iata ?? null)}
            >
                Plan this trip from {departure.split(',')[0]} → flights, costs &amp; where to sleep
            </button>
        </div>
    );
};

// ─── Main component ──────────────────────────────────────────────────────────

interface SpotFinderProps {
    initialActivity?: SpotActivity;
}

export default function SpotFinder({ initialActivity = 'wakeboarding' }: SpotFinderProps) {
    const navigate = useNavigate();
    const departure = DEPARTURES[0];
    const [activity, setActivity] = useState<SpotActivity>(initialActivity);
    const [spots, setSpots] = useState<SpotCard[]>([]);
    const [country, setCountry] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [accessDetail, setAccessDetail] = useState<AccessDetail | null>(null);
    const [accessLoading, setAccessLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelected(null);

        const loadSpots = activity === 'skiing'
            ? fetch(`${API_BASE}/api/ski/map`)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json() as Promise<SkiMapResponse>;
                })
                .then((data) => {
                    // Package offers are keyed `country::resort`; bucket them once so
                    // each of the 3,783 resorts is a lookup rather than a scan.
                    const byResort = new Map<string, SkiHotel[]>();
                    for (const hotel of data.hotels) {
                        const key = buildResortJoinKey(hotel.country, hotel.resort);
                        const bucket = byResort.get(key);
                        if (bucket) bucket.push(hotel);
                        else byResort.set(key, [hotel]);
                    }
                    byResort.forEach((list) => list.sort(
                        (a, b) => (a.priceGbp ?? Infinity) - (b.priceGbp ?? Infinity),
                    ));
                    return data.resorts.map((resort) => skiResortToSpot(resort, byResort));
                })
            : fetch(`${API_BASE}/api/destinations/spots?activity=${encodeURIComponent(activity)}`)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json() as Promise<SpotCard[]>;
                });

        loadSpots
            .then((data) => {
                if (cancelled) return;
                setSpots(data.map(normaliseSpot));
                const firstCountry = data.find((s) => s.country)?.country ?? '';
                setCountry(firstCountry);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message ?? 'Could not load spots');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [activity]);

    const countries = useMemo(() => {
        const seen = new Set<string>();
        const list: string[] = [];
        for (const spot of spots) {
            const code = spot.country ?? '';
            if (!seen.has(code)) {
                seen.add(code);
                list.push(code);
            }
        }
        return list;
    }, [spots]);

    const visibleSpots = useMemo(
        () => spots.filter((spot) => (spot.country ?? '') === country),
        [spots, country],
    );

    const selectedSpot = useMemo(
        () => spots.find((spot) => spot.destinationLabel === selected) ?? null,
        [spots, selected],
    );

    /**
     * Gallery order, photographed spots first.
     *
     * Alphabetical put four EXO parks and a run of photoless venues at the top, so
     * the first two screens of a visual grid were entirely generated tiles and every
     * real photograph in the catalogue sat below the fold. Only a third of spots
     * have a photo; leading with them is what makes the page look like a catalogue
     * of places rather than a placeholder. Ties keep the incoming order, which is
     * already alphabetical.
     */
    const gallerySpots = useMemo(
        () => [...visibleSpots]
            .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
            .slice(0, GALLERY_LIMIT),
        [visibleSpots],
    );

    useEffect(() => {
        if (!selected) {
            setAccessDetail(null);
            return;
        }
        let cancelled = false;
        setAccessLoading(true);
        setAccessDetail(null);
        const originIata = resolveOriginAirport(departure);
        fetch(`${API_BASE}/api/destinations/access?destination=${encodeURIComponent(selected)}&origin=${encodeURIComponent(originIata)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled) return;
                if (data) {
                    setAccessDetail({
                        ways: data.ways ?? [],
                        cheapestEntryPrice: data.cheapestEntryPrice ?? null,
                        cityLatitude: data.cityLatitude ?? null,
                        cityLongitude: data.cityLongitude ?? null,
                        airportLatitude: data.airportLatitude ?? null,
                        airportLongitude: data.airportLongitude ?? null,
                    });
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setAccessLoading(false); });
        return () => { cancelled = true; };
    }, [selected, departure]);

    const planTrip = (spotLabel: string, arrivalAirport?: string | null) => {
        const params = new URLSearchParams({
            origin: departure,
            destination: spotLabel,
            activity: EXPLORE_ACTIVITY[activity] ?? activity,
        });
        if (arrivalAirport) {
            params.set('arrivalAirport', arrivalAirport);
        }
        navigate(`/explore?${params.toString()}`);
    };

    const verifiedCount = visibleSpots.filter(
        // "curated" was accurate when every row was hand-written. Now most are
        // machine-discovered, so the count says how many are actually verified
        // rather than implying all of them are.
        (s) => s.curationLevel && CURATION_BADGE[s.curationLevel] === 'Verified',
    ).length;

    return (
        <div className="spot-finder">
            {/* One search bar instead of four numbered steps. The steps described
                the implementation (a cascade of dependent queries); a traveller
                just wants to say where they are, what they ride, and where. */}
            <div className="spot-search panel">
                <div className="spot-search__row">
                    <div className="field spot-search__field spot-search__field--activity">
                        <span className="field__label">Activity</span>
                        <div className="segmented">
                            <button
                                type="button"
                                className={`segmented__option${activity === 'wakeboarding' ? ' segmented__option--active' : ''}`}
                                aria-pressed={activity === 'wakeboarding'}
                                onClick={() => setActivity('wakeboarding')}
                            >
                                <FontAwesomeIcon icon={faWater} />
                                <span>Wakeboard</span>
                            </button>
                            <button
                                type="button"
                                className={`segmented__option${activity === 'skiing' ? ' segmented__option--active' : ''}`}
                                aria-pressed={activity === 'skiing'}
                                onClick={() => setActivity('skiing')}
                            >
                                <FontAwesomeIcon icon={faPersonSkiing} />
                                <span>Ski</span>
                            </button>
                        </div>
                    </div>

                    <label className="field spot-search__field">
                        <span className="field__label">Where</span>
                        <select
                            className="select"
                            value={country}
                            onChange={(event) => setCountry(event.target.value)}
                            disabled={loading || countries.length === 0}
                        >
                            {countries.map((code) => (
                                <option key={code || 'other'} value={code}>{countryLabel(code)}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            {!loading && !error && visibleSpots.length > 0 && (
                <div className="spot-results__head">
                    <h2 className="spot-results__count">
                        {visibleSpots.length} {activity === 'skiing' ? 'resort' : 'spot'}{visibleSpots.length === 1 ? '' : 's'} in {countryLabel(country)}
                    </h2>
                    <span className="spot-results__meta">
                        {activity === 'skiing'
                            ? 'ski resort catalog'
                            : verifiedCount > 0
                                ? `${verifiedCount} verified · the rest are machine-found from OpenStreetMap`
                                : 'machine-found from OpenStreetMap — access is derived, not checked'}
                    </span>
                </div>
            )}

            {!loading && !error && visibleSpots.length > 0 && (
                <SpotOverviewMap
                    spots={visibleSpots}
                    selected={selected}
                    onSelect={(label) => setSelected(label === selected ? null : label)}
                    activity={activity}
                />
            )}

            {loading && <p className="spot-finder__muted">Loading spots…</p>}
            {error && <p className="spot-finder__muted">Couldn't load spots ({error}).</p>}
            {!loading && !error && visibleSpots.length === 0 && (
                <p className="spot-finder__muted">
                    {/* Surf and scuba are in the picker but have no spots behind them.
                        "It's next on the list" promised a roadmap we have not committed
                        to; this says what is actually available instead. */}
                    Nothing in the catalogue for this activity yet — wakeboarding and skiing are the
                    two that are mapped.
                </p>
            )}

            {/* The full list is gone: 124 rows below a map that already shows all 124
                is the same information twice, and the map is the better picker. Only
                the current pick is listed, as the header of its own detail. */}
            {selectedSpot ? (
                <div className="spot-finder__list">
                    <button
                        type="button"
                        className="spot-row spot-row--selected"
                        onClick={() => setSelected(null)}
                        title="Clear selection"
                    >
                        <span className="spot-row__name">{selectedSpot.destinationLabel}</span>
                        <span className="spot-row__meta">
                            {selectedSpot.towType && (
                                <span className="spot-row__badge">{selectedSpot.towType.toLowerCase()}</span>
                            )}
                            {selectedSpot.curationLevel
                                && CURATION_BADGE[selectedSpot.curationLevel] === 'Unverified' && (
                                <span className="spot-row__badge spot-row__badge--unverified">unverified</span>
                            )}
                            <span className="spot-row__modes">
                                {selectedSpot.modes.map((mode) => (
                                    MODE_ICON[mode]
                                        ? <FontAwesomeIcon key={mode} icon={MODE_ICON[mode]} title={mode.toLowerCase()} />
                                        : null
                                ))}
                            </span>
                            <span className="spot-row__ways">
                                {selectedSpot.modes.length === 0
                                    ? 'no ways in yet'
                                    : `${selectedSpot.modes.length} way${selectedSpot.modes.length === 1 ? '' : 's'} in`}
                            </span>
                        </span>
                    </button>
                </div>
            ) : (
                !loading && !error && visibleSpots.length > 0 && (
                    <p className="spot-finder__muted">
                        Click a spot on the map, or pick one below.
                    </p>
                )
            )}

            {/* The gallery.

                The flat 124-row list was removed because it repeated the map, and it
                did — but it left the page with a grey rectangle and a sentence, and
                nothing to look at or browse. A grid of places is not the same object
                as a list of rows: it is scannable, it carries the photograph where
                there is one, and it gives the three-quarters of the catalogue with no
                photo a designed tile instead of nothing.

                Capped, because the point is to give the eye somewhere to land, not to
                paginate the catalogue back onto the page. */}
            {!loading && !error && visibleSpots.length > 0 && (
                <div className="spot-gallery">
                    {gallerySpots.map((spot) => (
                        <button
                            key={spot.slug ?? spot.destinationLabel}
                            type="button"
                            className={`spot-gallery__card${
                                selected === spot.destinationLabel ? ' spot-gallery__card--selected' : ''}`}
                            onClick={() => setSelected(
                                selected === spot.destinationLabel ? null : spot.destinationLabel,
                            )}
                        >
                            <SpotTile
                                slug={spot.slug}
                                label={spot.destinationLabel}
                                photoUrl={spot.imageUrl}
                                towType={spot.towType}
                            />
                            <span className="spot-gallery__body">
                                <span className="spot-gallery__name">{spot.destinationLabel}</span>
                                <span className="spot-gallery__meta">
                                    {spot.towType && (
                                        <span className="spot-gallery__badge">
                                            {(TRACTION_LABEL[spot.towType] ?? spot.towType).toLowerCase()}
                                        </span>
                                    )}
                                    {spot.modes.length > 0 && (
                                        <span className="spot-gallery__ways">
                                            {spot.modes.length} way{spot.modes.length === 1 ? '' : 's'} in
                                        </span>
                                    )}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {!loading && !error && visibleSpots.length > GALLERY_LIMIT && (
                <p className="spot-finder__muted spot-gallery__more">
                    Showing {GALLERY_LIMIT} of {visibleSpots.length}. The map has all of them.
                </p>
            )}

            {selectedSpot && (
                <SpotDetail
                    spot={selectedSpot}
                    accessDetail={accessDetail}
                    accessLoading={accessLoading}
                    departure={departure}
                    onPlanTrip={(airport) => planTrip(selectedSpot.destinationLabel, airport)}
                />
            )}
        </div>
    );
}
