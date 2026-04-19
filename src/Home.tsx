import { faExchangeAlt, faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import { useRouteSearch } from './hooks/useRouteSearch';
import { AccommodationOption, Activity, ApiDiagnostics, BackendFlight, DayPlan, Neighborhood, Restaurant, TripSuggestion } from './services/api';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const formatPrice = (flight: BackendFlight): string => {
    const amount = typeof flight.price === 'number' ? flight.price.toFixed(2) : flight.price;
    return `€${amount}`;
};

const formatTime = (value?: string): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const formatDiagnosticsTime = (value?: string): string => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(value));
};

const categoryEmoji: Record<string, string> = {
    culture: '🏛️', adventure: '🧗', food: '🍽️', nightlife: '🌙', nature: '🌿', shopping: '🛍️',
};

const RequestDiagnostics = ({ title, diagnostics }: { title: string; diagnostics: ApiDiagnostics | null }) => {
    if (!diagnostics) return null;
    return (
        <details className="debug-panel">
            <summary>{title}</summary>
            <dl className="debug-panel__grid">
                <div><dt>URL</dt><dd>{diagnostics.url}</dd></div>
                <div><dt>Status</dt><dd>{diagnostics.status ?? 'network error'} {diagnostics.statusText}</dd></div>
                <div><dt>Duration</dt><dd>{diagnostics.durationMs} ms</dd></div>
                <div><dt>When</dt><dd>{formatDiagnosticsTime(diagnostics.timestamp)}</dd></div>
                {diagnostics.error ? <div className="debug-panel__full"><dt>Error</dt><dd>{diagnostics.error}</dd></div> : null}
            </dl>
        </details>
    );
};

type TripTab = 'overview' | 'restaurants' | 'activities' | 'stay' | 'itinerary';

const TRIP_TABS: { key: TripTab; label: string; emoji: string }[] = [
    { key: 'overview', label: 'Overview', emoji: '✨' },
    { key: 'restaurants', label: 'Restaurants', emoji: '🍽️' },
    { key: 'activities', label: 'Activities', emoji: '🎯' },
    { key: 'stay', label: 'Where to Stay', emoji: '🏨' },
    { key: 'itinerary', label: '3-Day Plan', emoji: '📋' },
];

const OverviewTab: React.FC<{ trip: TripSuggestion }> = ({ trip }) => (
    <div className="trip-tab-content stack-lg">
        {trip.summary && <p className="trip-summary">{trip.summary}</p>}
        <div className="trip-quickfacts">
            {trip.bestTimeToVisit && <div className="trip-quickfact"><span className="trip-quickfact__icon">📅</span><div><strong>Best Time</strong><p>{trip.bestTimeToVisit}</p></div></div>}
            {trip.estimatedBudget && <div className="trip-quickfact"><span className="trip-quickfact__icon">💰</span><div><strong>Budget</strong><p>{trip.estimatedBudget}</p></div></div>}
            {trip.weather && <div className="trip-quickfact"><span className="trip-quickfact__icon">🌤️</span><div><strong>Weather</strong><p>{trip.weather}</p></div></div>}
            {trip.language && <div className="trip-quickfact"><span className="trip-quickfact__icon">🗣️</span><div><strong>Language</strong><p>{trip.language}</p></div></div>}
            {trip.currency && <div className="trip-quickfact"><span className="trip-quickfact__icon">💱</span><div><strong>Currency</strong><p>{trip.currency}</p></div></div>}
        </div>
        {trip.neighborhoods && trip.neighborhoods.length > 0 && (
            <div className="stack-md">
                <h3>🏘️ Neighborhoods to Explore</h3>
                <div className="trip-neighborhoods">{trip.neighborhoods.map((n: Neighborhood) => (
                    <div key={n.name} className="trip-neighborhood card"><h4>{n.name}</h4><p className="trip-neighborhood__vibe">{n.vibe}</p><span className="tag">{n.bestFor}</span></div>
                ))}</div>
            </div>
        )}
        {trip.localTips && trip.localTips.length > 0 && (
            <div className="stack-md">
                <h3>💡 Local Tips</h3>
                <div className="trip-tips">{trip.localTips.map((tip, i) => (
                    <div key={i} className="trip-tip"><span className="trip-tip__number">{i + 1}</span><p>{tip}</p></div>
                ))}</div>
            </div>
        )}
        {trip.packingTips && trip.packingTips.length > 0 && (
            <div className="stack-md">
                <h3>🎒 Packing List</h3>
                <div className="trip-packing">{trip.packingTips.map((item, i) => (
                    <span key={i} className="trip-packing__item">✓ {item}</span>
                ))}</div>
            </div>
        )}
    </div>
);

