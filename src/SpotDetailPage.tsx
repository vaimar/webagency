import {
    faBed, faCampground, faCar, faCouch, faGraduationCap, faLocationDot, faMoon,
    faPlane, faShip, faShower, faStore, faTrain, faUtensils, faVest, faWater,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from './services/mapStyle';
import { API_BASE, searchFlights, FlightAvailable } from './services/api';
import { resolveOriginAirport } from './services/destinationDirectory';
import { accommodationUrls, placeUrls, flightUrls } from './services/affiliates';
import { trackedFetch } from './services/serviceStatus';
import { NearbyStay, loadStaysNear } from './services/stayGuide';
import { buildMapMarker, MapPoi, POI_RADIUS_M } from './services/mapMarkers';
import { useNearbyPois } from './hooks/useNearbyPois';
import './SpotFinder.css';
import './SpotDetailPage.css';
// After the stylesheets above, deliberately. Each of these pulls in its own CSS,
// and SpotFinder.tsx imports SpotFinder.css before SpotTile — listing them in the
// other order here gives webpack two conflicting orderings for the same pair of
// stylesheets and fails the production build on a mini-css-extract warning.
import SpotTariff, { PriceLine } from './components/SpotTariff';
import SpotTile from './components/SpotTile';

// ─── Types (mirror SpotFinder's wire contracts) ─────────────────────────────

interface SpotAccessFare {
    price: number;
    currency: string;
    entryPrice: number;
    departureDate: string | null;
    priceLabel: string | null;
    priceDisclaimer: string | null;
}

interface SpotAccessWay {
    mode: string;
    hub: string;
    lastMile: string;
    fare?: SpotAccessFare | null;
}

interface SpotCard {
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
}

interface SpotDetailData {
    tractionType: string | null;
    cableTowers: number | null;
    fullCableCount: number | null;
    systemTwoCount: number | null;
    obstacleCount: number | null;
    transferLine: boolean | null;
    beginnerLine: boolean | null;
    proLine: boolean | null;
    nightRiding: boolean | null;
    boatOnSite: boolean | null;
    proShop: boolean | null;
    gearRental: boolean | null;
    wetsuitRental: boolean | null;
    coaching: boolean | null;
    foodOnSite: boolean | null;
    chillArea: boolean | null;
    camping: boolean | null;
    accommodationOnSite: boolean | null;
    changingRooms: boolean | null;
    setupNotes: string | null;
    seasonStartMonth: number | null;
    seasonEndMonth: number | null;
    /** Deprecated on the wire — the tariff panel reads `prices`. Kept so an older
     *  backend that predates spot_price still renders something rather than nothing. */
    dayPassPrice: number | null;
    hourPassPrice: number | null;
    priceCurrency: string | null;
    prices: PriceLine[] | null;
    websiteUrl: string | null;
    moduleTypes: string[];
    photoUrl: string | null;
    photoCredit: string | null;
}

interface NearbyAirport {
    iata: string;
    name: string;
    municipality: string | null;
    country: string | null;
    distanceKm: number;
    latitude: number;
    longitude: number;
}

interface NearbyStation {
    name: string;
    distanceKm: number;
}

interface ArrivalOptions {
    airports: NearbyAirport[];
    station: NearbyStation | null;
    stationPending?: boolean;
    drivingDirectionsUrl: string | null;
    websiteUrl: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

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

const COUNTRY_NAME: Record<string, string> = {
    FR: 'France', ES: 'Spain', IT: 'Italy', IE: 'Ireland', PT: 'Portugal',
    NL: 'Netherlands', DE: 'Germany', GR: 'Greece', LT: 'Lithuania', TR: 'Turkey',
};

const MODE_ICON: Record<string, IconDefinition> = {
    PLANE: faPlane, FERRY: faShip, TRAIN: faTrain,
};

const STAY_ICON: Record<string, IconDefinition> = {
    hotel: faBed, hostel: faBed, guest_house: faBed, apartment: faBed,
    resort: faBed, motel: faBed, camp: faBed, other: faBed,
};

const CURATION_BADGE: Record<string, string> = {
    VENUE_READY: 'Verified', CURATED: 'Curated', ENRICHED: 'Unverified',
    DISCOVERED: 'Unverified', ROUTE_ONLY: 'Route only',
};

const DEPARTURES = ['Limerick, Ireland', 'Dublin, Ireland', 'Cork, Ireland', 'Galway, Ireland'];
const SPOT_STAY_RADIUS_KM = 15;
const STAY_PREVIEW_COUNT = 6;

/**
 * On-site facts, in the order they change a trip. Sleeping and eating decide
 * whether the park is a day out or a weekend; the rest is convenience.
 *
 * Rendered only where the value is exactly `true`. A null amenity means nobody has
 * checked, and showing it greyed out would tell a rider we looked and found none.
 */
const AMENITIES: { key: keyof SpotDetailData; label: string; icon: IconDefinition }[] = [
    { key: 'accommodationOnSite', label: 'Rooms on site', icon: faBed },
    { key: 'camping', label: 'Camping', icon: faCampground },
    { key: 'foodOnSite', label: 'Food on site', icon: faUtensils },
    { key: 'chillArea', label: 'Terrace / chill area', icon: faCouch },
    { key: 'gearRental', label: 'Gear rental', icon: faVest },
    { key: 'wetsuitRental', label: 'Wetsuit rental', icon: faWater },
    { key: 'proShop', label: 'Pro shop', icon: faStore },
    { key: 'coaching', label: 'Coaching', icon: faGraduationCap },
    { key: 'changingRooms', label: 'Changing rooms', icon: faShower },
    { key: 'nightRiding', label: 'Floodlit evenings', icon: faMoon },
];

const countryLabel = (code: string | null): string => (code ? COUNTRY_NAME[code] ?? code : '');

const formatPrice = (amount: number, currency = 'EUR'): string => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency, maximumFractionDigits: 0,
}).format(amount);

