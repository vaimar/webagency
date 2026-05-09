import { faExchangeAlt, faExternalLinkAlt, faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect } from 'react';
import Select, { components, GroupBase, OptionProps, SingleValueProps, StylesConfig } from 'react-select';
import FlightDestinationCard from './components/FlightDestinationCard';
import TruthCard from './components/TruthCard';
import { RequestDiagnostics, TripGuide, TripGuideLoading } from './components/TripGuide';
import { MOCK_FLIGHT_DESTINATIONS } from './data/mockDestinations';
import { buildAirportSearchText, DESTINATION_AIRPORT_OPTIONS, formatAirportOptionLabel, getAirportDisplay, groupAirportsByCountry, ORIGIN_AIRPORT_OPTIONS } from './data/airportMetadata';
import { useRouteSearch } from './hooks/useRouteSearch';
import { FlightAvailable } from './services/api';
import { flightUrls } from './services/affiliates';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const ESTIMATION_LABEL = 'Estimated from the previous 24 hours';
const LANDING_AUTO_REFRESH_DEBOUNCE_MS = 2_000;
const LANDING_REFRESH_DATE = '2026-06-01';

let lastLandingRefreshAt = 0;

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
            // Fall through to the plain-text formatter below.
        }
    }

    return `${currency} ${price}`;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

const extractDatePart = (value?: string): string => {
    if (!value) return '';
    if (DATE_ONLY_RE.test(value)) return value;
    const match = value.match(ISO_DATE_PREFIX_RE);
    if (match) return match[1];
    return '';
};

const formatTime = (value?: string): string => {
    if (!value) return '—';

    // Keep date-only payloads timezone-safe (avoid off-by-one day shifts).
    if (DATE_ONLY_RE.test(value)) {
        const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(utcDate);
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const getFlightDate = (flight: FlightAvailable): string => {
    // Prefer canonical departureDate (ISO date-time), fall back to legacy departureTime
    const dep = flight.departureDate ?? flight.departureTime ?? '';
    return extractDatePart(dep);
};

const getFlightLinks = (flight: FlightAvailable) => {
    const date = getFlightDate(flight);
    return flightUrls(flight.origin, flight.destination, date);
};

const isValidRedirectUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch {
        return false;
    }
};

const isWithin24Hours = (value?: string): boolean => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;
};

const getFlightPriceDisplay = (
    flight: FlightAvailable,
    flightSource: 'live' | null,
    flightDiagnosticsOk: boolean,
) => {
    const links = getFlightLinks(flight);
    const validLinks = [links.googleFlights, links.skyscanner, links.kiwi].filter(isValidRedirectUrl);
    const hasVerifiedRedirect = validLinks.length > 0;
    const hasActiveBookingApi = flightSource === 'live' && flightDiagnosticsOk;
    const isFreshRealtime = isWithin24Hours(flight.fetchDate) || !flight.fetchDate;
    const isRealtimeVerified = hasVerifiedRedirect && hasActiveBookingApi && isFreshRealtime;

    return {
        links: validLinks,
        showExactPrice: isRealtimeVerified,
        label: isRealtimeVerified ? formatPrice(flight.price, flight.currency ?? flight.antiCauchemar?.currency ?? 'EUR') : ESTIMATION_LABEL,
    };
};

const getRealWorldEntryPrice = (flight: FlightAvailable): number | undefined => {
    const honestPrice = flight.antiCauchemar?.realWorldEntryPrice ?? flight.antiCauchemar?.realCost;
    return typeof honestPrice === 'number' && Number.isFinite(honestPrice) ? honestPrice : undefined;
};

const getMainPriceLabel = (flight: FlightAvailable): string => {
    const honestPrice = getRealWorldEntryPrice(flight);
    const currency = flight.antiCauchemar?.currency ?? flight.currency ?? 'EUR';

    if (typeof honestPrice === 'number') {
        return formatPrice(honestPrice, currency);
    }

    return formatPrice(flight.price, currency);
};

/** Canonical arrival: arrivalDate (new spec) → arrivalTime → returnDate (legacy) */
const getFlightArrival = (flight: FlightAvailable): string | undefined =>
    flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate;

type AirportOption = {
    value: string;
    label: string;
    airport: ReturnType<typeof getAirportDisplay>;
};

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