const RestaurantsTab: React.FC<{ restaurants: Restaurant[] }> = ({ restaurants }) => (
    <div className="trip-tab-content"><div className="trip-restaurants">{restaurants.map((r, i) => (
        <article key={i} className="trip-restaurant card card--hoverable">
            <div className="trip-restaurant__header"><h4>{r.name}</h4><span className="trip-restaurant__price">{r.priceRange}</span></div>
            <span className="tag">{r.cuisine}</span>
            <div className="trip-restaurant__musttry"><strong>Must try:</strong> {r.mustTry}</div>
            {r.tip && <p className="trip-restaurant__tip">💡 {r.tip}</p>}
        </article>
    ))}</div></div>
);

const ActivitiesTab: React.FC<{ activities: Activity[] }> = ({ activities }) => (
    <div className="trip-tab-content"><div className="trip-activities">{activities.map((a, i) => (
        <article key={i} className="trip-activity card card--hoverable">
            <div className="trip-activity__header">
                <span className="trip-activity__emoji">{categoryEmoji[a.category] ?? '🎯'}</span>
                <div><h4>{a.name}</h4><div className="trip-activity__meta"><span>⏱ {a.duration}</span><span>💰 {a.cost}</span></div></div>
            </div>
            <p>{a.description}</p>
            <span className="tag">{a.category}</span>
        </article>
    ))}</div></div>
);

const StayTab: React.FC<{ accommodation: AccommodationOption[] }> = ({ accommodation }) => (
    <div className="trip-tab-content"><div className="trip-accommodation">{accommodation.map((a, i) => (
        <article key={i} className="trip-accommodation-card card card--hoverable">
            <div className="trip-accommodation-card__type">{a.type === 'Budget' ? '🏠' : a.type === 'Luxury' ? '🏰' : '🏨'} {a.type}</div>
            <h4>{a.area}</h4>
            <div className="trip-accommodation-card__price">{a.pricePerNight}<span> / night</span></div>
            {a.tip && <p className="trip-accommodation-card__tip">💡 {a.tip}</p>}
        </article>
    ))}</div></div>
);

const ItineraryTab: React.FC<{ days: DayPlan[] }> = ({ days }) => (
    <div className="trip-tab-content"><div className="trip-itinerary">{days.map((d) => (
        <article key={d.day} className="trip-day card">
            <div className="trip-day__header"><span className="trip-day__badge">Day {d.day}</span><h4>{d.title}</h4></div>
            <div className="trip-day__timeline">
                <div className="trip-day__slot"><span className="trip-day__slot-label">☀️ Morning</span><p>{d.morning}</p></div>
                <div className="trip-day__slot"><span className="trip-day__slot-label">🌤️ Afternoon</span><p>{d.afternoon}</p></div>
                <div className="trip-day__slot"><span className="trip-day__slot-label">🌙 Evening</span><p>{d.evening}</p></div>
            </div>
        </article>
    ))}</div></div>
);

