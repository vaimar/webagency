import React, { useCallback, useMemo, useState } from 'react';
import { useTripExploration } from '../TripExplorationContext';
import {
    getDestinationSuggestions,
    resolveDestinationHint,
    resolveOriginAirport,
} from '../services/destinationDirectory';
import { TripExploreRequestPayload } from '../types/tripExploration';
import TripExploreDashboard from './TripExploreDashboard';
import './TripExploreWrapper.css';

type TransportMode = 'car' | 'public';

const ACTIVITIES = ['wakeboard', 'snowboard', 'surf', 'kitesurf'] as const;

// One-click ride spots — every one resolves end-to-end on the backend, so the
// wakeboard/snowboard flow works without the user knowing what to type. Free
// text still works for anything else.
interface RideSpotPreset {
    label: string;
    destination: string;
    activity: string;
    emoji: string;
}

const RIDE_SPOT_PRESETS: RideSpotPreset[] = [
    { label: 'EXO 84', destination: 'EXO 84', activity: 'wakeboard', emoji: '🌊' },
    { label: 'Ibiza Cable Park', destination: 'Ibiza Cable Park', activity: 'wakeboard', emoji: '🌊' },
    { label: '313 Cable Park', destination: '313 Cable Park', activity: 'wakeboard', emoji: '🌊' },
    { label: 'Hypnotics', destination: 'Hypnotics', activity: 'wakeboard', emoji: '🌊' },
    { label: 'Paris Wakepark', destination: 'Paris Wakepark', activity: 'wakeboard', emoji: '🌊' },
    { label: 'Les Houches', destination: 'Les Houches', activity: 'snowboard', emoji: '🏂' },
];

const destinationSuggestions = getDestinationSuggestions();

// Zero manual cost/time entry. The backend's TripExploreRequest only reads a
// nested firstMileAccess object (mode/amount/durationMinutes) — flat fields
// like firstMileMode are silently dropped by Jackson. We send mode only and
// let the backend's own transfer estimator (Haversine + rate tables) do the
// math — never asked from the user.
const buildFirstMileAccess = (mode: TransportMode) => (
    mode === 'car'
        ? { mode: 'rental_car' as const, source: 'explore-ui' }
        : { mode: 'public_transport' as const, source: 'explore-ui' }
);