const Home: React.FC = () => {
    const {
        state, flights, tripSuggestion, isSearchingFlights, isLoadingSuggestion,
        flightError, noFlightsMessage, suggestionError, flightSource, flightDiagnostics, suggestionDiagnostics, hasSearched,
        setOrigin, setDestination, searchRoute, retrySuggestion, clearResults,
    } = useRouteSearch();

    const hasResults = flights.length > 0 || tripSuggestion !== null;
    const originAirport = getAirportDisplay(state.origin);
    const destinationAirport = getAirportDisplay(state.destination);
    const originGroups = groupAirportsByCountry(ORIGIN_AIRPORT_OPTIONS);
    const destinationGroups = groupAirportsByCountry(DESTINATION_AIRPORT_OPTIONS);
    const originOptions = mapAirportGroupsToSelect(originGroups);
    const destinationOptions = mapAirportGroupsToSelect(destinationGroups);
    const selectedOriginOption = originOptions.flatMap((group) => group.options).find((option) => option.value === originAirport.searchCode) ?? null;
    const selectedDestinationOption = destinationOptions.flatMap((group) => group.options).find((option) => option.value === destinationAirport.searchCode) ?? null;
    const destinationShowcase = MOCK_FLIGHT_DESTINATIONS
        .filter((item, index, collection) => collection.findIndex((candidate) => candidate.destination === item.destination) === index)
        .map((item) => ({
            ...item,
            origin: originAirport.code,
            destination: getAirportDisplay(item.destination).code,
        }));

    useEffect(() => {
        const now = Date.now();
        if (process.env.NODE_ENV !== 'test' && now - lastLandingRefreshAt < LANDING_AUTO_REFRESH_DEBOUNCE_MS) {
            return;
        }

        lastLandingRefreshAt = now;
        void searchRoute({ refreshFlights: true, date: LANDING_REFRESH_DATE });
    }, [searchRoute]);

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content" style={{ maxWidth: '100%' }}>
                    <p className="eyebrow eyebrow--light"><FontAwesomeIcon icon={faPlane} style={{ marginRight: '8px' }} />Trip Discovery</p>
                    <h1>Start with the flight. Trust the real route.</h1>
                    <p className="hero-card__lede">The landing search opens on live Ryanair availability from {originAirport.city} to {destinationAirport.city} on 1 June 2026. We lead with the real-world entry price, show the catch, and name the actual airport instead of hiding it behind a city-group code.</p>
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
                                    placeholder="Search destination airport"
                                />
                            </div>
                            <button type="button" className="button button--large" disabled={isSearchingFlights || isLoadingSuggestion || !state.origin || !state.destination} onClick={() => void searchRoute({ refreshFlights: true, date: LANDING_REFRESH_DATE })} style={{ height: '52px' }}>
                                <FontAwesomeIcon icon={faSearch} />{isSearchingFlights || isLoadingSuggestion ? 'Searching...' : 'Find live flights'}
                            </button>
                        </div>
                        <p className="muted-text" style={{ marginTop: '10px', fontSize: '0.82rem' }}>
                            Frozen Summer truth: Paris on Ryanair means <strong>{destinationAirport.city}</strong> — {destinationAirport.airportName} ({destinationAirport.code}), {destinationAirport.country}.
                        </p>
                    </div>
                </div>
            </section>

            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">❄️ Ryanair-style destination board</p>
                        <h2>Searchable airports. Country sections. Honest fare cues.</h2>
                        <p className="muted-text">Each card names the serving airport, keeps the country visible, and surfaces a fare cue before you click.</p>
                    </div>
                </div>
                <div className="info-grid">
                    {destinationShowcase.map((destination) => (
                        <FlightDestinationCard key={`${destination.origin}-${destination.destination}-${destination.departureDate}`} destination={destination} />
                    ))}
                </div>
            </section>

            {(flightSource || hasResults) && (
                <div className="notice-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        <span>{flightSource === 'live' ? <><strong>Live Ryanair fares</strong> — sorted by real-world entry price, not the headline fare</> : <strong>Enter airports to search</strong>}{flightDiagnostics?.ok && <span className="muted-text" style={{ marginLeft: '12px' }}>Response in {flightDiagnostics.durationMs}ms</span>}</span>
                    </div>
                    {hasResults && <button type="button" className="button button--secondary button--small" onClick={clearResults}>Clear results</button>}
                </div>
            )}

            {flightError && <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{flightError}</div>}
            {noFlightsMessage && !flightError && <div className="notice-banner"><FontAwesomeIcon icon={faInfoCircle} />{noFlightsMessage}</div>}

            {isLoadingSuggestion && <TripGuideLoading />}

            {suggestionError && !isLoadingSuggestion && (
                <section className="card section-card stack-lg">
                    <div className="section-card__header"><div><p className="eyebrow">✨ AI Trip Brief</p><h2>Destination Guide</h2></div></div>
                    <div className="notice-banner notice-banner--error">{suggestionError}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button type="button" className="button button--secondary button--small" onClick={() => void retrySuggestion()}>
                            🔄 Retry AI suggestion
                        </button>
                    </div>
                    <RequestDiagnostics title="Request details" diagnostics={suggestionDiagnostics} />
                </section>
            )}

            {tripSuggestion && !isLoadingSuggestion && <TripGuide trip={tripSuggestion} diagnostics={suggestionDiagnostics} />}

            {(isSearchingFlights || flights.length > 0 || Boolean(noFlightsMessage)) && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">✈️ Available Flights</p>
                            <h2>{isSearchingFlights ? 'Refreshing live flights...' : `${flights.length} flight${flights.length !== 1 ? 's' : ''} found`}</h2>
                            {!isSearchingFlights && flights.length > 0 && <p className="muted-text">{originAirport.city} ({originAirport.code}) → {destinationAirport.city} ({destinationAirport.code})</p>}
                        </div>
                    </div>
                    {isSearchingFlights ? (
                        <div className="card empty-state"><div className="loading-pulse"><FontAwesomeIcon icon={faPlane} className="empty-state__icon" /><p>Refreshing live Ryanair availability for the cleanest route...</p></div></div>
                    ) : flights.length === 0 ? (
                        <div className="card empty-state">
                            <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                            <h3>No flight. No trip.</h3>
                            <p>We only build the itinerary after a real flight appears. Try a nearby airport or different dates.</p>
                        </div>
                    ) : (
                        <>
                            <div className="info-grid">{flights.map((flight, index) => {
                                const priceDisplay = getFlightPriceDisplay(flight, flightSource, Boolean(flightDiagnostics?.ok));
                                const [googleFlights, skyscanner, kiwi] = priceDisplay.links;
                                const honestPrice = getMainPriceLabel(flight);
                                const honestPriceAvailable = typeof getRealWorldEntryPrice(flight) === 'number';
                                const originDetails = getAirportDisplay(flight.origin);
                                const destinationDetails = getAirportDisplay(flight.destination);

                                return (
                                    <article key={`${flight.flightNumber ?? index}-${flight.departureTime ?? flight.departureDate}`} className="card card--hoverable flight-card">
                                        <div className="flight-card__header"><div className="flight-card__route"><span>{originDetails.city}</span><FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" /><span>{destinationDetails.city}</span></div>{flight.flightNumber && <span className="tag tag--success" style={{ fontSize: '0.7rem' }}>{flight.airline ?? 'Ryanair'}</span>}</div>
                                        <div>
                                            <div className="flight-card__price">{honestPrice}</div>
                                            <span className="flight-card__price-label">{honestPriceAvailable ? 'Real-world entry price' : priceDisplay.showExactPrice ? 'Base fare per person' : 'Base fare estimated from the previous 24 hours'}</span>
                                            <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                                                Base fare: {priceDisplay.label}
                                            </div>
                                        </div>
                                        <h3 style={{ fontSize: '1rem' }}>{flight.flightNumber ? `Flight ${flight.flightNumber} to ${destinationDetails.city}` : `${destinationDetails.city}, ${destinationDetails.country}`}</h3>
                                        <p className="muted-text" style={{ fontSize: '0.875rem' }}>{destinationDetails.airportName} ({destinationDetails.code}){getFlightArrival(flight) && <><br /></>}Depart: {formatTime(flight.departureDate ?? flight.departureTime)}{getFlightArrival(flight) && <><br />Arrive: {formatTime(getFlightArrival(flight))}</>}</p>
                                        <TruthCard truth={flight.antiCauchemar} />
                                        <div className="trip-booking-links" style={{ marginTop: 'auto' }}>
                                            {googleFlights && <a href={googleFlights} target="_blank" rel="noopener noreferrer" className="trip-external-link">Google Flights <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                                            {skyscanner && <a href={skyscanner} target="_blank" rel="noopener noreferrer" className="trip-external-link">Skyscanner <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                                            {kiwi && <a href={kiwi} target="_blank" rel="noopener noreferrer" className="trip-external-link">Kiwi <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                                            {priceDisplay.links.length === 0 && <span className="muted-text" style={{ fontSize: '0.8rem' }}>No verified booking link.</span>}
                                        </div>
                                    </article>
                                );
                            })}</div>
                            <RequestDiagnostics title="Flight request details" diagnostics={flightDiagnostics} />
                        </>
                    )}
                </section>
            )}

            {!hasResults && !isSearchingFlights && !isLoadingSuggestion && !noFlightsMessage && !hasSearched && (
                <div className="card empty-state">
                    <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                    <h3>Live flight-first discovery</h3>
                    <p>Start with a real route and we will only open the rest of the trip once the flight is honest enough to trust.</p>
                    <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '12px' }}>💡 Default route: Dublin (DUB) → Paris Beauvais (BVA)</p>
                </div>
            )}
        </div>
    );
};

export default Home;
