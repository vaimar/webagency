import React from 'react';
import { useRouteSearch } from './hooks/useRouteSearch';
import { BackendFlight } from './services/api';

const formatPrice = (flight: BackendFlight): string => {
    const amount = typeof flight.price === 'number'
        ? flight.price.toFixed(2)
        : flight.price;
    return `${flight.currency ?? 'EUR'} ${amount}`;
};

const formatTime = (value?: string): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const Home: React.FC = () => {
    const {
        state,
        flights,
        tripSuggestion,
        isSearchingFlights,
        isLoadingSuggestion,
        flightError,
        suggestionError,
        flightSource,
        setOrigin,
        setDestination,
        searchRoute,
        clearResults,
    } = useRouteSearch();

    const hasResults = flights.length > 0 || tripSuggestion !== null;

    return (
        <div className="stack-xl">
            <section className="hero card hero-card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow">Discover fares</p>
                    <h1>Search a real route, get an AI trip brief.</h1>
                    <p className="hero-card__lede">
                        Enter an origin and destination. The backend checks live Ryanair fares and asks the AI
                        for a destination brief — all in one go.
                    </p>
                </div>

                <div className="hero-card__panel">
                    <p className="eyebrow">Data source</p>
                    {flightSource === 'live' ? (
                        <strong>Live Ryanair fares</strong>
                    ) : flightSource === 'curated' ? (
                        <strong>Curated fallback ideas</strong>
                    ) : (
                        <strong>Enter a route to start</strong>
                    )}
                    <p className="muted-text">AI trip brief via backend on port 9090</p>
                </div>
            </section>

            <section className="card section-card stack-lg">
                <div className="section-card__header">
                    <div>
                        <p className="eyebrow">Route</p>
                        <h2>Where are you flying?</h2>
                    </div>
                    {hasResults && (
                        <button type="button" className="button button--secondary" onClick={clearResults}>
                            Clear
                        </button>
                    )}
                </div>

                <div className="filter-grid">
                    <label className="field-group">
                        <span className="field-group__label">Origin airport</span>
                        <input
                            value={state.origin}
                            maxLength={4}
                            className="text-input"
                            placeholder="DUB"
                            onChange={(event) => setOrigin(event.target.value)}
                        />
                    </label>

                    <label className="field-group">
                        <span className="field-group__label">Destination airport</span>
                        <input
                            value={state.destination}
                            maxLength={4}
                            className="text-input"
                            placeholder="STN"
                            onChange={(event) => setDestination(event.target.value)}
                        />
                    </label>
                </div>

                <div className="button-row">
                    <button
                        type="button"
                        className="button"
                        disabled={isSearchingFlights || isLoadingSuggestion}
                        onClick={() => void searchRoute()}
                    >
                        {isSearchingFlights || isLoadingSuggestion ? 'Searching…' : 'Search route'}
                    </button>
                </div>

                {flightError ? <div className="notice-banner">{flightError}</div> : null}
            </section>

            {/* AI Trip Suggestion */}
            {(isLoadingSuggestion || tripSuggestion || suggestionError) && (
                <section className="card section-card stack-lg">
                    <div>
                        <p className="eyebrow">AI trip brief</p>
                        <h2>
                            {isLoadingSuggestion
                                ? 'Generating your brief…'
                                : tripSuggestion
                                ? `${tripSuggestion.origin} → ${tripSuggestion.destination}`
                                : 'Trip brief'}
                        </h2>
                    </div>

                    {isLoadingSuggestion ? (
                        <div className="empty-state muted-text">
                            <p>Asking the AI for destination ideas…</p>
                        </div>
                    ) : suggestionError ? (
                        <div className="notice-banner">{suggestionError}</div>
                    ) : tripSuggestion ? (
                        <div className="stack-lg">
                            <p className="ai-suggestion-text">{tripSuggestion.suggestion ?? tripSuggestion.rawText}</p>

                            {tripSuggestion.highlights && tripSuggestion.highlights.length > 0 && (
                                <div className="stack-sm">
                                    <h3>Highlights</h3>
                                    <div className="tag-list">
                                        {tripSuggestion.highlights.map((h) => (
                                            <span key={h} className="tag">{h}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="info-grid">
                                {tripSuggestion.estimatedBudget && (
                                    <div className="card info-card">
                                        <h2>Estimated budget</h2>
                                        <p>{tripSuggestion.estimatedBudget}</p>
                                    </div>
                                )}
                                {tripSuggestion.bestTimeToVisit && (
                                    <div className="card info-card">
                                        <h2>Best time to visit</h2>
                                        <p>{tripSuggestion.bestTimeToVisit}</p>
                                    </div>
                                )}
                                {tripSuggestion.accommodation && (
                                    <div className="card info-card">
                                        <h2>Where to stay</h2>
                                        <p>{tripSuggestion.accommodation}</p>
                                    </div>
                                )}
                                {tripSuggestion.food && (
                                    <div className="card info-card">
                                        <h2>What to eat</h2>
                                        <p>{tripSuggestion.food}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </section>
            )}

            {/* Flights */}
            {(isSearchingFlights || flights.length > 0) && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">Flights</p>
                            <h2>
                                {isSearchingFlights
                                    ? 'Searching flights…'
                                    : `${flights.length} result${flights.length !== 1 ? 's' : ''} for ${state.origin} → ${state.destination}`}
                            </h2>
                        </div>
                    </div>

                    {isSearchingFlights ? (
                        <div className="card empty-state">
                            <p>Checking live Ryanair availability…</p>
                        </div>
                    ) : (
                        <div className="info-grid">
                            {flights.map((flight, index) => (
                                <article key={`${flight.flightNumber ?? index}-${flight.departureTime ?? flight.departureDate}`} className="card flight-card">
                                    <div className="flight-card__eyebrow">
                                        {flight.origin} → {flight.destination}
                                        {flight.airline ? ` · ${flight.airline}` : ''}
                                        {flight.flightNumber ? ` · ${flight.flightNumber}` : ''}
                                    </div>
                                    <div className="flight-card__price">{formatPrice(flight)}</div>
                                    <h3>{flight.destination}</h3>
                                    <p className="muted-text">
                                        Depart {formatTime(flight.departureTime ?? flight.departureDate)}
                                        {(flight.arrivalTime ?? flight.returnDate) ? ` · Arrive ${formatTime(flight.arrivalTime ?? flight.returnDate)}` : ''}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {!hasResults && !isSearchingFlights && !isLoadingSuggestion && (
                <div className="card empty-state">
                    <h3>Enter an origin and destination above.</h3>
                    <p>The app will fetch real Ryanair fares and generate an AI trip brief for your route.</p>
                </div>
            )}
        </div>
    );
};

export default Home;
