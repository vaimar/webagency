import { faCar, faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useMemo, useState } from 'react';
import Select, { components, GroupBase, OptionProps, SingleValueProps, StylesConfig } from 'react-select';
import { Link } from 'react-router-dom';
import FlightCard from './components/FlightCard';
import FlightDestinationCard from './components/FlightDestinationCard';
import { RequestDiagnostics, TripGuide, TripGuideLoading } from './components/TripGuide';
import {
    AirportDisplay,
    buildAirportSearchText,
    DESTINATION_AIRPORT_OPTIONS,
    formatAirportOptionLabel,
    getAirportDisplay,
    groupAirportsByCountry,
    ORIGIN_AIRPORT_OPTIONS,
} from './data/airportMetadata';
import { useRouteSearch } from './hooks/useRouteSearch';
import { FlightDestination } from './model/FlightDestination';
import { accommodationUrls, placeUrls } from './services/affiliates';
import { getAntiCauchemarPricingSummary } from './services/antiCauchemarPricing';
import { fetchFlightDestinations } from './services/flightService';
import {
    AccommodationOption,
    ApiDiagnostics,
    FirstMileAccessParams,
    FirstMileMode,
    FlightAvailable,
    getHotelsNearby,
    HotelResult,
} from './services/api';
import { getAirportTransferContext, getArrivalHour } from './services/transferEstimate';
import './Home.css';
import NightlyRateCaveat from './components/NightlyRateCaveat';

const LANDING_ORIGIN = 'DUB';
const LANDING_MAX_PRICE = 260;

/** Stable empty result, so clearing hotels twice is not a state change. */
const NO_HOTELS: HotelResult[] = [];
const NO_HONEST_ROUTES_FOUND = 'No Honest Routes Found';
const DEFAULT_HOTEL_RADIUS_METERS = 2600;
const LATE_ARRIVAL_HOTEL_RADIUS_METERS = 1700;

type ActivityInterest = 'surf' | 'wakeboarding' | 'skiing' | 'snorkeling';

type AirportOption = {
    value: string;
    label: string;
    airport: AirportDisplay;
};

const ACTIVITY_OPTIONS: Array<{ value: ActivityInterest; label: string; emoji: string; helper: string }> = [
    { value: 'surf', label: 'Surf', emoji: '🌊', helper: 'Coastal breaks and low-friction bases' },
    { value: 'wakeboarding', label: 'Wakeboarding', emoji: '🏄', helper: 'Marina + cable park friendly bases' },
    { value: 'skiing', label: 'Skiing', emoji: '🎿', helper: 'Snow access without fantasy transfers' },
    { value: 'snorkeling', label: 'Snorkeling', emoji: '🤿', helper: 'Clear-water coastal stops and calm stays' },
];

const ACTIVITY_EXCLUDED_COST_COPY: Record<ActivityInterest, string> = {
    surf: 'board rental and surf sessions',
    wakeboarding: 'wakeboard sessions',
    skiing: 'lift passes and gear rental',
    snorkeling: 'snorkeling gear or boat trips',
};

const formatPrice = (price: number | string, currency: string = 'EUR'): string => {
    const amount = typeof price === 'number' ? price : Number.parseFloat(String(price));

    if (Number.isFinite(amount)) {
        try {
            return new Intl.NumberFormat('en-IE', {
                style: 'currency',
                currency,
                minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2,
            }).format(amount);
        } catch {
            // fall through to plain-text fallback
        }
    }

    return `${currency} ${price}`;
};

const getDestinationLeadPrice = (destination: FlightDestination): string => {
    const pricing = getAntiCauchemarPricingSummary(destination.price.total, destination.antiCauchemar);
    const currency = destination.antiCauchemar?.currency ?? destination.price.currency;
    return formatPrice(pricing.estimatedEntryPrice ?? destination.price.total, currency);
};

const parseNightlyPrice = (value?: number | null): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const dateDiffNights = (departureDate?: string, returnDate?: string): number => {
    if (!departureDate || !returnDate) return 0;
    const departure = new Date(`${departureDate}T00:00:00Z`);
    const returning = new Date(`${returnDate}T00:00:00Z`);
    if (Number.isNaN(departure.getTime()) || Number.isNaN(returning.getTime())) return 0;
    const diffDays = Math.round((returning.getTime() - departure.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diffDays);
};

const getFlightKey = (flight: FlightAvailable): string => (
    [
        flight.origin,
        flight.destination,
        flight.flightNumber ?? 'route',
        flight.departureDate ?? flight.departureTime ?? '',
        flight.arrivalDate ?? flight.arrivalTime ?? '',
        String(flight.price),
    ].join('::')
);

const isLateArrival = (arrivalTime?: string): boolean => {
    const arrivalHour = getArrivalHour(arrivalTime);
    return typeof arrivalHour === 'number' && (arrivalHour >= 22 || arrivalHour < 6);
};

const getHotelRadiusMeters = (flight: FlightAvailable): number => (
    isLateArrival(flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate)
        ? LATE_ARRIVAL_HOTEL_RADIUS_METERS
        : DEFAULT_HOTEL_RADIUS_METERS
);

const sortHotels = (hotels: HotelResult[]): HotelResult[] => (
    [...hotels].sort((left, right) => {
        const leftPrice = parseNightlyPrice(left.pricePerNight);
        const rightPrice = parseNightlyPrice(right.pricePerNight);

        if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) {
            return leftPrice - rightPrice;
        }

        if (leftPrice !== null && rightPrice === null) return -1;
        if (leftPrice === null && rightPrice !== null) return 1;

        const leftRating = typeof left.rating === 'number' ? left.rating : -1;
        const rightRating = typeof right.rating === 'number' ? right.rating : -1;
        if (leftRating !== rightRating) {
            return rightRating - leftRating;
        }

        return (right.reviewsCount ?? 0) - (left.reviewsCount ?? 0);
    })
);

