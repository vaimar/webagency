import React, { useMemo, useState } from 'react';
import FlightDestinationCard from './components/FlightDestinationCard';
import { useFlightDestinations } from './hooks/useFlightDestinations';

const Home: React.FC = () => {
    const [origin, setOrigin] = useState<string>('PAR');
    const [maxPrice, setMaxPrice] = useState<number>(220);
    const { destinations, fetchedAt, isLoading, notice, refresh, source } = useFlightDestinations({ origin, maxPrice });

    const formattedTimestamp = useMemo(() => {
        if (!fetchedAt) {
            return 'Fetching...';
        }

        return new Intl.DateTimeFormat('en', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(fetchedAt));
    }, [fetchedAt]);

    return (
        <div className="stack-xl">
            <section className="hero card hero-card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow">Discover fares</p>
                    <h1>Browse destination ideas without fighting the UI.</h1>
                    <p className="hero-card__lede">
                        Search by origin airport and budget cap. Results are cached locally, and the app falls back to
                        curated sample fares if live access is not configured.
                    </p>
                </div>

                <div className="hero-card__panel">
                    <p className="eyebrow">Current mode</p>
                    <strong>{source === 'live' ? 'Live Amadeus fares' : 'Curated demo fares'}</strong>
                    <p className="muted-text">Updated {formattedTimestamp}</p>
                </div>
            </section>

            <section className="card section-card stack-lg">
                <div className="section-card__header">
                    <div>
                        <p className="eyebrow">Filters</p>
                        <h2>Dial in the shortlist</h2>
                    </div>
                    <button type="button" className="button button--secondary" onClick={() => void refresh()}>
                        Refresh
                    </button>
                </div>

                <div className="filter-grid">
                    <label className="field-group">
                        <span className="field-group__label">Origin airport</span>
                        <input
                            value={origin}
                            maxLength={3}
                            className="text-input"
                            onChange={(event) => setOrigin(event.target.value.toUpperCase())}
                            placeholder="PAR"
                        />
                    </label>

                    <label className="field-group">
                        <span className="field-group__label">Maximum fare</span>
                        <input
                            type="number"
                            min={50}
                            step={10}
                            value={maxPrice}
                            className="text-input"
                            onChange={(event) => setMaxPrice(Number(event.target.value) || 50)}
                        />
                    </label>
                </div>

                {notice ? <div className="notice-banner">{notice}</div> : null}
            </section>

            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">Results</p>
                        <h2>{isLoading ? 'Loading fares…' : `${destinations.length} destinations under your budget`}</h2>
                    </div>
                </div>

                {isLoading ? (
                    <div className="card empty-state">
                        <p>Loading route ideas and checking the cache…</p>
                    </div>
                ) : destinations.length > 0 ? (
                    <div className="info-grid">
                        {destinations.map((destination) => (
                            <FlightDestinationCard
                                key={`${destination.origin}-${destination.destination}-${destination.departureDate}`}
                                destination={destination}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="card empty-state">
                        <h3>No destinations match those filters.</h3>
                        <p>Try increasing your fare cap or changing the origin airport code.</p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Home;