const formatDistanceKm = (km: number): string => (
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
);

const unpricedNote = (mode: string): string => (
    mode === 'PLANE' ? 'no direct fare found' : 'curated, no live price'
);

// ─── Detail map ─────────────────────────────────────────────────────────────

type SpotTab = 'getting-there' | 'hotels' | 'restaurants' | 'flights';

interface DetailMapProps {
    lat: number;
    lon: number;
    label: string;
    activeTab: SpotTab;
    airports: NearbyAirport[];
    selectedAirport: NearbyAirport | null;
    stays?: NearbyStay[];
    pois: MapPoi[];
}

const buildRouteLine = (
    fromLon: number, fromLat: number,
    toLon: number, toLat: number,
    steps = 64,
): GeoJSON.Feature<GeoJSON.LineString> => {
    const coords: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lng = fromLon + (toLon - fromLon) * t;
        const lt = fromLat + (toLat - fromLat) * t;
        const arc = Math.sin(t * Math.PI) * 0.15 * Math.abs(fromLon - toLon);
        coords.push([lng, lt + arc]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
};

const ROUTE_SOURCE = 'route-line';
const ROUTE_LAYER = 'route-line-layer';
const ROUTE_CASING = 'route-line-casing';

const DetailMap: React.FC<DetailMapProps> = ({
    lat, lon, label, activeTab, airports, selectedAirport, stays = [], pois,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const [threeD, setThreeD] = useState(false);
    const mapLoadedRef = useRef(false);

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
        if (!containerRef.current) return undefined;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: getMapStyle(),
            center: [lon, lat],
            zoom: 13,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.scrollZoom.disable();
        mapRef.current = map;
        mapLoadedRef.current = false;
        requestAnimationFrame(() => map.resize());

        map.on('load', () => {
            mapLoadedRef.current = true;
            new maplibregl.Marker({ element: buildMapMarker('spot', label) })
                .setLngLat([lon, lat])
                .setPopup(new maplibregl.Popup({ offset: 16 }).setText(label))
                .addTo(map);
        });

        return () => { map.remove(); mapRef.current = null; mapLoadedRef.current = false; };
    }, [lat, lon, label]);

    // Sync markers to active tab
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        if (activeTab === 'getting-there') {
            airports.forEach((ap) => {
                const m = new maplibregl.Marker({ element: buildMapMarker('transport', `${ap.iata} · ${ap.name}`) })
                    .setLngLat([ap.longitude, ap.latitude])
                    .setPopup(new maplibregl.Popup({ offset: 14 }).setText(`${ap.iata} · ${ap.name}`))
                    .addTo(map);
                markersRef.current.push(m);
            });
            if (airports.length > 0) {
                const bounds = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
                airports.forEach((ap) => bounds.extend([ap.longitude, ap.latitude]));
                map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 500 });
            }
        } else if (activeTab === 'hotels') {
            stays.filter((s) => s.latitude != null && s.longitude != null)
                .slice(0, 20)
                .forEach((stay) => {
                    const m = new maplibregl.Marker({ element: buildMapMarker('stay', stay.name) })
                        .setLngLat([stay.longitude!, stay.latitude!])
                        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(stay.name))
                        .addTo(map);
                    markersRef.current.push(m);
                });
            map.easeTo({ center: [lon, lat], zoom: 13, duration: 400 });
        } else if (activeTab === 'restaurants') {
            pois.filter((p) => p.kind === 'restaurant')
                .forEach((poi) => {
                    const m = new maplibregl.Marker({ element: buildMapMarker('restaurant', poi.name) })
                        .setLngLat([poi.lon, poi.lat])
                        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(poi.name))
                        .addTo(map);
                    markersRef.current.push(m);
                });
            map.easeTo({ center: [lon, lat], zoom: 14, duration: 400 });
        }
    }, [activeTab, airports, stays, pois, lat, lon]);

    // Route line for selected airport
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        const clearRoute = () => {
            if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING);
            if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
            if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
        };
        clearRoute();

        if (!selectedAirport) return;

        const feature = buildRouteLine(
            selectedAirport.longitude, selectedAirport.latitude,
            lon, lat,
        );
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: feature });
        map.addLayer({
            id: ROUTE_CASING,
            type: 'line',
            source: ROUTE_SOURCE,
            paint: { 'line-color': '#1a73e8', 'line-width': 5, 'line-opacity': 0.25 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            paint: {
                'line-color': '#1a73e8',
                'line-width': 2.5,
                'line-dasharray': [2, 2],
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        const bounds = new maplibregl.LngLatBounds(
            [selectedAirport.longitude, selectedAirport.latitude],
            [lon, lat],
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 });
    }, [selectedAirport, lat, lon]);

    return (
        <div className="spot-map-wrap">
            <div ref={containerRef} className="sdp-map" />
            <button
                type="button"
                className={`spot-map__3d ${threeD ? 'spot-map__3d--on' : ''}`}
                onClick={toggleThreeD}
            >
                {threeD ? '2D' : '3D'}
            </button>
        </div>
    );
};

