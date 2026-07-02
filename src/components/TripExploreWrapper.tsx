import React, { useMemo, useState } from 'react';
import { CACHE_TTL, useCache } from '../CacheContext';
import {
    StoredTripExploration,
    TRIP_EXPLORE_CACHE_KEY,
    TripExplorationResponse,
    TripExploreRequestPayload,
} from '../types/tripExploration';
import TripExploreDashboard from './TripExploreDashboard';
import './TripExploreWrapper.css';

type TransportMode = 'car' | 'public';

interface RideSpotOption {
    label: string;
    destination: string;
    activity: string;
    latitude: number;
    longitude: number;
}

const rideSpots: RideSpotOption[] = [
    {
        label: 'EXO 84 (Wakeboard, Geneva)',
        destination: 'EXO 84',
        activity: 'wakeboard',
        latitude: 46.218,
        longitude: 6.153,
    },
    {
        label: 'Ibiza Cable Park (Wakeboard)',
        destination: 'Ibiza Cable Park',
        activity: 'wakeboard',
        latitude: 38.912,
        longitude: 1.433,
    },
    {
        label: 'Les Houches (Snowboard)',
        destination: 'Les Houches',
        activity: 'snowboard',
        latitude: 45.892,
        longitude: 6.796,
    },
    {
        label: '313 Cable Park (Prague)',
        destination: '313 Cable Park',
        activity: 'wakeboard',
        latitude: 50.086,
        longitude: 14.418,
    },
];

// Rough hub lookup — the backend/geocoder does the real work,
// this is only a lightweight frontend fallback so we never send a blank origin.
const resolveOriginAirport = (homeAddress: string): string => {
    const normalized = homeAddress.toLowerCase();

    const hubMap: Array<[string, string]> = [
        ['limerick', 'SNN'],
        ['dublin', 'DUB'],
        ['paris', 'CDG'],
        ['london', 'LHR'],
        ['nice', 'NCE'],
        ['lyon', 'LYS'],
        ['berlin', 'BER'],
        ['cork', 'ORK'],
        ['galway', 'NOC'],
    ];

    const match = hubMap.find(([city]) => normalized.includes(city));
    return match ? match[1] : 'DUB';
};

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
    const { getCachedResult, updateCache } = useCache();

    const [homeAddress, setHomeAddress] = useState('Limerick, Ireland');
    const [rideDestination, setRideDestination] = useState(rideSpots[0].label);
    const [departureDate, setDepartureDate] = useState('2026-07-10');
    const [returnDate, setReturnDate] = useState('2026-07-13');
    const [transportMode, setTransportMode] = useState<TransportMode>('car');

    // Route changes unmount this tab; rehydrate the last full exploration
    // result from the app-wide cache so nothing downstream receives undefined.
    const [tripData, setTripData] = useState<TripExplorationResponse | null>(
        () => getCachedResult<StoredTripExploration>(TRIP_EXPLORE_CACHE_KEY)?.response ?? null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState('');
    const [error, setError] = useState('');

    const selectedSpot = useMemo(
        () => rideSpots.find((spot) => spot.label === rideDestination) ?? rideSpots[0],
        [rideDestination],
    );

    const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError('');
        setTripData(null);

        const originAirport = resolveOriginAirport(homeAddress);

        // Mirrors the backend's TripExploreRequest exactly — extra keys are
        // ignored by Jackson, so anything not listed there never took effect.
        const payload: TripExploreRequestPayload = {
            origin: originAirport,
            destination: selectedSpot.destination,
            activity: selectedSpot.activity,
            travelDate: departureDate,
            firstMileAccess: buildFirstMileAccess(transportMode),
            activityRadiusMeters: 5000,
            hotelRadiusMeters: 10000,
            providers: ['serpapi'],
        };

        try {
            setLoadingStage('Resolving your nearest hub…');
            const response = await fetch('http://localhost:9090/api/trips/explore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            setLoadingStage('Cross-checking flights and hidden-gem stays…');

            if (!response.ok) {
                setError(`The request could not be completed. Trip search failed with status ${response.status}`);
                setTripData(null);
                return;
            }

            const data = (await response.json()) as TripExplorationResponse;
            setTripData(data);
            updateCache<StoredTripExploration>(
                TRIP_EXPLORE_CACHE_KEY,
                { request: payload, response: data, storedAt: new Date().toISOString() },
                CACHE_TTL.TRIP_EXPLORATION,
            );
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : 'Unable to reach the trip engine.';
            setError(`The request could not be completed. ${message}`);
        } finally {
            setIsLoading(false);
            setLoadingStage('');
        }
    };

    const loadingMessage = transportMode === 'car'
        ? `Calculating your drive from ${homeAddress || 'your home'} to the airport, syncing flight windows, and filtering out logistics nightmares...`
        : `Mapping public transport and taxi options from ${homeAddress || 'your home'}, syncing flight windows, and filtering out logistics nightmares...`;

    return (
        <div className="trip-explore-wrapper">
            <form onSubmit={handleSearch} className="trip-explore-wrapper__form">
                <div className="trip-explore-wrapper__header">
                    <p className="trip-explore-wrapper__eyebrow">Plan de ouf</p>
                    <h2 className="trip-explore-wrapper__title">Four fields. Zero spreadsheet math.</h2>
                    <p className="trip-explore-wrapper__subtitle">
                        No airport codes, no manual taxi fares, no timers to calculate. Tell us where you start,
                        where you ride, when — and how you'll reach the airport. We handle the rest.
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
                        <span className="trip-explore-wrapper__label">To the spot</span>
                        <select
                            value={rideDestination}
                            onChange={(event) => setRideDestination(event.target.value)}
                            className="trip-explore-wrapper__input"
                        >
                            {rideSpots.map((spot) => (
                                <option key={spot.label} value={spot.label}>
                                    {spot.label}
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
                        <p className="trip-explore-wrapper__loading-title">{loadingStage || 'We’re shaping a clean plan for you.'}</p>
                        <p className="trip-explore-wrapper__loading-text">{loadingMessage}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="trip-explore-wrapper__error" role="alert">
                    <strong className="trip-explore-wrapper__error-title">Trip request failed</strong>
                    <p className="trip-explore-wrapper__error-text">{error}</p>
                </div>
            )}

            {tripData && <TripExploreDashboard tripData={tripData} />}
        </div>
    );
};


export default TripExploreWrapper;