const TripExploreWrapper: React.FC = () => {
    // Fetch lifecycle and the full exploration payload live in the app-wide
    // TripExplorationContext (persisted via CacheProvider), so switching
    // routes/tabs never loses the backend data.
    const { status, tripData, lastRequest, fallbackStays, error, explore } = useTripExploration();

    const [homeAddress, setHomeAddress] = useState('Limerick, Ireland');
    const [destination, setDestination] = useState('Ibiza');
    const [activity, setActivity] = useState<string>(ACTIVITIES[0]);
    const [departureDate, setDepartureDate] = useState('2026-07-10');
    const [returnDate, setReturnDate] = useState('2026-07-13');
    const [transportMode, setTransportMode] = useState<TransportMode>('car');

    const isLoading = status === 'fetching';

    // Nights between the chosen dates (drives parking cost + stay/food totals).
    const tripNights = useMemo(() => {
        const start = new Date(departureDate);
        const end = new Date(returnDate);
        const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return Number.isFinite(diff) && diff > 0 ? diff : 3;
    }, [departureDate, returnDate]);

    // Shared search path — takes explicit destination/activity so preset chips
    // don't depend on async setState landing first.
    const runExplore = useCallback(async (destinationValue: string, activityValue: string) => {
        const trimmedDestination = destinationValue.trim();
        if (!trimmedDestination) {
            return;
        }
        const hint = resolveDestinationHint(trimmedDestination);

        // Mirrors the backend's TripExploreRequest exactly — extra keys are
        // ignored by Jackson, so anything not listed there never took effect.
        // For non-curated destinations we attach the arrivalAirport hint the
        // backend requires (400 DESTINATION_AIRPORT_REQUIRED otherwise).
        const payload: TripExploreRequestPayload = {
            origin: resolveOriginAirport(homeAddress),
            destination: trimmedDestination,
            activity: activityValue,
            travelDate: departureDate,
            ...(hint && !hint.curatedByBackend ? { arrivalAirport: hint.arrivalAirport } : {}),
            firstMileAccess: buildFirstMileAccess(transportMode),
            activityRadiusMeters: 5000,
            hotelRadiusMeters: 10000,
            providers: ['serpapi'],
        };

        await explore(payload, hint);
    }, [homeAddress, departureDate, transportMode, explore]);

    const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await runExplore(destination, activity);
    };

    const selectPresetAndSearch = (preset: RideSpotPreset) => {
        setDestination(preset.destination);
        setActivity(preset.activity);
        void runExplore(preset.destination, preset.activity);
    };

    const loadingMessage = transportMode === 'car'
        ? `Calculating your drive from ${homeAddress || 'your home'} to the airport, syncing flight windows, and filtering out logistics nightmares...`
        : `Mapping public transport and taxi options from ${homeAddress || 'your home'}, syncing flight windows, and filtering out logistics nightmares...`;

    return (
        <div className="trip-explore-wrapper">
            <form onSubmit={handleSearch} className="trip-explore-wrapper__form">
                <div className="trip-explore-wrapper__header">
                    <p className="trip-explore-wrapper__eyebrow">Plan de ouf</p>
                    <h2 className="trip-explore-wrapper__title">Door to ride spot. Zero spreadsheet math.</h2>
                    <p className="trip-explore-wrapper__subtitle">
                        Type where you start and where you want to ride — city or cable park. We resolve the
                        airports, flights, transfers, and stays; you just pick your favourite.
                    </p>
                </div>

                <div className="trip-explore-wrapper__grid">
                    <label className="trip-explore-wrapper__field">
                        <span className="trip-explore-wrapper__label">Leaving from</span>
                        <input
                            type="text"
                            value={homeAddress}
                            onChange={(event) => setHomeAddress(event.target.value)}
                            placeholder="Limerick, Ireland"
                            className="trip-explore-wrapper__input"
                        />
                    </label>

                    <label className="trip-explore-wrapper__field">
                        <span className="trip-explore-wrapper__label">To</span>
                        <input
                            type="text"
                            list="trip-explore-destinations"
                            value={destination}
                            onChange={(event) => setDestination(event.target.value)}
                            placeholder="Ibiza, Nice, EXO 84…"
                            className="trip-explore-wrapper__input"
                        />
                        <datalist id="trip-explore-destinations">
                            {destinationSuggestions.map((suggestion) => (
                                <option key={suggestion} value={suggestion} />
                            ))}
                        </datalist>
                    </label>

                    <div className="trip-explore-wrapper__field trip-explore-wrapper__field--wide">
                        <span className="trip-explore-wrapper__label">Popular ride spots — one tap</span>
                        <div className="trip-explore-wrapper__preset-row">
                            {RIDE_SPOT_PRESETS.map((preset) => (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => selectPresetAndSearch(preset)}
                                    disabled={isLoading}
                                    className={
                                        destination === preset.destination
                                            ? 'trip-explore-wrapper__preset trip-explore-wrapper__preset--active'
                                            : 'trip-explore-wrapper__preset'
                                    }
                                >
                                    {preset.emoji} {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="trip-explore-wrapper__field">
                        <span className="trip-explore-wrapper__label">Riding</span>
                        <select
                            value={activity}
                            onChange={(event) => setActivity(event.target.value)}
                            className="trip-explore-wrapper__input"
                        >
                            {ACTIVITIES.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="trip-explore-wrapper__field">
                        <span className="trip-explore-wrapper__label">Dates</span>
                        <div className="trip-explore-wrapper__date-row">
                            <input
                                type="date"
                                value={departureDate}
                                onChange={(event) => setDepartureDate(event.target.value)}
                                className="trip-explore-wrapper__date-input"
                                aria-label="Departure date"
                            />
                            <span className="trip-explore-wrapper__date-arrow">→</span>
                            <input
                                type="date"
                                value={returnDate}
                                min={departureDate}
                                onChange={(event) => setReturnDate(event.target.value)}
                                className="trip-explore-wrapper__date-input"
                                aria-label="Return date"
                            />
                        </div>
                    </label>

                    <label className="trip-explore-wrapper__field">
                        <span className="trip-explore-wrapper__label">Your ride setup</span>
                        <div className="trip-explore-wrapper__toggle-row">
                            <button
                                type="button"
                                onClick={() => setTransportMode('car')}
                                className={
                                    transportMode === 'car'
                                        ? 'trip-explore-wrapper__toggle-button trip-explore-wrapper__toggle-button--active'
                                        : 'trip-explore-wrapper__toggle-button'
                                }
                            >
                                🚗 I'll drive / My car
                            </button>
                            <button
                                type="button"
                                onClick={() => setTransportMode('public')}
                                className={
                                    transportMode === 'public'
                                        ? 'trip-explore-wrapper__toggle-button trip-explore-wrapper__toggle-button--active'
                                        : 'trip-explore-wrapper__toggle-button'
                                }
                            >
                                🚆 Public transport / Taxi
                            </button>
                        </div>
                    </label>
                </div>

                <div className="trip-explore-wrapper__submit-row">
                    <button type="submit" className="trip-explore-wrapper__button" disabled={isLoading}>
                        {isLoading ? 'Generating…' : 'Generate My Plan de Ouf'}
                    </button>
                </div>
            </form>

            {isLoading && (
                <div className="trip-explore-wrapper__loading" role="status" aria-live="polite">
                    <div className="trip-explore-wrapper__spinner" />
                    <div>
                        <p className="trip-explore-wrapper__loading-title">We’re shaping a clean plan for you.</p>
                        <p className="trip-explore-wrapper__loading-text">{loadingMessage}</p>
                    </div>
                </div>
            )}

            {status === 'error' && error && (
                <div className="trip-explore-wrapper__error" role="alert">
                    <strong className="trip-explore-wrapper__error-title">
                        Trip request failed{error.code ? ` — ${error.code}` : ''}
                    </strong>
                    <p className="trip-explore-wrapper__error-text">{error.message}</p>
                    {error.suggestions.length > 0 && (
                        <div className="trip-explore-wrapper__suggestion-row">
                            <span className="trip-explore-wrapper__suggestion-hint">Destinations that work:</span>
                            {error.suggestions.map((suggestion) => {
                                // Backend format is "City/IATA" (e.g. "Nice/NCE").
                                const label = suggestion.split('/')[0];
                                return (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        className="trip-explore-wrapper__suggestion-chip"
                                        onClick={() => setDestination(label)}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {!isLoading && tripData && (
                <TripExploreDashboard
                    tripData={tripData}
                    extraStays={fallbackStays}
                    activity={lastRequest?.activity}
                    nights={tripNights}
                    driveMode={lastRequest?.firstMileAccess?.mode === 'rental_car'}
                />
            )}
        </div>
    );
};


export default TripExploreWrapper;
