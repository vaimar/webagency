import React, { useMemo, useState } from 'react';
import {
    DEFAULT_STAYS_FILTERS,
    filterAndSortStays,
    formatCurrency,
    formatKm,
    formatRating,
    getGemCurrency,
    getGemDistanceKm,
    getGemPrice,
    getGemRating,
    getStayQuoteSummary,
    getStaysPriceCeiling,
    humanizeProviderLabel,
    shouldPromotePendingStayAvailability,
    STAYS_DISTANCE_LIMIT_KM,
    StaysFilters,
    StaysSortKey,
} from '../services/tripExploreSelectors';
import { HotelResult, TripExplorationResponse } from '../types/tripExploration';
import NightlyRateCaveat from './NightlyRateCaveat';

interface TripStaysTabProps {
    trip: TripExplorationResponse;
    /** Direct /api/hotels/nearby results — shown only when the backend's own
     *  hidden-gem pipeline had no city coordinates for this destination. */
    extraStays?: HotelResult[];
}

const RATING_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Any rating' },
    { value: 3, label: '3★+' },
    { value: 4, label: '4★+' },
    { value: 4.5, label: '4.5★+' },
];

const SORT_OPTIONS: Array<{ id: StaysSortKey; label: string }> = [
    { id: 'score', label: 'Best match' },
    { id: 'price', label: 'Cheapest first' },
    { id: 'distance', label: 'Closest to spot' },
];

// Discrete distance buckets replace the free-form slider. The limit value
// means "no cap" — mirrors filterAndSortStays' `maxDistanceKm < LIMIT` check.
const DISTANCE_OPTIONS: number[] = [1, 2, 3, 5, STAYS_DISTANCE_LIMIT_KM];

// Budget ladder — only the rungs below the live price ceiling are offered.
const BUDGET_RUNGS: number[] = [50, 80, 120, 200, 300];

