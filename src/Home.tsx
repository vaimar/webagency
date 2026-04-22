import { faExchangeAlt, faExternalLinkAlt, faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { RequestDiagnostics, TripGuide, TripGuideLoading } from './components/TripGuide';
import { useRouteSearch } from './hooks/useRouteSearch';
import { FlightAvailable } from './services/api';
import { flightUrls } from './services/affiliates';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const formatPrice = (flight: FlightAvailable): string => {
    const amount = typeof flight.price === 'number' ? flight.price.toFixed(2) : flight.price;
    return `€${amount}`;
};

const formatTime = (value?: string): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const getFlightDate = (flight: FlightAvailable): string => {
    // Prefer canonical departureDate (ISO date-time), fall back to legacy departureTime
    const dep = flight.departureDate ?? flight.departureTime ?? '';
    return dep ? new Date(dep).toISOString().slice(0, 10) : '';
};

const getFlightLinks = (flight: FlightAvailable) => {
    const date = getFlightDate(flight);
    return flightUrls(flight.origin, flight.destination, date);
};

/** Canonical arrival: arrivalDate (new spec) → arrivalTime → returnDate (legacy) */
const getFlightArrival = (flight: FlightAvailable): string | undefined =>
    flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate;

const Home: React.FC = () => {
    const {
        state, flights, tripSuggestion, isSearchingFlights, isLoadingSuggestion,
        flightError, suggestionError, flightSource, flightDiagnostics, suggestionDiagnostics,
        setOrigin, setDestination, searchRoute, retrySuggestion, clearResults,
    } = useRouteSearch();

    const hasResults = flights.length > 0 || tripSuggestion !== null;

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content" style={{ maxWidth: '100%' }}>
                    <p className="eyebrow eyebrow--light"><FontAwesomeIcon icon={faPlane} style={{ marginRight: '8px' }} />Trip Discovery</p>
                    <h1>Plan your perfect getaway</h1>
                    <p className="hero-card__lede">Search flights and get a complete AI-powered travel guide — restaurants, activities, neighborhoods, and a day-by-day itinerary.</p>
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
                            <button type="button" className="button button--large" disabled={isSearchingFlights || isLoadingSuggestion || !state.origin || !state.destination} onClick={() => void searchRoute()} style={{ height: '52px' }}>
                                <FontAwesomeIcon icon={faSearch} />{isSearchingFlights || isLoadingSuggestion ? 'Searching...' : 'Discover'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {(flightSource || hasResults) && (
                <div className="notice-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        <span>{flightSource === 'live' ? <><strong>Live fares</strong> — Real-time prices from Ryanair</> : flightSource === 'curated' ? <><strong>Sample data</strong> — Curated fallback examples</> : <strong>Enter airports to search</strong>}{flightDiagnostics?.ok && <span className="muted-text" style={{ marginLeft: '12px' }}>Response in {flightDiagnostics.durationMs}ms</span>}</span>
                    </div>
                    {hasResults && <button type="button" className="button button--secondary button--small" onClick={clearResults}>Clear results</button>}
                </div>
            )}

            {flightError && <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{flightError}</div>}

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

            {(isSearchingFlights || flights.length > 0) && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">✈️ Available Flights</p>
                            <h2>{isSearchingFlights ? 'Searching for flights...' : `${flights.length} flight${flights.length !== 1 ? 's' : ''} found`}</h2>
                            {!isSearchingFlights && flights.length > 0 && <p className="muted-text">{state.origin} → {state.destination}</p>}
                        </div>
                    </div>
                    {isSearchingFlights ? (
                        <div className="card empty-state"><div className="loading-pulse"><FontAwesomeIcon icon={faPlane} className="empty-state__icon" /><p>Checking live availability...</p></div></div>
                    ) : (
                        <>
                            <div className="info-grid">{flights.map((flight, index) => (
                                <article key={`${flight.flightNumber ?? index}-${flight.departureTime ?? flight.departureDate}`} className="card card--hoverable flight-card">
                                    <div className="flight-card__header"><div className="flight-card__route"><span>{flight.origin}</span><FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" /><span>{flight.destination}</span></div>{flight.flightNumber && <span className="tag tag--success" style={{ fontSize: '0.7rem' }}>{flight.airline ?? 'Ryanair'}</span>}</div>
                                    <div><div className="flight-card__price">{formatPrice(flight)}</div><span className="flight-card__price-label">per person</span></div>
                                    <h3 style={{ fontSize: '1rem' }}>{flight.flightNumber ? `Flight ${flight.flightNumber}` : flight.destination}</h3>
                                    <p className="muted-text" style={{ fontSize: '0.875rem' }}>Depart: {formatTime(flight.departureDate ?? flight.departureTime)}{getFlightArrival(flight) && <><br />Arrive: {formatTime(getFlightArrival(flight))}</>}</p>
                                    <div className="trip-booking-links" style={{ marginTop: 'auto' }}>
                                        {(() => {
                                            const links = getFlightLinks(flight);
                                            return (
                                                <>
                                                    <a href={links.googleFlights} target="_blank" rel="noopener noreferrer" className="trip-external-link">Google Flights <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>
                                                    <a href={links.skyscanner} target="_blank" rel="noopener noreferrer" className="trip-external-link">Skyscanner <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>
                                                    <a href={links.kiwi} target="_blank" rel="noopener noreferrer" className="trip-external-link">Kiwi <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </article>
                            ))}</div>
                            <RequestDiagnostics title="Flight request details" diagnostics={flightDiagnostics} />
                        </>
                    )}
                </section>
            )}

            {!hasResults && !isSearchingFlights && !isLoadingSuggestion && (
                <div className="card empty-state">
                    <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                    <h3>Discover your next destination</h3>
                    <p>Enter your departure and destination airports above to get flights, restaurant picks, activities, and a full day-by-day itinerary.</p>
                    <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '12px' }}>💡 Try: DUB → PAR, DUB → BCN, DUB → ROM</p>
                </div>
            )}
        </div>
    );
};

export default Home;
