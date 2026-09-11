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
import { fetchHackerRoutes, HackerItinerary } from './services/hackerRoutes';
import { formatClock, formatDuration } from './services/flightFormat';
import { nextScheduleProbeDate } from './hooks/routeSearchDates';
import { useDepartureOrigin } from './hooks/useDepartureOrigin';
import { DEPARTURES } from './services/departureOrigin';
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
import NearbyRestaurants, { NearbyRestaurantsSkeleton } from './components/NearbyRestaurants';
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
            const pinned = stays
                .filter((s) => s.latitude != null && s.longitude != null)
                .slice(0, 20);
            pinned.forEach((stay) => {
                const m = new maplibregl.Marker({ element: buildMapMarker('stay', stay.name) })
                    .setLngLat([stay.longitude!, stay.latitude!])
                    .setPopup(new maplibregl.Popup({ offset: 14 }).setText(stay.name))
                    .addTo(map);
                markersRef.current.push(m);
            });
            // Same reason as the restaurants below: stays are drawn from a 15 km
            // radius and a fixed zoom 13 frames about 3 km of it, so the map sat
            // empty beside a list of places it had already pinned.
            if (pinned.length > 0) {
                const bounds = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
                pinned.forEach((stay) => bounds.extend([stay.longitude!, stay.latitude!]));
                map.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: 400 });
            } else {
                map.easeTo({ center: [lon, lat], zoom: 13, duration: 400 });
            }
        } else if (activeTab === 'restaurants') {
            const eateries = pois.filter((p) => p.kind === 'restaurant');
            eateries.forEach((poi) => {
                const m = new maplibregl.Marker({ element: buildMapMarker('restaurant', poi.name) })
                    .setLngLat([poi.lon, poi.lat])
                    .setPopup(new maplibregl.Popup({ offset: 14 }).setText(poi.name))
                    .addTo(map);
                markersRef.current.push(m);
            });
            // The lookup covers 5 km; a fixed zoom 14 frames about 1.5 km of it,
            // so most of the pins it had just dropped sat outside the viewport
            // and the map read as empty next to a list of ten places.
            if (eateries.length > 0) {
                const bounds = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
                eateries.forEach((poi) => bounds.extend([poi.lon, poi.lat]));
                map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
            } else {
                map.easeTo({ center: [lon, lat], zoom: 14, duration: 400 });
            }
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

// ─── Ways in ────────────────────────────────────────────────────────────────

interface FlightTeaserProps {
    arrivalAirport: string;
    departure: string;
    spotLabel: string;
}

/**
 * What the page can say about getting here, best evidence first.
 *
 * `fares` is a cached fare with a real price and an honest total. `schedule` is
 * the Route Hacker graph answering a weaker question — which routes exist,
 * including self-transfers no airline will sell as one ticket — with no price
 * at all. They are different states rather than one state with a missing field,
 * because the honest label differs: one is a price, the other is a possibility.
 */
type WaysIn =
    | { kind: 'loading' }
    | { kind: 'fares'; flights: FlightAvailable[] }
    | { kind: 'schedule'; itineraries: HackerItinerary[]; date: string }
    | { kind: 'none' };

/** Direct first, then the shortest door-to-door. Nothing here is a price rank. */
const rankWaysIn = (itineraries: HackerItinerary[]): HackerItinerary[] => (
    [...itineraries].sort((left, right) => {
        if (left.type !== right.type) return left.type === 'DIRECT' ? -1 : 1;
        return left.totalJourneyMinutes - right.totalJourneyMinutes;
    })
);

const carriersOf = (itinerary: HackerItinerary): string => {
    const codes = [
        ...(itinerary.leg1.airlineCodes ?? []),
        ...(itinerary.leg2?.airlineCodes ?? []),
    ];
    return Array.from(new Set(codes)).join(' + ');
};

const FlightTeaser: React.FC<FlightTeaserProps> = ({ arrivalAirport, departure }) => {
    const [waysIn, setWaysIn] = useState<WaysIn>({ kind: 'loading' });

    useEffect(() => {
        let cancelled = false;
        const originIata = resolveOriginAirport(departure);
        setWaysIn({ kind: 'loading' });

        const resolve = async () => {
            // 1. Cached fares first. They are the only path that carries a real
            //    price and an honest total, so they outrank a schedule always.
            let fares: FlightAvailable[] = [];
            try {
                const result = await searchFlights({ origin: originIata, destination: arrivalAirport });
                fares = result.flights.slice(0, 3);
            } catch {
                // Fall through: a failed fare lookup is not evidence about routes.
            }
            if (cancelled) return;
            if (fares.length > 0) {
                setWaysIn({ kind: 'fares', flights: fares });
                return;
            }

            // 2. No cached fare is not the same as no way in — it mostly means
            //    Ryanair does not fly the pair direct. The schedule graph knows
            //    routes no fare feed covers, self-transfers included.
            //
            //    Deliberately left unpriced: pricing a leg spends provider
            //    quota, and a spot page opened by anyone who lands on it is the
            //    last place to spend it. A route without a fare is still the
            //    answer to "can I get there", which is the question being asked.
            const date = nextScheduleProbeDate();
            try {
                const itineraries = await fetchHackerRoutes(originIata, arrivalAirport, date);
                if (cancelled) return;
                if (itineraries.length > 0) {
                    setWaysIn({ kind: 'schedule', itineraries: rankWaysIn(itineraries).slice(0, 3), date });
                    return;
                }
            } catch {
                // Nothing further to try; fall through to the empty state.
            }
            if (!cancelled) setWaysIn({ kind: 'none' });
        };

        void resolve();
        return () => { cancelled = true; };
    }, [arrivalAirport, departure]);

    const originCity = departure.split(',')[0];

    if (waysIn.kind === 'loading') {
        return (
            <div className="sdp-section">
                <h3 className="sdp-section__title">
                    <FontAwesomeIcon icon={faPlane} /> Ways in from {originCity}
                </h3>
                <p className="spot-finder__muted">Checking routes to {arrivalAirport}...</p>
            </div>
        );
    }

    if (waysIn.kind === 'none') {
        const urls = flightUrls(resolveOriginAirport(departure), arrivalAirport, '');
        return (
            <div className="sdp-section">
                <h3 className="sdp-section__title">
                    <FontAwesomeIcon icon={faPlane} /> Ways in from {originCity}
                </h3>
                <p className="spot-finder__muted">
                    No cached fare and no stored timetable reaches {arrivalAirport} from{' '}
                    {originCity}. That is a gap in our data as often as it is a gap in the
                    map — worth checking directly.
                </p>
                <div className="sdp-links">
                    <a href={urls.googleFlights} target="_blank" rel="noopener noreferrer" className="sdp-link-pill">
                        Google Flights
                    </a>
                </div>
            </div>
        );
    }

    if (waysIn.kind === 'schedule') {
        const whenLabel = new Date(`${waysIn.date}T00:00:00Z`).toLocaleDateString('en-IE', {
            weekday: 'short', day: 'numeric', month: 'short',
        });
        const hasSelfTransfer = waysIn.itineraries.some((it) => it.type === 'SELF_TRANSFER');
        const urls = flightUrls(resolveOriginAirport(departure), arrivalAirport, '');

        return (
            <div className="sdp-section">
                <h3 className="sdp-section__title">
                    <FontAwesomeIcon icon={faPlane} /> Ways in from {originCity}
                </h3>
                <p className="sdp-ways-in__note">
                    No cached fare for {arrivalAirport}, so these come from stored timetables
                    for {whenLabel}. Routes, not prices — no fare has been checked, and a
                    route that runs that Saturday may not run on yours.
                </p>
                <div className="sdp-flights">
                    {waysIn.itineraries.map((itinerary, i) => (
                        <div key={i} className="sdp-flight">
                            <div className="sdp-flight__info">
                                <span className="sdp-flight__date">
                                    {itinerary.type === 'DIRECT' ? 'Direct' : `via ${itinerary.hub}`}
                                </span>
                                {carriersOf(itinerary) && (
                                    <span className="sdp-flight__airline">{carriersOf(itinerary)}</span>
                                )}
                                <span className="sdp-flight__label">
                                    dep {formatClock(itinerary.leg1.departureTime)}
                                    {' · '}{formatDuration(itinerary.totalJourneyMinutes)} total
                                    {itinerary.type === 'SELF_TRANSFER'
                                        && ` · ${formatDuration(itinerary.layoverMinutes)} layover`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                {hasSelfTransfer && (
                    <p className="sdp-ways-in__risk">
                        A self-transfer is two separate tickets. Miss the second flight and no
                        airline owes you the next one, so leave more time than feels necessary.
                    </p>
                )}
                <div className="sdp-links">
                    <a href={urls.googleFlights} target="_blank" rel="noopener noreferrer" className="sdp-link-pill">
                        Check fares
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
                {waysIn.flights.map((flight, i) => {
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
    const [departure, setDeparture] = useDepartureOrigin();
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState<SpotTab>('getting-there');
    const [selectedAirport, setSelectedAirport] = useState<NearbyAirport | null>(null);
    const tabsRef = useRef<HTMLElement | null>(null);

    /**
     * Switch tabs, and bring the tab you just pressed fully into view.
     *
     * Four tabs do not fit a phone. Pressing one that was half past the right
     * edge left it half past the right edge, so the only indication of which
     * tab was active sat off screen and the strip had to be dragged by hand to
     * find it. Only the strip is scrolled — scrollIntoView would take the whole
     * page with it and throw the reader back to the top of the card.
     */
    const selectTab = (tab: SpotTab, button: HTMLButtonElement | null): void => {
        setActiveTab(tab);
        setSelectedAirport(null);

        const strip = tabsRef.current;
        if (!strip || !button) return;
        const offset = button.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        const centred = strip.scrollLeft + offset - (strip.clientWidth - button.offsetWidth) / 2;
        // Assigned, not animated. The panel below re-renders in the same commit
        // and the reflow cancels an in-flight smooth scroll, so the strip was
        // left exactly where it started — and an animation nobody asked for is
        // the wrong thing to fight the layout for anyway.
        strip.scrollLeft = Math.max(0, centred);
    };

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

    // Started as soon as the coordinates land, not when the tab is clicked.
    // Overpass takes 5-11 s cold, and gating it on the click meant every reader
    // who opened Restaurants sat in front of a sentence for the whole of it. The
    // backend caches each area for 7 days, so the cost is one slow lookup per
    // spot rather than one per reader, and by the time anyone has read the hero
    // the answer is usually already here.
    const { pois, status: poiStatus, retry: retryPois } = useNearbyPois(lat, lon, lat != null && lon != null);
    const restaurants = useMemo(() => pois.filter((p) => p.kind === 'restaurant'), [pois]);

    if (loading) {
        // The page used to open on the words "Loading spot..." centred in an
        // otherwise empty viewport, and then replace them with a full page in
        // one jump. This holds the real layout — hero, then two cards — so the
        // wait looks like the page arriving rather than the page missing.
        return (
            <section className="sdp" aria-busy="true">
                <p className="sdp-loading__label" role="status">Loading this spot…</p>
                <div className="sdp-hero sdp-hero--skeleton" aria-hidden="true">
                    <div className="sdp-hero__photo sdp-hero__photo--skeleton">
                        <span className="skeleton-bar skeleton-bar--block" />
                    </div>
                    <div className="sdp-hero__info">
                        <span className="skeleton-bar skeleton-bar--title" />
                        <span className="skeleton-bar skeleton-bar--sub" />
                    </div>
                </div>
                <div className="sdp-card sdp-loading__card" aria-hidden="true">
                    <span className="skeleton-bar skeleton-bar--sub" />
                    <span className="skeleton-bar skeleton-bar--line" />
                    <span className="skeleton-bar skeleton-bar--line" />
                </div>
                <div className="sdp-card sdp-loading__card sdp-loading__card--map" aria-hidden="true">
                    <span className="skeleton-bar skeleton-bar--block" />
                </div>
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
                            <span className={`sdp-badge ${curationBadge === 'Verified' ? 'sdp-badge--verified' : 'sdp-badge--unverified'}`}>
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

                    {/* Tab bar.

                        Every tab carries the size of what is behind it, and says
                        so while it is still counting. Both lookups run from the
                        moment the coordinates land, so a reader who spends ten
                        seconds on the setup card arrives to numbers already in
                        place rather than to a spinner they caused. */}
                    <nav className="sdp-tabs" role="tablist" aria-label="What is near this spot" ref={tabsRef}>
                        <button
                            type="button"
                            role="tab"
                            id="sdp-tab-getting-there"
                            aria-selected={activeTab === 'getting-there'}
                            aria-controls="sdp-panel-getting-there"
                            className={`sdp-tab ${activeTab === 'getting-there' ? 'sdp-tab--active' : ''}`}
                            onClick={(event) => selectTab('getting-there', event.currentTarget)}
                        >
                            <FontAwesomeIcon icon={faPlane} /> Getting there
                            {allAirports.length > 0 && (
                                <span className="sdp-tab__count">{allAirports.length}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            id="sdp-tab-hotels"
                            aria-selected={activeTab === 'hotels'}
                            aria-controls="sdp-panel-hotels"
                            className={`sdp-tab ${activeTab === 'hotels' ? 'sdp-tab--active' : ''}`}
                            onClick={(event) => selectTab('hotels', event.currentTarget)}
                        >
                            <FontAwesomeIcon icon={faBed} /> Hotels
                            {staysStatus === 'loading' && <span className="sdp-tab__pending" aria-hidden="true" />}
                            {staysStatus === 'done' && stays.length > 0 && (
                                <span className="sdp-tab__count">{stays.length}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            id="sdp-tab-restaurants"
                            aria-selected={activeTab === 'restaurants'}
                            aria-controls="sdp-panel-restaurants"
                            className={`sdp-tab ${activeTab === 'restaurants' ? 'sdp-tab--active' : ''}`}
                            onClick={(event) => selectTab('restaurants', event.currentTarget)}
                        >
                            <FontAwesomeIcon icon={faUtensils} /> Restaurants
                            {poiStatus === 'loading' && <span className="sdp-tab__pending" aria-hidden="true" />}
                            {poiStatus === 'done' && restaurants.length > 0 && (
                                <span className="sdp-tab__count">{restaurants.length}</span>
                            )}
                        </button>
                        {arrivalAirport && (
                            <button
                                type="button"
                                role="tab"
                                id="sdp-tab-flights"
                                aria-selected={activeTab === 'flights'}
                                aria-controls="sdp-panel-flights"
                                className={`sdp-tab ${activeTab === 'flights' ? 'sdp-tab--active' : ''}`}
                                onClick={(event) => selectTab('flights', event.currentTarget)}
                            >
                                <FontAwesomeIcon icon={faPlane} /> Flights
                            </button>
                        )}
                    </nav>

                    {/* ── Getting there panel ── */}
                    {activeTab === 'getting-there' && (
                        <div className="sdp-tab-panel" role="tabpanel" id="sdp-panel-getting-there" aria-labelledby="sdp-tab-getting-there">
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
                        <div className="sdp-tab-panel" role="tabpanel" id="sdp-panel-hotels" aria-labelledby="sdp-tab-hotels">
                            {staysStatus === 'loading' && (
                                <>
                                    <p className="sdp-tab-panel__meta" role="status">
                                        Looking for places to sleep within {SPOT_STAY_RADIUS_KM} km.
                                    </p>
                                    <ul className="spot-stays" aria-hidden="true">
                                        {Array.from({ length: 4 }, (unused, index) => (
                                            <li key={index} className="spot-stay spot-stay--skeleton">
                                                <span className="skeleton-bar skeleton-bar--title" />
                                                <span className="skeleton-bar skeleton-bar--sub" />
                                            </li>
                                        ))}
                                    </ul>
                                </>
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
                                    {/* The tab now carries the full count, so the
                                        panel has to say it is showing a slice of
                                        it — "37 within 15 km" above six rows read
                                        as thirty-one missing ones. */}
                                    <p className="sdp-tab-panel__meta">
                                        {stays.length <= STAY_PREVIEW_COUNT
                                            ? `${stays.length} within ${SPOT_STAY_RADIUS_KM} km`
                                            : `Nearest ${STAY_PREVIEW_COUNT} of ${stays.length} within ${SPOT_STAY_RADIUS_KM} km`}
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
                        <div className="sdp-tab-panel" role="tabpanel" id="sdp-panel-restaurants" aria-labelledby="sdp-tab-restaurants">
                            {/* Four distinct outcomes, because "Looking for
                                restaurants nearby..." was shown for all of them —
                                including after the lookup had finished and found
                                nothing, which is most spots. It read as a request
                                that never came back. */}
                            {(poiStatus === 'loading' || poiStatus === 'idle') && (
                                <>
                                    <p className="sdp-tab-panel__meta" role="status">
                                        Reading OpenStreetMap for places to eat within {POI_RADIUS_M / 1000} km.
                                    </p>
                                    <NearbyRestaurantsSkeleton />
                                </>
                            )}
                            {poiStatus === 'error' && (
                                <div className="sdp-state sdp-state--error" role="alert">
                                    <p className="sdp-state__title">The nearby-restaurant lookup didn't come back.</p>
                                    <p className="sdp-state__body">
                                        OpenStreetMap's query service is slow under load and sometimes times out.
                                        Nothing is wrong with the spot.
                                    </p>
                                    <button type="button" className="sdp-state__action" onClick={retryPois}>
                                        Try again
                                    </button>
                                </div>
                            )}
                            {poiStatus === 'done' && restaurants.length === 0 && (
                                <div className="sdp-state" role="status">
                                    <p className="sdp-state__title">
                                        Nothing tagged within {POI_RADIUS_M / 1000} km.
                                    </p>
                                    <p className="sdp-state__body">
                                        These parks are often rural and OpenStreetMap simply has no entries here.
                                        That is a gap in the map, not a verdict on the area — there is very likely
                                        somewhere to eat.
                                    </p>
                                </div>
                            )}
                            {restaurants.length > 0 && lat != null && lon != null && (
                                <NearbyRestaurants
                                    restaurants={restaurants}
                                    lat={lat}
                                    lon={lon}
                                    radiusKm={POI_RADIUS_M / 1000}
                                />
                            )}
                        </div>
                    )}

                    {/* ── Flights panel ── */}
                    {activeTab === 'flights' && arrivalAirport && (
                        <div className="sdp-tab-panel" role="tabpanel" id="sdp-panel-flights" aria-labelledby="sdp-tab-flights">
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