const mapAirportGroupsToSelect = (groups: ReturnType<typeof groupAirportsByCountry>): GroupBase<AirportOption>[] => (
    groups.map((group) => ({
        label: `${group.flag} ${group.country}`,
        options: group.airports.map((airport) => ({
            value: airport.code,
            label: formatAirportOptionLabel(airport.code),
            airport: { ...airport, searchCode: airport.code },
        })),
    }))
);

const selectStyles: StylesConfig<AirportOption, false> = {
    control: (base, state) => ({
        ...base,
        minHeight: 52,
        borderRadius: 14,
        borderColor: state.isFocused ? '#173c63' : '#d5dfeb',
        boxShadow: state.isFocused ? '0 0 0 3px rgba(23, 60, 99, 0.12)' : 'none',
        background: '#f8fbfd',
        '&:hover': {
            borderColor: '#173c63',
        },
    }),
    option: (base, state) => ({
        ...base,
        background: state.isSelected ? '#173c63' : state.isFocused ? '#edf4fb' : '#ffffff',
        color: state.isSelected ? '#ffffff' : '#102033',
        padding: 0,
    }),
    menu: (base) => ({
        ...base,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 22px 40px rgba(15, 41, 66, 0.16)',
        zIndex: 250,
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 260,
    }),
    menuList: (base) => ({
        ...base,
        padding: 8,
    }),
    placeholder: (base) => ({
        ...base,
        color: '#64748b',
    }),
    singleValue: (base) => ({
        ...base,
        color: '#102033',
    }),
    groupHeading: (base) => ({
        ...base,
        margin: 0,
        padding: '10px 12px 6px',
        color: '#2f5f8f',
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 800,
    }),
};

const AirportOptionRow: React.FC<OptionProps<AirportOption, false>> = (props) => {
    const { airport } = props.data;

    return (
        <components.Option {...props}>
            <div className="airport-select__option">
                <span className="airport-select__flag" aria-hidden="true">{airport.flag}</span>
                <span className="airport-select__copy">
                    <strong>{airport.city}</strong>
                    <span>{airport.airportName} · {airport.country}</span>
                </span>
                <span className="airport-select__code">{airport.code}</span>
            </div>
        </components.Option>
    );
};

const AirportSingleValue: React.FC<SingleValueProps<AirportOption, false>> = (props) => {
    const { airport } = props.data;

    return (
        <components.SingleValue {...props}>
            <div className="airport-select__value">
                <span aria-hidden="true">{airport.flag}</span>
                <span>{airport.city} ({airport.code})</span>
            </div>
        </components.SingleValue>
    );
};

const filterAirportOption = (candidate: { data: AirportOption }, rawInput: string): boolean => {
    const query = rawInput.trim().toLowerCase();
    if (!query) {
        return true;
    }

    return buildAirportSearchText(candidate.data.airport).includes(query);
};

const toSuggestedRoute = (item: FlightDestination) => ({
    origin: getAirportDisplay(item.origin).code,
    destination: getAirportDisplay(item.destination).code,
    departureDate: item.departureDate,
    returnDate: item.returnDate,
});

const buildHotelLookupNote = (
    flight: FlightAvailable,
    destinationAirport: AirportDisplay,
    hotelCount: number,
    radiusMeters: number,
): string => {
    const arrival = flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate;
    if (isLateArrival(arrival)) {
        return `Late arrival detected. Surfacing ${hotelCount} stays within ${Math.round(radiusMeters / 100) / 10} km of ${destinationAirport.city} centre to cut the last-mile risk.`;
    }

    return `Surfacing ${hotelCount} nearby stays within ${Math.round(radiusMeters / 100) / 10} km of ${destinationAirport.city} centre from the live hotel feed.`;
};

const toLiveAccommodationOptions = (hotels: HotelResult[], destinationAirport: AirportDisplay): AccommodationOption[] => (
    hotels.slice(0, 10).map((hotel, index) => ({
        type: index === 0 ? 'Live nearby lead stay' : 'Live nearby stay',
        name: hotel.name ?? `${destinationAirport.city} stay ${index + 1}`,
        area: destinationAirport.city,
        pricePerNight: hotel.pricePerNight
            ? formatPrice(hotel.pricePerNight, hotel.priceCurrency ?? 'EUR')
            : 'Live rate unavailable',
        tip: hotel.reviewSummary
            ?? hotel.provider
            ?? 'Live nearby hotel result from the backend. Price may vary for group size.',
        officialWebsiteUrl: hotel.bookingLink,
    }))
);

