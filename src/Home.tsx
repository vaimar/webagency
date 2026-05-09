import { faExchangeAlt, faExternalLinkAlt, faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect } from 'react';
import TruthCard from './components/TruthCard';
import { RequestDiagnostics, TripGuide, TripGuideLoading } from './components/TripGuide';
import { useRouteSearch } from './hooks/useRouteSearch';
import { FlightAvailable } from './services/api';
import { flightUrls } from './services/affiliates';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const ESTIMATION_LABEL = 'Estimated from the previous 24 hours';
const LANDING_AUTO_REFRESH_DEBOUNCE_MS = 2_000;

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

const Home: React.FC = () => {
    const {
        state, flights, tripSuggestion, isSearchingFlights, isLoadingSuggestion,
        flightError, noFlightsMessage, suggestionError, flightSource, flightDiagnostics, suggestionDiagnostics, hasSearched,
        setOrigin, setDestination, searchRoute, retrySuggestion, clearResults,
    } = useRouteSearch();

    const hasResults = flights.length > 0 || tripSuggestion !== null;

    useEffect(() => {
        const now = Date.now();
        if (process.env.NODE_ENV !== 'test' && now - lastLandingRefreshAt < LANDING_AUTO_REFRESH_DEBOUNCE_MS) {
            return;
        }

        lastLandingRefreshAt = now;
        void searchRoute({ refreshFlights: true });
    }, [searchRoute]);

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content" style={{ maxWidth: '100%' }}>
                    <p className="eyebrow eyebrow--light"><FontAwesomeIcon icon={faPlane} style={{ marginRight: '8px' }} />Trip Discovery</p>
                    <h1>Start with the flight. Trust the real price.</h1>
                    <p className="hero-card__lede">The landing search opens on live Ryanair availability from Dublin to Paris. We lead with the real-world entry price, flag the catch, and only build the trip if a flight exists.</p>
                    <div className="search-box" style={{ marginTop: '24px' }}>
                        <div className="search-box__grid">
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />From</label>
                                <input value={state.origin} maxLength={4} className="search-box__input" placeholder="DUB" onChange={(e) => setOrigin(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                            </div>
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />To</label>
                                <input value={state.destination} maxLength={4} className="search-box__input" placeholder="BCN" onChange={(e) => setDestination(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                            </div>
                            <button type="button" className="button button--large" disabled={isSearchingFlights || isLoadingSuggestion || !state.origin || !state.destination} onClick={() => void searchRoute({ refreshFlights: true })} style={{ height: '52px' }}>
                                <FontAwesomeIcon icon={faSearch} />{isSearchingFlights || isLoadingSuggestion ? 'Searching...' : 'Find live flights'}
                            </button>
                        </div>
                    </div>
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
                            {!isSearchingFlights && flights.length > 0 && <p className="muted-text">{state.origin} → {state.destination}</p>}
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

                                return (
                                    <article key={`${flight.flightNumber ?? index}-${flight.departureTime ?? flight.departureDate}`} className="card card--hoverable flight-card">
                                        <div className="flight-card__header"><div className="flight-card__route"><span>{flight.origin}</span><FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" /><span>{flight.destination}</span></div>{flight.flightNumber && <span className="tag tag--success" style={{ fontSize: '0.7rem' }}>{flight.airline ?? 'Ryanair'}</span>}</div>
                                        <div>
                                            <div className="flight-card__price">{honestPrice}</div>
                                            <span className="flight-card__price-label">{honestPriceAvailable ? 'Real-world entry price' : priceDisplay.showExactPrice ? 'Base fare per person' : 'Base fare estimated from the previous 24 hours'}</span>
                                            <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                                                Base fare: {priceDisplay.label}
                                            </div>
                                        </div>
                                        <h3 style={{ fontSize: '1rem' }}>{flight.flightNumber ? `Flight ${flight.flightNumber}` : flight.destination}</h3>
                                        <p className="muted-text" style={{ fontSize: '0.875rem' }}>Depart: {formatTime(flight.departureDate ?? flight.departureTime)}{getFlightArrival(flight) && <><br />Arrive: {formatTime(getFlightArrival(flight))}</>}</p>
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
                    <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '12px' }}>💡 Default route: DUB → PAR</p>
                </div>
            )}
        </div>
    );
};

export default Home;