// ─── Flight teaser ──────────────────────────────────────────────────────────

interface FlightTeaserProps {
    arrivalAirport: string;
    departure: string;
    spotLabel: string;
}

const FlightTeaser: React.FC<FlightTeaserProps> = ({ arrivalAirport, departure }) => {
    const [flights, setFlights] = useState<FlightAvailable[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        const originIata = resolveOriginAirport(departure);
        searchFlights({ origin: originIata, destination: arrivalAirport })
            .then((result) => {
                if (cancelled) return;
                setFlights(result.flights.slice(0, 3));
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [arrivalAirport, departure]);

    const originCity = departure.split(',')[0];

    if (loading) {
        return (
            <div className="sdp-section">
                <h3 className="sdp-section__title">
                    <FontAwesomeIcon icon={faPlane} /> Flights from {originCity}
                </h3>
                <p className="spot-finder__muted">Checking flights to {arrivalAirport}...</p>
            </div>
        );
    }

    if (error || flights.length === 0) {
        const urls = flightUrls(resolveOriginAirport(departure), arrivalAirport, '');
        return (
            <div className="sdp-section">
                <h3 className="sdp-section__title">
                    <FontAwesomeIcon icon={faPlane} /> Flights from {originCity}
                </h3>
                <p className="spot-finder__muted">
                    No cached flights to {arrivalAirport} right now.
                </p>
                <div className="sdp-links">
                    <a href={urls.googleFlights} target="_blank" rel="noopener noreferrer" className="sdp-link-pill">
                        Google Flights
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="sdp-section">
            <h3 className="sdp-section__title">
                <FontAwesomeIcon icon={faPlane} /> Flights from {originCity} to {arrivalAirport}
            </h3>
            <div className="sdp-flights">
                {flights.map((flight, i) => {
                    const price = typeof flight.price === 'number' ? flight.price : parseFloat(String(flight.price));
                    const honest = flight.realWorldEntryPrice ?? flight.antiCauchemar?.realWorldEntryPrice;
                    const dateLabel = flight.departureDate
                        ? new Date(flight.departureDate).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })
                        : null;
                    return (
                        <div key={i} className="sdp-flight">
                            <div className="sdp-flight__info">
                                {dateLabel && <span className="sdp-flight__date">{dateLabel}</span>}
                                {flight.airline && <span className="sdp-flight__airline">{flight.airline}</span>}
                                {flight.priceLabel && (
                                    <span className="sdp-flight__label">{flight.priceLabel}</span>
                                )}
                            </div>
                            <div className="sdp-flight__prices">
                                <span className="sdp-flight__price">{formatPrice(price, flight.currency)}</span>
                                {honest != null && honest !== price && (
                                    <span className="sdp-flight__honest">
                                        honest {formatPrice(honest, flight.currency)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {flights[0]?.departureDate && (
                <div className="sdp-links" style={{ marginTop: 8 }}>
                </div>
            )}
        </div>
    );
};

// ─── Main page component ────────────────────────────────────────────────────

export default function SpotDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const [spot, setSpot] = useState<SpotCard | null>(null);
    const [detail, setDetail] = useState<SpotDetailData | null>(null);
    const [arrival, setArrival] = useState<ArrivalOptions | null>(null);
    const [stays, setStays] = useState<NearbyStay[]>([]);
    const [staysStatus, setStaysStatus] = useState<'loading' | 'done' | 'error'>('loading');
    const [departure, setDeparture] = useState<string>(DEPARTURES[0]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState<SpotTab>('getting-there');
    const [selectedAirport, setSelectedAirport] = useState<NearbyAirport | null>(null);

    // Fetch the spot card from the full list (filter by slug)
    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        setLoading(true);
        setNotFound(false);

        trackedFetch(`${API_BASE}/api/destinations/spots?activity=wakeboarding`)
            .then((res) => res.ok ? res.json() : Promise.reject())
            .then((data: SpotCard[]) => {
                if (cancelled) return;
                const found = data.find((s) => s.slug === slug);
                if (found) {
                    setSpot({
                        ...found,
                        cityLatitude: found.cityLatitude ?? (found as any).latitude ?? null,
                        cityLongitude: found.cityLongitude ?? (found as any).longitude ?? null,
                    });
                } else {
                    setNotFound(true);
                }
            })
            .catch(() => { if (!cancelled) setNotFound(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [slug]);

    // Fetch the enriched detail
    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        trackedFetch(`${API_BASE}/api/spots/${encodeURIComponent(slug)}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => { if (!cancelled) setDetail(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [slug]);

    // Fetch arrival options
    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        trackedFetch(`${API_BASE}/api/spots/${encodeURIComponent(slug)}/arrival`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => { if (!cancelled) setArrival(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [slug]);

    // Fetch nearby stays
    const lat = spot?.cityLatitude;
    const lon = spot?.cityLongitude;
    useEffect(() => {
        if (lat == null || lon == null) {
            setStays([]);
            setStaysStatus('done');
            return;
        }
        let cancelled = false;
        setStaysStatus('loading');
        loadStaysNear(lat, lon, SPOT_STAY_RADIUS_KM)
            .then((result) => {
                if (cancelled) return;
                setStays(result.stays);
                setStaysStatus('done');
            })
            .catch(() => { if (!cancelled) setStaysStatus('error'); });
        return () => { cancelled = true; };
    }, [lat, lon]);


    const allAirports = useMemo<NearbyAirport[]>(() => arrival?.airports ?? [], [arrival]);

    const curationBadge = spot?.curationLevel ? CURATION_BADGE[spot.curationLevel] : null;
    const ways = spot?.access ?? [];
    const photoUrl = detail?.photoUrl || spot?.imageUrl;
    const photoCredit = detail?.photoCredit || spot?.imageCredit;
    const arrivalAirport = spot?.arrivalAirport ?? arrival?.airports[0]?.iata ?? null;

    const handleAirportClick = (airport: NearbyAirport) => {
        setSelectedAirport((prev) => prev?.iata === airport.iata ? null : airport);
    };

    const { pois, status: poiStatus, retry: retryPois } = useNearbyPois(lat, lon, activeTab === 'restaurants');
    const restaurants = pois.filter((p) => p.kind === 'restaurant');

    if (loading) {
        return (
            <section className="sdp">
                <p className="spot-finder__muted" style={{ padding: 40, textAlign: 'center' }}>
                    Loading spot...
                </p>
            </section>
        );
    }

    if (notFound || !spot) {
        return (
            <section className="sdp">
                <div className="sdp-empty">
                    <h2>Spot not found</h2>
                    <p>This spot doesn't exist or isn't in the database yet.</p>
                    <Link to="/spots" className="sdp-back">Browse all spots</Link>
                </div>
            </section>
        );
    }

    return (
        <section className="sdp">
            {/* Breadcrumb */}
            <nav className="sdp-breadcrumb">
                <Link to="/spots">Spots</Link>
                <span className="sdp-breadcrumb__sep">/</span>
                <span>{spot.destinationLabel}</span>
            </nav>

            {/* Hero */}
            <header className="sdp-hero">
                {/* Always a hero, photograph or not.

                    This used to render only when the spot had a photo, so three
                    quarters of the catalogue opened on a bare white card with a
                    heading — the page looked unfinished rather than un-photographed.
                    SpotTile falls back to a tile generated from the slug, which is a
                    deliberate-looking state and, being stable per spot, gives each
                    park its own colour on return visits.

                    The credit stays outside the tile so it can carry a link to the
                    park, which SpotTile has no business knowing about. */}
                <div className="sdp-hero__photo">
                    <SpotTile
                        slug={spot.slug}
                        label={spot.destinationLabel}
                        photoUrl={photoUrl ?? null}
                        towType={spot.towType}
                        variant="hero"
                    />
                    {photoUrl && photoCredit && (
                        <span className="sdp-hero__credit">
                            {detail?.websiteUrl ? (
                                <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
                                    {photoCredit}
                                </a>
                            ) : photoCredit}
                        </span>
                    )}
                </div>
                <div className="sdp-hero__info">
                    <h1 className="sdp-hero__name">{spot.destinationLabel}</h1>
                    <div className="sdp-hero__badges">
                        {curationBadge && (
                            <span className={`sdp-badge ${curationBadge === 'Verified' ? 'sdp-badge--verified' : ''}`}>
                                {curationBadge}
                            </span>
                        )}
                        {spot.towType && <span className="sdp-badge">{spot.towType.toLowerCase()}</span>}
                        {spot.country && <span className="sdp-badge">{countryLabel(spot.country)}</span>}
                    </div>
                    {lat != null && lon != null && (
                        <p className="sdp-hero__coords">
                            <FontAwesomeIcon icon={faLocationDot} /> {lat.toFixed(4)}, {lon.toFixed(4)}
                            {spot.arrivalAirport && <span> · Nearest airport: {spot.arrivalAirport}</span>}
                        </p>
                    )}
                </div>
            </header>

            {/* The setup.

                Facts are labelled rather than thrown into one bag of pills: a rider
                scanning for "is this a full cable or a shuttle" should not have to
                read six chips to find out which one is the traction. Price is
                deliberately absent — it lives in its own panel below, because a park
                sells four or five products and none of them fits on a chip. */}
            {detail && (detail.tractionType || detail.obstacleCount != null || detail.moduleTypes.length > 0
                || detail.seasonStartMonth || detail.setupNotes || detail.websiteUrl) && (
                <div className="sdp-section sdp-card">
                    <h3 className="sdp-section__title">The setup</h3>

                    <dl className="sdp-facts">
                        {detail.tractionType && (
                            <div className="sdp-fact">
                                <dt className="sdp-fact__label">Traction</dt>
                                <dd className="sdp-fact__value">
                                    {TRACTION_LABEL[detail.tractionType] ?? detail.tractionType}
                                    {(detail.cableTowers || detail.systemTwoCount || detail.fullCableCount) && (
                                        <span className="sdp-fact__detail">
                                            {[
                                                detail.fullCableCount ? `${detail.fullCableCount}x full cable` : null,
                                                detail.systemTwoCount ? `${detail.systemTwoCount}x System 2.0` : null,
                                                detail.cableTowers ? `${detail.cableTowers} towers` : null,
                                            ].filter(Boolean).join(' · ')}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        )}

                        {detail.obstacleCount != null && (
                            <div className="sdp-fact">
                                <dt className="sdp-fact__label">Obstacles</dt>
                                <dd className="sdp-fact__value">
                                    {detail.obstacleCount}
                                    {detail.transferLine && (
                                        <span className="sdp-fact__detail">linked as a transfer line</span>
                                    )}
                                </dd>
                            </div>
                        )}

                        {detail.seasonStartMonth && detail.seasonEndMonth && (
                            <div className="sdp-fact">
                                <dt className="sdp-fact__label">Season</dt>
                                <dd className="sdp-fact__value">
                                    {MONTHS[detail.seasonStartMonth]}–{MONTHS[detail.seasonEndMonth]}
                                </dd>
                            </div>
                        )}

                        {(detail.beginnerLine || detail.proLine || detail.boatOnSite) && (
                            <div className="sdp-fact">
                                <dt className="sdp-fact__label">Lines</dt>
                                <dd className="sdp-fact__value">
                                    {[
                                        detail.beginnerLine ? 'beginner line' : null,
                                        detail.proLine ? 'pro line' : null,
                                        detail.boatOnSite ? 'boat tow' : null,
                                    ].filter(Boolean).join(' · ')}
                                </dd>
                            </div>
                        )}
                    </dl>

                    {/* What is on site, as a list of things rather than a clause buried
                        in a paragraph. Every one of these was already a column on the
                        entity; the page simply never asked for them. */}
                    {AMENITIES.some((a) => detail[a.key] === true) && (
                        <ul className="sdp-amenities">
                            {AMENITIES.filter((a) => detail[a.key] === true).map((a) => (
                                <li key={a.key} className="sdp-amenity">
                                    <FontAwesomeIcon icon={a.icon} className="sdp-amenity__icon" />
                                    <span>{a.label}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {detail.moduleTypes.length > 0 && (
                        <div className="spot-setup__modules">
                            {detail.moduleTypes.map((m) => (
                                <span key={m} className="spot-setup__module">
                                    {MODULE_LABEL[m] ?? m.toLowerCase()}
                                </span>
                            ))}
                        </div>
                    )}

                    {detail.setupNotes && <p className="spot-setup__notes">{detail.setupNotes}</p>}

                    {detail.websiteUrl && (
                        <p className="spot-setup__site">
                            <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
                                {new URL(detail.websiteUrl).hostname.replace(/^www\./, '')} ↗
                            </a>
                            {' — opening hours are theirs, and more current than ours.'}
                        </p>
                    )}
                </div>
            )}

            {/* What it costs. Its own panel because the tariff is structured data now,
                not a sentence: sessions, party rates, gear supplements and packs, each
                with what it buys and who it covers. */}
            {detail?.prices && detail.prices.length > 0 && <SpotTariff prices={detail.prices} />}

            {/* Departure selector bar */}
            <div className="sdp-origin-bar">
                <label className="sdp-origin-bar__label">
                    <FontAwesomeIcon icon={faPlane} />
                    <span>Flying from</span>
                    <select
                        className="sdp-origin-bar__select"
                        value={departure}
                        onChange={(e) => setDeparture(e.target.value)}
                    >
                        {DEPARTURES.map((city) => (
                            <option key={city} value={city}>{city}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Map + Tabs */}
            {lat != null && lon != null && (
                <div className="sdp-card sdp-map-tabs">
                    <DetailMap
                        lat={lat}
                        lon={lon}
                        label={spot.destinationLabel}
                        activeTab={activeTab}
                        airports={allAirports}
                        selectedAirport={selectedAirport}
                        stays={stays}
                        pois={pois}
                    />

                    {/* Tab bar */}
                    <nav className="sdp-tabs">
                        <button
                            type="button"
                            className={`sdp-tab ${activeTab === 'getting-there' ? 'sdp-tab--active' : ''}`}
                            onClick={() => { setActiveTab('getting-there'); setSelectedAirport(null); }}
                        >
                            <FontAwesomeIcon icon={faPlane} /> Getting there
                        </button>
                        <button
                            type="button"
                            className={`sdp-tab ${activeTab === 'hotels' ? 'sdp-tab--active' : ''}`}
                            onClick={() => { setActiveTab('hotels'); setSelectedAirport(null); }}
                        >
                            <FontAwesomeIcon icon={faBed} /> Hotels
                            {staysStatus === 'done' && stays.length > 0 && (
                                <span className="sdp-tab__count">{stays.length}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`sdp-tab ${activeTab === 'restaurants' ? 'sdp-tab--active' : ''}`}
                            onClick={() => { setActiveTab('restaurants'); setSelectedAirport(null); }}
                        >
                            <FontAwesomeIcon icon={faUtensils} /> Restaurants
                            {restaurants.length > 0 && (
                                <span className="sdp-tab__count">{restaurants.length}</span>
                            )}
                        </button>
                        {arrivalAirport && (
                            <button
                                type="button"
                                className={`sdp-tab ${activeTab === 'flights' ? 'sdp-tab--active' : ''}`}
                                onClick={() => { setActiveTab('flights'); setSelectedAirport(null); }}
                            >
                                <FontAwesomeIcon icon={faPlane} /> Flights
                            </button>
                        )}
                    </nav>

                    {/* ── Getting there panel ── */}
                    {activeTab === 'getting-there' && (
                        <div className="sdp-tab-panel">
                            {ways.length > 0 && (
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
                            )}

                            {ways.length === 0 && arrival && (
                                <div className="spot-detail__ways">
                                    {allAirports.map((airport) => (
                                        <button
                                            key={airport.iata}
                                            type="button"
                                            className={`spot-detail__way spot-detail__way--clickable${selectedAirport?.iata === airport.iata ? ' spot-detail__way--selected' : ''}`}
                                            onClick={() => handleAirportClick(airport)}
                                        >
                                            <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faPlane} /></div>
                                            <div className="spot-detail__way-content">
                                                <span className="spot-detail__way-hub">{airport.iata} · {airport.name}</span>
                                                <span className="spot-detail__way-hint">
                                                    {airport.municipality ? `${airport.municipality} — ` : ''}
                                                    {formatDistanceKm(airport.distanceKm)}
                                                </span>
                                            </div>
                                            <span className="spot-detail__way-action">
                                                {selectedAirport?.iata === airport.iata ? 'Hide route' : 'Show route'}
                                            </span>
                                        </button>
                                    ))}
                                    {arrival.station && (
                                        <div className="spot-detail__way">
                                            <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faTrain} /></div>
                                            <div className="spot-detail__way-content">
                                                <span className="spot-detail__way-hub">{arrival.station.name}</span>
                                                <span className="spot-detail__way-hint">
                                                    nearest station — {formatDistanceKm(arrival.station.distanceKm)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {arrival.drivingDirectionsUrl && (
                                        <div className="spot-detail__way">
                                            <div className="spot-detail__way-icon"><FontAwesomeIcon icon={faCar} /></div>
                                            <div className="spot-detail__way-content">
                                                <a className="spot-detail__link" href={arrival.drivingDirectionsUrl} target="_blank" rel="noopener noreferrer">
                                                    Driving directions ↗
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {ways.length === 0 && !arrival && (
                                <p className="spot-finder__muted">Working out how to get here...</p>
                            )}

                            {ways.length === 0 && arrival && (
                                <p className="spot-detail__ways-footnote">
                                    Click an airport to trace its route on the map.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Hotels panel ── */}
                    {activeTab === 'hotels' && (
                        <div className="sdp-tab-panel">
                            {staysStatus === 'loading' && (
                                <p className="spot-finder__muted">Looking for places to sleep...</p>
                            )}

                            {staysStatus === 'error' && (
                                <p className="spot-finder__muted">
                                    Couldn't load stays.{' '}
                                    <a className="spot-detail__link" href={accommodationUrls(spot.destinationLabel).booking} target="_blank" rel="noopener noreferrer">
                                        Search Booking directly ↗
                                    </a>
                                </p>
                            )}

                            {staysStatus === 'done' && stays.length === 0 && (
                                <p className="spot-finder__muted">
                                    Nothing mapped within {SPOT_STAY_RADIUS_KM} km.{' '}
                                    <a className="spot-detail__link" href={accommodationUrls(spot.destinationLabel).booking} target="_blank" rel="noopener noreferrer">
                                        Try Booking for the area ↗
                                    </a>
                                </p>
                            )}

                            {stays.length > 0 && (
                                <>
                                    <p className="sdp-tab-panel__meta">
                                        {stays.length} within {SPOT_STAY_RADIUS_KM} km
                                    </p>
                                    <ul className="spot-stays">
                                        {stays.slice(0, STAY_PREVIEW_COUNT).map((stay) => {
                                            const booking = stay.bookingLink ?? accommodationUrls(stay.name, spot.destinationLabel).booking;
                                            const maps = stay.latitude != null && stay.longitude != null
                                                ? `https://www.google.com/maps/search/?api=1&query=${stay.latitude},${stay.longitude}`
                                                : placeUrls(stay.name, spot.destinationLabel).googleMaps;
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
                                                            {stay.rating != null && ` · ${stay.rating.toFixed(1)}`}
                                                        </span>
                                                        <span className="spot-stay__links">
                                                            <a className="spot-detail__link" href={booking} target="_blank" rel="noopener noreferrer">
                                                                {stay.pricePerNight != null ? 'Book ↗' : 'Check rate ↗'}
                                                            </a>
                                                            <a className="spot-detail__link" href={maps} target="_blank" rel="noopener noreferrer">
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
                                                            </>
                                                        ) : (
                                                            <span className="spot-detail__fare-none">no live rate</span>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Restaurants panel ── */}
                    {activeTab === 'restaurants' && (
                        <div className="sdp-tab-panel">
                            {/* Four distinct outcomes, because "Looking for
                                restaurants nearby..." was shown for all of them —
                                including after the lookup had finished and found
                                nothing, which is most spots. It read as a request
                                that never came back. */}
                            {poiStatus === 'loading' && (
                                <p className="spot-finder__muted" role="status">
                                    Looking for restaurants within {POI_RADIUS_M / 1000} km — this can take a few seconds.
                                </p>
                            )}
                            {poiStatus === 'error' && (
                                <div className="spot-finder__muted" role="alert">
                                    <p>The nearby-restaurant lookup failed.</p>
                                    <button
                                        type="button"
                                        className="sdp-back"
                                        onClick={retryPois}
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}
                            {poiStatus === 'done' && restaurants.length === 0 && (
                                <p className="spot-finder__muted" role="status">
                                    No restaurants mapped within {POI_RADIUS_M / 1000} km of this spot. These parks are
                                    often rural, and OpenStreetMap simply has nothing tagged here — it does not mean
                                    there is nowhere to eat.
                                </p>
                            )}
                            {restaurants.length > 0 && (
                                <>
                                    {/* Radius comes from the constant the request
                                        uses, so the copy cannot drift from it. */}
                                    <p className="sdp-tab-panel__meta">
                                        {restaurants.length} {restaurants.length === 1 ? 'restaurant' : 'restaurants'} within {POI_RADIUS_M / 1000} km
                                    </p>
                                    <ul className="spot-stays">
                                        {restaurants.slice(0, 12).map((poi) => (
                                            <li key={poi.id} className="spot-stay">
                                                <div className="spot-detail__way-icon">
                                                    <FontAwesomeIcon icon={faUtensils} />
                                                </div>
                                                <div className="spot-detail__way-content">
                                                    <span className="spot-detail__way-hub">{poi.name}</span>
                                                    <span className="spot-stay__links">
                                                        <a
                                                            className="spot-detail__link"
                                                            href={`https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            View on map ↗
                                                        </a>
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Flights panel ── */}
                    {activeTab === 'flights' && arrivalAirport && (
                        <div className="sdp-tab-panel">
                            <FlightTeaser
                                arrivalAirport={arrivalAirport}
                                departure={departure}
                                spotLabel={spot.destinationLabel}
                            />
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