const TripStaysTab: React.FC<TripStaysTabProps> = ({ trip, extraStays = [] }) => {
    const gems = useMemo(() => trip.hiddenGemHotels ?? [], [trip.hiddenGemHotels]);
    const priceCeiling = useMemo(() => getStaysPriceCeiling(gems), [gems]);

    const [filters, setFilters] = useState<StaysFilters>(DEFAULT_STAYS_FILTERS);
    const [sortKey, setSortKey] = useState<StaysSortKey>('score');

    const { visible, pendingRate, hiddenCount } = useMemo(
        () => filterAndSortStays(gems, filters, sortKey),
        [gems, filters, sortKey],
    );

    const displayedCount = visible.length + pendingRate.length;

    return (
        <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">Where to stay</p>
                    <h3 className="trip-explore-dashboard__card-title">Stays with a live nightly rate</h3>
                    <NightlyRateCaveat variant="block" />
                </div>
                {gems.length > 0 ? (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {displayedCount} of {gems.length} stays
                    </span>
                ) : extraStays.length > 0 ? (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {extraStays.length} direct results
                    </span>
                ) : (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                        No stays returned
                    </span>
                )}
            </div>

            {gems.length > 0 && (
                <div className="trip-explore-dashboard__filter-pills" aria-label="Stay filters">
                    {/* Compact dropdown pills replace the full-width sliders — same
                        state and filter logic, far less visual weight. */}
                    <label className="trip-explore-dashboard__pill">
                        <span className="trip-explore-dashboard__pill-label">Rating</span>
                        <select
                            className="trip-explore-dashboard__pill-select"
                            value={filters.minRating}
                            onChange={(event) => setFilters((prev) => ({
                                ...prev,
                                minRating: Number.parseFloat(event.target.value),
                            }))}
                            aria-label="Minimum rating"
                        >
                            {RATING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="trip-explore-dashboard__pill">
                        <span className="trip-explore-dashboard__pill-label">Distance maximum</span>
                        <select
                            className="trip-explore-dashboard__pill-select"
                            value={filters.maxDistanceKm}
                            onChange={(event) => setFilters((prev) => ({
                                ...prev,
                                maxDistanceKm: Number.parseFloat(event.target.value),
                            }))}
                            aria-label="Maximum distance to spot"
                        >
                            {DISTANCE_OPTIONS.map((km) => (
                                <option key={km} value={km}>
                                    {km >= STAYS_DISTANCE_LIMIT_KM ? 'No cap' : formatKm(km)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="trip-explore-dashboard__pill">
                        <span className="trip-explore-dashboard__pill-label">Budget per night</span>
                        <select
                            className="trip-explore-dashboard__pill-select"
                            value={filters.maxPricePerNight ?? priceCeiling}
                            onChange={(event) => {
                                const value = Number.parseInt(event.target.value, 10);
                                setFilters((prev) => ({
                                    ...prev,
                                    maxPricePerNight: value >= priceCeiling ? null : value,
                                }));
                            }}
                            aria-label="Maximum budget per night"
                        >
                            {BUDGET_RUNGS.filter((rung) => rung < priceCeiling).map((rung) => (
                                <option key={rung} value={rung}>{formatCurrency(rung)}</option>
                            ))}
                            <option value={priceCeiling}>No cap</option>
                        </select>
                    </label>

                    <label className="trip-explore-dashboard__pill">
                        <span className="trip-explore-dashboard__pill-label">Sort</span>
                        <select
                            className="trip-explore-dashboard__pill-select"
                            value={sortKey}
                            onChange={(event) => setSortKey(event.target.value as StaysSortKey)}
                            aria-label="Sort stays"
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            )}

            {hiddenCount > 0 && (
                <p className="trip-explore-dashboard__muted" role="status">
                    {hiddenCount} {hiddenCount === 1 ? 'stay is' : 'stays are'} hidden by the active filters.
                </p>
            )}

            {pendingRate.length > 0 && (
                <p className="trip-explore-dashboard__muted" role="status">
                    {pendingRate.length} {pendingRate.length === 1 ? 'stay has' : 'stays have'} no nightly rate yet.
                    They stay visible below so the budget filter never hides strong matches.
                </p>
            )}

            <div className="trip-explore-dashboard__stays-grid">
                {visible.map((gem, index) => {
                    const name = gem.hotel?.name ?? `Unnamed Hotel ${index + 1}`;
                    const price = getGemPrice(gem);
                    const rating = formatRating(getGemRating(gem));
                    const distance = formatKm(getGemDistanceKm(gem) ?? null);
                    const reviewsCount = gem.hotel?.reviewsCount;

                    return (
                        <div key={`${name}-${index}`} className="trip-explore-dashboard__hotel-card">
                            <div className="trip-explore-dashboard__hotel-main">
                                <div>
                                    <h4 className="trip-explore-dashboard__hotel-name">{name}</h4>
                                    {(rating || distance) && (
                                        <div className="trip-explore-dashboard__hotel-meta">
                                            {rating && (
                                                <span className="trip-explore-dashboard__hotel-rating">
                                                    {rating}
                                                    {reviewsCount != null ? ` (${reviewsCount})` : ''}
                                                </span>
                                            )}
                                            {distance && (
                                                <span className="trip-explore-dashboard__hotel-distance">{distance}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="trip-explore-dashboard__hotel-price">
                                    <span className="trip-explore-dashboard__price-caption">/night</span>
                                    <strong className="trip-explore-dashboard__hotel-price-value">
                                        {formatCurrency(price, getGemCurrency(gem))}
                                    </strong>
                                </div>
                            </div>
                            {gem.hotel?.reviewSummary && (
                                <p className="trip-explore-dashboard__muted">
                                    “{gem.hotel.reviewSummary}”
                                </p>
                            )}
                            {getStayQuoteSummary(gem.hotel) && (
                                <div className="trip-explore-dashboard__reason-pill">
                                    💶 {getStayQuoteSummary(gem.hotel)}
                                </div>
                            )}
                            {gem.selectionReason && (
                                <div className="trip-explore-dashboard__reason-pill">
                                    {gem.selectionReason}
                                </div>
                            )}
                            {gem.hotel?.bookingLink && (
                                <a
                                    className="trip-explore-dashboard__link"
                                    href={gem.hotel.bookingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Book{humanizeProviderLabel(gem.hotel.provider) ? ` via ${humanizeProviderLabel(gem.hotel.provider)}` : ''} ↗
                                </a>
                            )}
                        </div>
                    );
                })}
            </div>

            {pendingRate.length > 0 && (
                <div className="trip-explore-dashboard__hotel-stack" aria-label="Rate pending stays">
                    {pendingRate.map((gem, index) => {
                        const name = gem.hotel?.name ?? `Unnamed Hotel ${index + 1}`;
                        const rating = formatRating(getGemRating(gem));
                        const distance = formatKm(getGemDistanceKm(gem) ?? null);
                        const reviewsCount = gem.hotel?.reviewsCount;
                        const providerLabel = humanizeProviderLabel(gem.hotel?.provider);
                        const promoteAvailability = shouldPromotePendingStayAvailability(gem);

                        return (
                            <div key={`pending-${name}-${index}`} className="trip-explore-dashboard__hotel-card">
                                <div className="trip-explore-dashboard__hotel-main">
                                    <div>
                                        <h4 className="trip-explore-dashboard__hotel-name">{name}</h4>
                                        {(rating || distance) && (
                                            <div className="trip-explore-dashboard__hotel-meta">
                                                {rating && (
                                                    <span className="trip-explore-dashboard__hotel-rating">
                                                        {rating}
                                                        {reviewsCount != null ? ` (${reviewsCount})` : ''}
                                                    </span>
                                                )}
                                                {distance && (
                                                    <span className="trip-explore-dashboard__hotel-distance">{distance}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="trip-explore-dashboard__hotel-price">
                                        <span className="trip-explore-dashboard__price-caption">/night</span>
                                        {promoteAvailability ? (
                                            gem.hotel?.bookingLink ? (
                                                <a
                                                    className="trip-explore-dashboard__link trip-explore-dashboard__link--button"
                                                    href={gem.hotel.bookingLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    Check availability{providerLabel ? ` · ${providerLabel}` : ''} ↗
                                                </a>
                                            ) : (
                                                <span className="trip-explore-dashboard__link trip-explore-dashboard__link--button" role="status">
                                                    Check availability
                                                </span>
                                            )
                                        ) : (
                                            <strong className="trip-explore-dashboard__hotel-price-value trip-explore-dashboard__hotel-price-value--pending">
                                                Rate pending
                                            </strong>
                                        )}
                                    </div>
                                </div>
                                {gem.selectionReason && (
                                    <div className="trip-explore-dashboard__reason-pill">
                                        {gem.selectionReason}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {gems.length === 0 && extraStays.length > 0 && (
                <>
                    <p className="trip-explore-dashboard__muted" role="status">
                        Direct hotel search near {trip.destination ?? 'the destination'} — the backend has no
                        activity coordinates here, so hidden-gem scoring and distance-to-spot are unavailable.
                    </p>
                    <div className="trip-explore-dashboard__stays-grid">
                        {extraStays.map((hotel, index) => {
                            // OpenTripMap rows can carry empty-string names.
                            const name = hotel.name?.trim() || `Unnamed Hotel ${index + 1}`;
                            const price = hotel.pricePerNight != null && Number.isFinite(hotel.pricePerNight) && hotel.pricePerNight > 0
                                ? hotel.pricePerNight
                                : null;
                            const rating = formatRating(
                                typeof hotel.rating === 'number' && Number.isFinite(hotel.rating) ? hotel.rating : undefined,
                            );

                            return (
                                <div key={`${name}-${index}`} className="trip-explore-dashboard__hotel-card">
                                    <div className="trip-explore-dashboard__hotel-main">
                                        <div>
                                            <h4 className="trip-explore-dashboard__hotel-name">{name}</h4>
                                            {rating && (
                                                <div className="trip-explore-dashboard__hotel-meta">
                                                    <span className="trip-explore-dashboard__hotel-rating">
                                                        {rating}
                                                        {hotel.reviewsCount != null ? ` (${hotel.reviewsCount})` : ''}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="trip-explore-dashboard__hotel-price">
                                            <span className="trip-explore-dashboard__price-caption">/night</span>
                                            <strong
                                                className={
                                                    price == null
                                                        ? 'trip-explore-dashboard__hotel-price-value trip-explore-dashboard__hotel-price-value--pending'
                                                        : 'trip-explore-dashboard__hotel-price-value'
                                                }
                                            >
                                                {price == null ? 'Rate pending' : formatCurrency(price, hotel.priceCurrency ?? 'EUR')}
                                            </strong>
                                        </div>
                                    </div>
                                    {hotel.reviewSummary && (
                                        <p className="trip-explore-dashboard__muted">
                                            “{hotel.reviewSummary}”
                                        </p>
                                    )}
                                    {getStayQuoteSummary(hotel) && (
                                        <div className="trip-explore-dashboard__reason-pill">
                                            💶 {getStayQuoteSummary(hotel)}
                                        </div>
                                    )}
                                    {hotel.bookingLink && (
                                        <a
                                            className="trip-explore-dashboard__link"
                                            href={hotel.bookingLink}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Book{humanizeProviderLabel(hotel.provider) ? ` via ${humanizeProviderLabel(hotel.provider)}` : ''} ↗
                                        </a>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </article>
    );
};

export default TripStaysTab;