const Home: React.FC = () => {
    const {
        state,
        flights,
        tripSuggestion,
        isSearchingFlights,
        isLoadingSuggestion,
        flightError,
        flightNotice,
        noFlightsMessage,
        suggestionError,
        flightSource,
        flightDiagnostics,
        suggestionDiagnostics,
        hasSearched,
        setOrigin,
        setDestination,
        setDepartureDate,
        setReturnDate,
        searchRoute,
        retrySuggestion,
        clearResults,
    } = useRouteSearch();
    const [animatedCardKey, setAnimatedCardKey] = useState<string | null>(null);
    const [landingDestinations, setLandingDestinations] = useState<FlightDestination[]>([]);
    const [isLoadingLanding, setIsLoadingLanding] = useState(true);
    const [landingError, setLandingError] = useState<string | null>(null);
    const [landingNotice, setLandingNotice] = useState<string | null>(null);
    const [selectedActivities, setSelectedActivities] = useState<ActivityInterest[]>(['wakeboarding']);
    const [firstMileEnabled, setFirstMileEnabled] = useState(false);
    const [firstMileMode, setFirstMileMode] = useState<FirstMileMode>('rental_car');
    const [firstMileAmount, setFirstMileAmount] = useState('42');
    const [firstMileDurationMinutes, setFirstMileDurationMinutes] = useState('150');
    const [firstMileNote, setFirstMileNote] = useState('Limerick to Dublin by car');
    const [selectedFlightKey, setSelectedFlightKey] = useState<string | null>(null);
    const [liveHotels, setLiveHotels] = useState<HotelResult[]>([]);
    const [isLoadingHotels, setIsLoadingHotels] = useState(false);
    const [hotelError, setHotelError] = useState<string | null>(null);
    const [hotelNotice, setHotelNotice] = useState<string | null>(null);
    const [hotelDiagnostics, setHotelDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [hotelRadiusMeters, setHotelRadiusMeters] = useState<number | null>(null);

    const hasResults = flights.length > 0 || tripSuggestion !== null;
    // Memoised on the airport code, not called inline, because
    // getAirportDisplay builds a fresh object on every call — both the
    // metadata branch (`{ ...metadata, searchCode }`) and the unknown-airport
    // fallback. Called inline, `destinationAirport` changed identity on every
    // render, which re-ran the nearby-stays effect below on every render; that
    // effect resets state with a fresh `[]`, which is never Object.is-equal to
    // the previous value, so it rendered again — forever, the moment a
    // destination was set with no flight selected yet.
    const originAirport = useMemo(
        () => (state.origin ? getAirportDisplay(state.origin) : null),
        [state.origin],
    );
    const destinationAirport = useMemo(
        () => (state.destination ? getAirportDisplay(state.destination) : null),
        [state.destination],
    );
    const originGroups = groupAirportsByCountry(ORIGIN_AIRPORT_OPTIONS);
    const destinationGroups = groupAirportsByCountry(DESTINATION_AIRPORT_OPTIONS);
    const originOptions = mapAirportGroupsToSelect(originGroups);
    const destinationOptions = mapAirportGroupsToSelect(destinationGroups);
    const selectedOriginOption = originOptions.flatMap((group) => group.options).find((option) => option.value === originAirport?.searchCode) ?? null;
    const selectedDestinationOption = destinationOptions.flatMap((group) => group.options).find((option) => option.value === destinationAirport?.searchCode) ?? null;
    const suggestedRoutes = landingDestinations.map((destination) => {
        const suggestedRoute = toSuggestedRoute(destination);
        const matchesSelectedDates = Boolean(state.departureDate && state.departureDate === suggestedRoute.departureDate);

        return {
            destination,
            suggestedRoute,
            matchesSelectedDates,
        };
    });
    const selectedSuggestedFare = useMemo(
        () => suggestedRoutes.find(({ suggestedRoute, matchesSelectedDates }) => (
            state.origin === suggestedRoute.origin
            && state.destination === suggestedRoute.destination
            && matchesSelectedDates
        )) ?? null,
        [state.destination, state.origin, suggestedRoutes],
    );
    const selectedFlight = useMemo(
        () => flights.find((flight) => getFlightKey(flight) === selectedFlightKey) ?? flights[0] ?? null,
        [flights, selectedFlightKey],
    );
    const alternateFlights = useMemo(
        () => flights.filter((flight) => getFlightKey(flight) !== (selectedFlight ? getFlightKey(selectedFlight) : '')),
        [flights, selectedFlight],
    );
    const leadHotel = useMemo(() => {
        const pricedHotels = sortHotels(liveHotels)
            .map((hotel) => ({ hotel, price: parseNightlyPrice(hotel.pricePerNight) }))
            .filter((item): item is { hotel: HotelResult; price: number } => item.price !== null);
        return pricedHotels[0] ?? null;
    }, [liveHotels]);
    const tripNights = dateDiffNights(state.departureDate, state.returnDate);
    const selectedFlightPricing = useMemo(
        () => (selectedFlight ? getAntiCauchemarPricingSummary(selectedFlight.price, selectedFlight.antiCauchemar) : null),
        [selectedFlight],
    );
    const surfacedTripTotal = useMemo(() => {
        if (!selectedFlightPricing || !leadHotel || tripNights <= 0) {
            return null;
        }

        const transportTotal = selectedFlightPricing.doorToTripPrice ?? selectedFlightPricing.estimatedEntryPrice;
        if (typeof transportTotal !== 'number') {
            return null;
        }

        return transportTotal + (leadHotel.price * tripNights);
    }, [leadHotel, selectedFlightPricing, tripNights]);
    const lensExcludedCosts = selectedActivities.map((activity) => ACTIVITY_EXCLUDED_COST_COPY[activity]).filter(Boolean);
    const selectedActivityLabels = selectedActivities.map((activity) => ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label ?? activity);
    const tripGuideTrip = useMemo(() => {
        if (!tripSuggestion) {
            return null;
        }

        const mergedAccommodation = liveHotels.length > 0 && destinationAirport
            ? toLiveAccommodationOptions(liveHotels, destinationAirport)
            : tripSuggestion.accommodation;

        return {
            ...tripSuggestion,
            cheapestFlight: tripSuggestion.cheapestFlight ?? selectedFlight ?? undefined,
            antiCauchemar: tripSuggestion.antiCauchemar ?? selectedFlight?.antiCauchemar,
            accommodation: mergedAccommodation,
        };
    }, [destinationAirport, liveHotels, selectedFlight, tripSuggestion]);

    const firstMileParams = useMemo<FirstMileAccessParams | undefined>(() => {
        if (!firstMileEnabled) return undefined;
        const amount = Number.parseFloat(firstMileAmount);
        const duration = Number.parseInt(firstMileDurationMinutes, 10);

        return {
            firstMileAmount: Number.isFinite(amount) ? amount : undefined,
            firstMileDurationMinutes: Number.isFinite(duration) ? duration : undefined,
            firstMileMode,
            firstMileStatus: 'USER_PROVIDED',
            firstMileNote: firstMileNote.trim() || undefined,
        };
    }, [firstMileAmount, firstMileDurationMinutes, firstMileEnabled, firstMileMode, firstMileNote]);

    const handleSuggestedRouteSelect = (route: { origin: string; destination: string; departureDate: string; returnDate: string }) => {
        setOrigin(route.origin);
        setDestination(route.destination);
        setDepartureDate(route.departureDate);
        setReturnDate(route.returnDate);
        setAnimatedCardKey(`${route.origin}-${route.destination}-${route.departureDate}`);
    };

    const toggleActivity = (activity: ActivityInterest) => {
        setSelectedActivities((prev) => prev.includes(activity)
            ? prev.filter((item) => item !== activity)
            : [...prev, activity]);
    };

    useEffect(() => {
        if (!animatedCardKey) return undefined;

        const timeoutId = window.setTimeout(() => {
            setAnimatedCardKey(null);
        }, 1100);

        return () => window.clearTimeout(timeoutId);
    }, [animatedCardKey]);

    useEffect(() => {
        let isActive = true;

        const loadLandingDestinations = async () => {
            setIsLoadingLanding(true);
            setLandingError(null);

            try {
                const result = await fetchFlightDestinations({
                    origin: LANDING_ORIGIN,
                    maxPrice: LANDING_MAX_PRICE,
                });

                if (!isActive) return;

                setLandingDestinations(result.destinations);
                setLandingNotice(result.notice ?? null);
            } catch (error) {
                if (!isActive) return;

                setLandingDestinations([]);
                setLandingNotice(null);
                setLandingError(error instanceof Error ? error.message : 'Cached Dublin route hints are unavailable right now.');
            } finally {
                if (isActive) {
                    setIsLoadingLanding(false);
                }
            }
        };

        void loadLandingDestinations();

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (flights.length === 0) {
            setSelectedFlightKey(null);
            return;
        }

        setSelectedFlightKey((current) => {
            if (current && flights.some((flight) => getFlightKey(flight) === current)) {
                return current;
            }

            return getFlightKey(flights[0]);
        });
    }, [flights]);

    useEffect(() => {
        if (!selectedFlight || !destinationAirport) {
            // Shared constant, not a fresh []: a new array literal here is never
            // equal to the previous state, so it forces a render every time this
            // branch runs. Harmless once the deps above are stable, but it is
            // half of what made the loop possible — so it does not come back.
            setLiveHotels(NO_HOTELS);
            setHotelDiagnostics(null);
            setHotelNotice(null);
            setHotelError(null);
            setIsLoadingHotels(false);
            setHotelRadiusMeters(null);
            return;
        }

        const transferContext = getAirportTransferContext(selectedFlight.destination);
        if (!transferContext) {
            setLiveHotels([]);
            setHotelDiagnostics(null);
            setHotelRadiusMeters(null);
            setHotelError(null);
            setHotelNotice(`No live nearby-stay coordinates are mapped yet for ${destinationAirport.code}. Flight truth is still valid, but hotel chaining stops here.`);
            return;
        }

        let cancelled = false;
        const radiusMeters = getHotelRadiusMeters(selectedFlight);
        setHotelRadiusMeters(radiusMeters);
        setIsLoadingHotels(true);
        setHotelError(null);
        setHotelDiagnostics(null);
        setHotelNotice(`Searching live nearby stays around ${destinationAirport.city}...`);

        const loadHotels = async () => {
            try {
                const result = await getHotelsNearby(
                    transferContext.cityCoordinates.lat,
                    transferContext.cityCoordinates.lon,
                    radiusMeters,
                );

                if (cancelled) return;

                const sortedHotels = sortHotels(result.hotels);
                setLiveHotels(sortedHotels);
                setHotelDiagnostics(result.diagnostics);
                setHotelNotice(buildHotelLookupNote(selectedFlight, destinationAirport, sortedHotels.length, radiusMeters));
            } catch (error) {
                if (cancelled) return;
                setLiveHotels([]);
                setHotelDiagnostics(null);
                setHotelNotice(null);
                setHotelError(error instanceof Error ? error.message : 'Live nearby hotel lookup failed.');
            } finally {
                if (!cancelled) {
                    setIsLoadingHotels(false);
                }
            }
        };

        void loadHotels();

        return () => {
            cancelled = true;
        };
    }, [destinationAirport, selectedFlight]);

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content" style={{ maxWidth: '100%' }}>
                    <p className="eyebrow eyebrow--light"><FontAwesomeIcon icon={faPlane} style={{ marginRight: '8px' }} />Door-to-trip discovery</p>
                    <h1>Start with the flight. Trust the real route.</h1>
                    <p className="hero-card__lede">Choose flights, dates, and what you actually want to do. The app now chains live SerpApi route proof into nearby hotel lookup instead of falling back to frozen mock cards.</p>
                    {selectedSuggestedFare && (
                        <div className="selected-fare-pill" role="status">
                            <span className="selected-fare-pill__label">Selected route proof</span>
                            <strong>{getDestinationLeadPrice(selectedSuggestedFare.destination)}</strong>
                            <span>
                                {getAirportDisplay(selectedSuggestedFare.suggestedRoute.origin).city} → {getAirportDisplay(selectedSuggestedFare.suggestedRoute.destination).city}
                            </span>
                            <span>One way · depart {selectedSuggestedFare.suggestedRoute.departureDate}</span>
                        </div>
                    )}
                    <div className="search-box" style={{ marginTop: '24px' }}>
                        <div className="search-box__grid">
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />From</label>
                                <Select<AirportOption, false>
                                    inputId="origin-airport"
                                    classNamePrefix="airport-select"
                                    options={originOptions}
                                    value={selectedOriginOption}
                                    onChange={(next) => next && setOrigin(next.value)}
                                    components={{ Option: AirportOptionRow, SingleValue: AirportSingleValue }}
                                    styles={selectStyles}
                                    isSearchable
                                    filterOption={filterAirportOption}
                                    menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                                    menuPosition="fixed"
                                    placeholder="Search departure airport"
                                />
                            </div>
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />To</label>
                                <Select<AirportOption, false>
                                    inputId="destination-airport"
                                    classNamePrefix="airport-select"
                                    options={destinationOptions}
                                    value={selectedDestinationOption}
                                    onChange={(next) => next && setDestination(next.value)}
                                    components={{ Option: AirportOptionRow, SingleValue: AirportSingleValue }}
                                    styles={selectStyles}
                                    isSearchable
                                    filterOption={filterAirportOption}
                                    menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                                    menuPosition="fixed"
                                    placeholder="Search destination airport"
                                />
                            </div>
                            <div className="search-box__field">
                                <label htmlFor="departure-date" className="search-box__label">Departure</label>
                                <input
                                    id="departure-date"
                                    type="date"
                                    value={state.departureDate}
                                    className="search-box__input"
                                    min="2026-05-09"
                                    onChange={(event) => setDepartureDate(event.target.value)}
                                />
                            </div>
                            <div className="search-box__field">
                                <label htmlFor="return-date" className="search-box__label">Return / end of stay</label>
                                <input
                                    id="return-date"
                                    type="date"
                                    value={state.returnDate}
                                    className="search-box__input"
                                    min={state.departureDate || '2026-05-09'}
                                    onChange={(event) => setReturnDate(event.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                className="button button--large"
                                disabled={isSearchingFlights || isLoadingSuggestion || !state.origin || !state.destination || !state.departureDate}
                                onClick={() => void searchRoute({ firstMile: firstMileParams })}
                                style={{ height: '52px' }}
                            >
                                <FontAwesomeIcon icon={faSearch} />{isSearchingFlights || isLoadingSuggestion ? 'Searching...' : 'Find honest flight proof'}
                            </button>
                        </div>
                        <div className="home-discovery-panel">
                            <div className="home-discovery-panel__section">
                                <div className="home-discovery-panel__header">
                                    <span className="search-box__label"><FontAwesomeIcon icon={faInfoCircle} style={{ marginRight: '6px' }} />What matters on this trip</span>
                                    <span className="home-discovery-panel__hint">Use this to shape the proof layer, not to start a robot interview.</span>
                                </div>
                                <div className="activity-chip-list" role="group" aria-label="Activity interests">
                                    {ACTIVITY_OPTIONS.map((activity) => {
                                        const isSelected = selectedActivities.includes(activity.value);
                                        return (
                                            <button
                                                key={activity.value}
                                                type="button"
                                                className={`activity-chip ${isSelected ? 'activity-chip--selected' : ''}`}
                                                aria-pressed={isSelected}
                                                onClick={() => toggleActivity(activity.value)}
                                                title={activity.helper}
                                            >
                                                <span aria-hidden="true">{activity.emoji}</span>
                                                <span>{activity.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="home-discovery-panel__copy">
                                    Selected: {selectedActivityLabels.length > 0 ? selectedActivityLabels.join(', ') : 'No activity filter yet'}.
                                </p>
                                {selectedActivities.includes('skiing') && (
                                    <p className="home-discovery-panel__copy">
                                        <Link to="/ski-map">Open the ski resort map</Link> for the pinned catalog and grouped hotel overlay.
                                    </p>
                                )}
                            </div>

                            <div className="home-discovery-panel__section">
                                <label className="first-mile-toggle">
                                    <input
                                        type="checkbox"
                                        checked={firstMileEnabled}
                                        onChange={(event) => setFirstMileEnabled(event.target.checked)}
                                    />
                                    <span><FontAwesomeIcon icon={faCar} style={{ marginRight: '6px' }} />I know my home → airport travel</span>
                                </label>
                                {firstMileEnabled && (
                                    <div className="first-mile-panel">
                                        <div className="first-mile-panel__grid">
                                            <label>
                                                <span className="search-box__label">Mode</span>
                                                <select value={firstMileMode} className="search-box__input" onChange={(event) => setFirstMileMode(event.target.value as FirstMileMode)}>
                                                    <option value="rental_car">I have a car</option>
                                                    <option value="taxi">Taxi</option>
                                                    <option value="public_transport">Public transport</option>
                                                    <option value="walking">Walking</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </label>
                                            <label>
                                                <span className="search-box__label">Cost to airport (€)</span>
                                                <input type="number" min="0" step="0.01" value={firstMileAmount} className="search-box__input" onChange={(event) => setFirstMileAmount(event.target.value)} />
                                            </label>
                                            <label>
                                                <span className="search-box__label">Travel time (min)</span>
                                                <input type="number" min="0" step="1" value={firstMileDurationMinutes} className="search-box__input" onChange={(event) => setFirstMileDurationMinutes(event.target.value)} />
                                            </label>
                                        </div>
                                        <label className="first-mile-panel__note">
                                            <span className="search-box__label">Note</span>
                                            <input type="text" value={firstMileNote} className="search-box__input" onChange={(event) => setFirstMileNote(event.target.value)} placeholder="Limerick to Dublin by car" />
                                        </label>
                                        <p className="home-discovery-panel__copy">This adds `doorToTripPrice` to the outbound leg only. The return keeps its own audited total.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="muted-text" style={{ marginTop: '10px', fontSize: '0.82rem' }}>
                            {originAirport && destinationAirport
                                ? <>Route ready: <strong>{originAirport.city}</strong> → <strong>{destinationAirport.city}</strong>, depart <strong>{state.departureDate || 'choose a day'}</strong>{state.returnDate ? <> and return/end stay <strong>{state.returnDate}</strong></> : null}. Selecting a live route now triggers the downstream hotel lookup automatically.</>
                                : <>Choose airports, dates, and an activity priority. The route card becomes real only when live SerpApi data and Anti-Cauchemar pricing agree.</>}
                        </p>
                    </div>
                </div>
            </section>

            {!hasSearched && !isSearchingFlights && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">❄️ Frozen Summer discovery board</p>
                            <h2>Cached Dublin fares, undated — a starting point, not a quote.</h2>
                            <p className="muted-text">Our fare source cannot say which dates these prices apply to, so treat them as a route hint and check the airline for the real figure. These cards clear once you search.</p>
                        </div>
                    </div>
                    {isLoadingLanding ? (
                        <div className="card empty-state">
                            <div className="loading-pulse">
                                <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                                <p>Loading live SerpApi departures from Dublin and stripping out the fake cheap routes...</p>
                            </div>
                        </div>
                    ) : landingError ? (
                        <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{landingError}</div>
                    ) : suggestedRoutes.length === 0 ? (
                        <div className="card empty-state">
                            <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                            <h3>{NO_HONEST_ROUTES_FOUND}</h3>
                            <p>{landingNotice ?? 'The backend returned no live flight-backed landing fares from Dublin. No flight data, no discover card.'}</p>
                        </div>
                    ) : (
                        <div className="info-grid">
                            {suggestedRoutes.map(({ destination, suggestedRoute, matchesSelectedDates }) => (
                                <FlightDestinationCard
                                    key={`${destination.origin}-${destination.destination}-${destination.departureDate}`}
                                    destination={destination}
                                    onSelect={() => handleSuggestedRouteSelect(suggestedRoute)}
                                    isSelected={
                                        state.origin === suggestedRoute.origin
                                        && state.destination === suggestedRoute.destination
                                        && matchesSelectedDates
                                    }
                                    showsDateMatch={matchesSelectedDates}
                                    shouldAnimate={animatedCardKey === `${suggestedRoute.origin}-${suggestedRoute.destination}-${suggestedRoute.departureDate}`}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {(flightSource || hasResults) && (
                <div className="notice-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        <span>
                            {flightSource === 'live'
                                ? <><strong>Live route proof</strong> — sorted by honest price from the SerpApi route feed, with Anti-Cauchemar warnings kept visible</>
                                : <strong>Enter airports to search</strong>}
                            {flightDiagnostics?.ok && <span className="muted-text" style={{ marginLeft: '12px' }}>Response in {flightDiagnostics.durationMs}ms</span>}
                        </span>
                    </div>
                    {hasResults && <button type="button" className="button button--secondary button--small" onClick={clearResults}>Clear results</button>}
                </div>
            )}

            {flightError && <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{flightError}</div>}
            {flightNotice && !flightError && <div className="notice-banner"><FontAwesomeIcon icon={faInfoCircle} />{flightNotice}</div>}
            {noFlightsMessage && !flightError && <div className="notice-banner"><FontAwesomeIcon icon={faInfoCircle} />{noFlightsMessage}</div>}

            {isLoadingSuggestion && <TripGuideLoading />}

            {selectedFlight && (
                <section className="card section-card stack-lg live-stay-proof">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">🏨 Live stay proof</p>
                            <h2>{getAirportDisplay(selectedFlight.destination).city} stays chained from the selected flight</h2>
                            <p className="muted-text">The golden path is live now: choose the route, then the hotel lookup hits `/api/hotels/nearby` with the destination city-centre coordinates.</p>
                        </div>
                    </div>

                    {hotelError ? (
                        <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{hotelError}</div>
                    ) : isLoadingHotels ? (
                        <div className="card empty-state empty-state--embedded">
                            <div className="loading-pulse">
                                <FontAwesomeIcon icon={faMapMarkerAlt} className="empty-state__icon" />
                                <p>Finding nearby stays for the selected route...</p>
                            </div>
                        </div>
                    ) : liveHotels.length === 0 ? (
                        <div className="card empty-state empty-state--embedded">
                            <FontAwesomeIcon icon={faMapMarkerAlt} className="empty-state__icon" />
                            <h3>No live nearby stays surfaced</h3>
                            <p>{hotelNotice ?? 'The flight is real, but the nearby hotel feed returned nothing useful for this destination.'}</p>
                        </div>
                    ) : (
                        <>
                            <div className="hotel-proof__summary">
                                <div className="hotel-proof__summary-item">
                                    <span className="hotel-proof__summary-label">Selected route</span>
                                    <strong>{getAirportDisplay(selectedFlight.origin).city} → {getAirportDisplay(selectedFlight.destination).city}</strong>
                                </div>
                                <div className="hotel-proof__summary-item">
                                    <span className="hotel-proof__summary-label">Search radius</span>
                                    <strong>{hotelRadiusMeters ? `${Math.round(hotelRadiusMeters / 100) / 10} km` : '—'}</strong>
                                </div>
                                <div className="hotel-proof__summary-item">
                                    <span className="hotel-proof__summary-label">Lead stay</span>
                                    <strong>{leadHotel?.hotel.name ?? '—'}</strong>
                                    {leadHotel && <span className="muted-text">{formatPrice(leadHotel.price, leadHotel.hotel.priceCurrency ?? 'EUR')} / night</span>}
                                    {leadHotel && <NightlyRateCaveat />}
                                </div>
                                <div className="hotel-proof__summary-item hotel-proof__summary-item--notice">
                                    <span className="hotel-proof__summary-label">Hotel lookup note</span>
                                    <strong>{hotelNotice}</strong>
                                </div>
                            </div>

                            <div className="hotel-proof__grid">
                                {liveHotels.slice(0, 8).map((hotel, index) => {
                                    const destination = getAirportDisplay(selectedFlight.destination);
                                    const placeLinks = placeUrls(hotel.name ?? `${destination.city} hotel`, destination.city);
                                    const fallbackAccommodationLinks = accommodationUrls(destination.city, destination.city);
                                    const priceLabel = hotel.pricePerNight
                                        ? formatPrice(hotel.pricePerNight, hotel.priceCurrency ?? 'EUR')
                                        : 'Live rate unavailable';
                                    const reviewLabel = typeof hotel.reviewsCount === 'number'
                                        ? `${hotel.reviewsCount} reviews`
                                        : 'Review count unavailable';
                                    const providerLabel = hotel.provider ?? 'Live hotel provider';

                                    return (
                                        <article key={`${hotel.xid ?? hotel.name ?? 'hotel'}-${index}`} className="hotel-proof-card">
                                            <div className="hotel-proof-card__topline">
                                                <span className="hotel-proof-card__provider">{providerLabel}</span>
                                                {typeof hotel.rating === 'number' && <span className="hotel-proof-card__rating">★ {hotel.rating.toFixed(1)}</span>}
                                            </div>
                                            <h3>{hotel.name ?? `${destination.city} stay`}</h3>
                                            <div className="hotel-proof-card__price-row">
                                                <strong>{priceLabel}</strong>
                                                <span>per night</span>
                                            </div>
                                            <NightlyRateCaveat />
                                            <p className="hotel-proof-card__meta">{reviewLabel}</p>
                                            <p className="hotel-proof-card__copy">{hotel.reviewSummary ?? 'Live nearby stay surfaced from the backend.'}</p>
                                            <div className="hotel-proof-card__links trip-booking-links">
                                                {hotel.bookingLink
                                                    ? <a href={hotel.bookingLink} target="_blank" rel="noopener noreferrer" className="trip-external-link trip-external-link--primary">Open live hotel rate</a>
                                                    : <a href={fallbackAccommodationLinks.booking} target="_blank" rel="noopener noreferrer" className="trip-external-link">Open booking search</a>}
                                                <a href={placeLinks.googleMaps} target="_blank" rel="noopener noreferrer" className="trip-external-link">View on Maps</a>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                    <RequestDiagnostics title="Hotel request details" diagnostics={hotelDiagnostics} />
                </section>
            )}

            {selectedFlight && leadHotel && tripNights > 0 && (
                <section className="card section-card stack-md live-package-proof">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">🧮 Surfaced trip subtotal</p>
                            <h2>Live flight + live nearby stay</h2>
                            <p className="muted-text">This is not a bundled checkout. It is the honest subtotal from the selected route and the cheapest surfaced nearby stay.</p>
                        </div>
                    </div>
                    <div className="hotel-proof__summary">
                        <div className="hotel-proof__summary-item">
                            <span className="hotel-proof__summary-label">Flight honest total</span>
                            <strong>{formatPrice(selectedFlightPricing?.doorToTripPrice ?? selectedFlightPricing?.estimatedEntryPrice ?? selectedFlight.price, selectedFlight.antiCauchemar?.currency ?? selectedFlight.currency ?? 'EUR')}</strong>
                        </div>
                        <div className="hotel-proof__summary-item">
                            <span className="hotel-proof__summary-label">Live stay total</span>
                            <strong>{formatPrice(leadHotel.price * tripNights, leadHotel.hotel.priceCurrency ?? 'EUR')}</strong>
                            <span className="muted-text">{tripNights} night{tripNights !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="hotel-proof__summary-item hotel-proof__summary-item--total">
                            <span className="hotel-proof__summary-label">Surfaced subtotal</span>
                            <strong>{surfacedTripTotal ? formatPrice(surfacedTripTotal, leadHotel.hotel.priceCurrency ?? 'EUR') : '—'}</strong>
                        </div>
                    </div>
                    <div className="case-study-proof__notes">
                        {selectedFlightPricing?.hasManualCheckRequired && <p>⚠ The backend still wants a manual check on part of this route cost.</p>}
                        {firstMileEnabled && firstMileMode === 'rental_car' && <p>ℹ Return late-arrival friction may be overstated if your car is parked at {originAirport?.code ?? state.origin}.</p>}
                        <p>Excluded from total: {lensExcludedCosts.length > 0 ? lensExcludedCosts.join(', ') : 'activity costs'}, food, and airport parking.</p>
                        <p>Hotel price may vary for group size. Booking is always an external provider handoff.</p>
                    </div>
                </section>
            )}

            {suggestionError && !isLoadingSuggestion && (
                <section className="card section-card stack-lg">
                    <div className="section-card__header"><div><p className="eyebrow">✨ Local proof</p><h2>Destination guide</h2></div></div>
                    <div className="notice-banner notice-banner--error">{suggestionError}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button type="button" className="button button--secondary button--small" onClick={() => void retrySuggestion()}>
                            🔄 Retry AI suggestion
                        </button>
                    </div>
                    <RequestDiagnostics title="Request details" diagnostics={suggestionDiagnostics} />
                </section>
            )}

            {tripGuideTrip && !isLoadingSuggestion && <TripGuide trip={tripGuideTrip} diagnostics={suggestionDiagnostics} />}

            {flights.length > 0 && !tripGuideTrip && !isLoadingSuggestion && !suggestionError && (
                <section className="card section-card stack-md">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">🧊 Local layer on demand</p>
                            <h2>Flight truth and hotel proof are loaded. Add the AI narrative only if you need it.</h2>
                            <p className="muted-text">The app now earns the right to generate the story only after the live flight and nearby-stay chain are already clear.</p>
                        </div>
                        <button type="button" className="button button--secondary" onClick={() => void retrySuggestion()}>
                            Add local proof
                        </button>
                    </div>
                </section>
            )}

            {(isSearchingFlights || flights.length > 0 || Boolean(noFlightsMessage)) && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">✈️ Route proof</p>
                            <h2>{isSearchingFlights ? 'Refreshing live route proof...' : flights.length > 0 ? 'Live route options' : '0 routes found'}</h2>
                            {!isSearchingFlights && flights.length > 0 && originAirport && destinationAirport && <p className="muted-text">{originAirport.city} ({originAirport.code}) → {destinationAirport.city} ({destinationAirport.code})</p>}
                        </div>
                    </div>
                    {isSearchingFlights ? (
                        <div className="card empty-state"><div className="loading-pulse"><FontAwesomeIcon icon={faPlane} className="empty-state__icon" /><p>Pulling the live SerpApi route feed and ranking routes by honest cost...</p></div></div>
                    ) : flights.length === 0 ? (
                        <div className="card empty-state">
                            <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                            <h3>{NO_HONEST_ROUTES_FOUND}</h3>
                            <p>We only build the itinerary after a real one-way flight appears. Try a nearby airport or another departure day.</p>
                        </div>
                    ) : (
                        <>
                            {selectedFlight && (
                                <FlightCard
                                    key={getFlightKey(selectedFlight)}
                                    flight={selectedFlight}
                                    flightSource={flightSource}
                                    flightDiagnosticsOk={Boolean(flightDiagnostics?.ok)}
                                    hero
                                    onSelect={() => setSelectedFlightKey(getFlightKey(selectedFlight))}
                                    isSelected
                                />
                            )}
                            {alternateFlights.length > 0 && (
                                <div className="stack-md">
                                    <div>
                                        <p className="eyebrow">More live route options</p>
                                        <p className="muted-text">Switching cards updates the hotel lookup automatically.</p>
                                    </div>
                                    <div className="info-grid">
                                        {alternateFlights.map((flight) => (
                                            <FlightCard
                                                key={getFlightKey(flight)}
                                                flight={flight}
                                                flightSource={flightSource}
                                                flightDiagnosticsOk={Boolean(flightDiagnostics?.ok)}
                                                onSelect={() => setSelectedFlightKey(getFlightKey(flight))}
                                                isSelected={selectedFlightKey === getFlightKey(flight)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <RequestDiagnostics title="Flight request details" diagnostics={flightDiagnostics} />
                        </>
                    )}
                </section>
            )}

            {!hasResults && !isSearchingFlights && !isLoadingSuggestion && !noFlightsMessage && !hasSearched && (
                <div className="card empty-state">
                    <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                    <h3>Flight-first discovery</h3>
                    <p>Choose a route manually or use one of the live DUB fare cards above to preload the search box with a real airport pair and date.</p>
                    <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '12px' }}>Truth-first rule: if the flight is missing, the trip never appears.</p>
                </div>
            )}
        </div>
    );
};

export default Home;