const TripGuide: React.FC<{ trip: TripSuggestion; diagnostics: ApiDiagnostics | null }> = ({ trip, diagnostics }) => {
    const [activeTab, setActiveTab] = useState<TripTab>('overview');
    const hasRestaurants = (trip.restaurants?.length ?? 0) > 0;
    const hasActivities = (trip.activities?.length ?? 0) > 0;
    const hasStay = (trip.accommodation?.length ?? 0) > 0;
    const hasItinerary = (trip.dayItinerary?.length ?? 0) > 0;
    const hasStructured = hasRestaurants || hasActivities || hasStay || hasItinerary;

    if (!hasStructured && !trip.summary) {
        return (
            <section className="card section-card stack-lg">
                <div className="section-card__header"><div><p className="eyebrow">✨ AI Trip Brief</p><h2>{trip.origin} → {trip.destination}</h2></div></div>
                <p className="ai-suggestion-text">{trip.suggestion ?? trip.rawText ?? ''}</p>
                <RequestDiagnostics title="AI request details" diagnostics={diagnostics} />
            </section>
        );
    }

    return (
        <section className="trip-guide">
            <div className="trip-guide__hero">
                <div className="trip-guide__hero-content">
                    <p className="eyebrow eyebrow--light">✨ AI-Powered Trip Guide</p>
                    <h2>{trip.origin} → {trip.destination}</h2>
                    {trip.summary && <p className="trip-guide__summary">{trip.summary}</p>}
                </div>
            </div>
            {hasStructured && (
                <nav className="trip-tabs">
                    {TRIP_TABS.map((tab) => {
                        if (tab.key === 'restaurants' && !hasRestaurants) return null;
                        if (tab.key === 'activities' && !hasActivities) return null;
                        if (tab.key === 'stay' && !hasStay) return null;
                        if (tab.key === 'itinerary' && !hasItinerary) return null;
                        return (
                            <button key={tab.key} type="button" className={`trip-tab ${activeTab === tab.key ? 'trip-tab--active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                                <span>{tab.emoji}</span> {tab.label}
                            </button>
                        );
                    })}
                </nav>
            )}
            <div className="trip-guide__body">
                {activeTab === 'overview' && <OverviewTab trip={trip} />}
                {activeTab === 'restaurants' && hasRestaurants && <RestaurantsTab restaurants={trip.restaurants!} />}
                {activeTab === 'activities' && hasActivities && <ActivitiesTab activities={trip.activities!} />}
                {activeTab === 'stay' && hasStay && <StayTab accommodation={trip.accommodation!} />}
                {activeTab === 'itinerary' && hasItinerary && <ItineraryTab days={trip.dayItinerary!} />}
            </div>
            <RequestDiagnostics title="AI request details" diagnostics={diagnostics} />
        </section>
    );
};

const Home: React.FC = () => {
    const {
        state, flights, tripSuggestion, isSearchingFlights, isLoadingSuggestion,
        flightError, suggestionError, flightSource, flightDiagnostics, suggestionDiagnostics,
        setOrigin, setDestination, searchRoute, clearResults,
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

            {isLoadingSuggestion && (
                <section className="trip-guide trip-guide--loading">
                    <div className="trip-guide__hero"><div className="trip-guide__hero-content"><p className="eyebrow eyebrow--light">✨ AI-Powered Trip Guide</p><h2>Building your travel guide...</h2></div></div>
                    <div className="trip-loading"><div className="trip-loading__grid">
                        {['Researching restaurants...', 'Finding activities...', 'Checking neighborhoods...', 'Planning itinerary...'].map((text) => (
                            <div key={text} className="trip-loading__item loading-pulse"><div className="trip-loading__bar" /><p className="muted-text">{text}</p></div>
                        ))}
                    </div></div>
                </section>
            )}

            {suggestionError && !isLoadingSuggestion && (
                <section className="card section-card stack-lg">
                    <div className="section-card__header"><div><p className="eyebrow">✨ AI Trip Brief</p><h2>Destination Guide</h2></div></div>
                    <div className="notice-banner notice-banner--error">{suggestionError}</div>
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
                                    <p className="muted-text" style={{ fontSize: '0.875rem' }}>Depart: {formatTime(flight.departureTime ?? flight.departureDate)}{(flight.arrivalTime ?? flight.returnDate) && <><br />Arrive: {formatTime(flight.arrivalTime ?? flight.returnDate)}</>}</p>
                                    <button className="button button--full" style={{ marginTop: 'auto' }}>Select Flight</button>
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
