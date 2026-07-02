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
    getStaysPriceCeiling,
    STAYS_DISTANCE_LIMIT_KM,
    StaysFilters,
    StaysSortKey,
} from '../services/tripExploreSelectors';
import { TripExplorationResponse } from '../types/tripExploration';

interface TripStaysTabProps {
    trip: TripExplorationResponse;
}

const RATING_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Any rating' },
    { value: 3, label: '3★+' },
    { value: 4, label: '4★+' },
    { value: 4.5, label: '4.5★+' },
];

const SORT_OPTIONS: Array<{ id: StaysSortKey; label: string }> = [
    { id: 'score', label: 'Best score (Plan de Ouf mix)' },
    { id: 'price', label: 'Cheapest price' },
    { id: 'distance', label: 'Closest to ride spot' },
];

const TripStaysTab: React.FC<TripStaysTabProps> = ({ trip }) => {
    const gems = useMemo(() => trip.hiddenGemHotels ?? [], [trip.hiddenGemHotels]);
    const priceCeiling = useMemo(() => getStaysPriceCeiling(gems), [gems]);

    const [filters, setFilters] = useState<StaysFilters>(DEFAULT_STAYS_FILTERS);
    const [sortKey, setSortKey] = useState<StaysSortKey>('score');

    const { visible, hiddenCount } = useMemo(
        () => filterAndSortStays(gems, filters, sortKey),
        [gems, filters, sortKey],
    );

    return (
        <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">Plan de ouf</p>
                    <h3 className="trip-explore-dashboard__card-title">Hidden gems — all verified stays</h3>
                </div>
                {gems.length > 0 ? (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {visible.length} of {gems.length} stays
                    </span>
                ) : (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                        No stays returned
                    </span>
                )}
            </div>

            {gems.length > 0 && (
                <div className="trip-explore-dashboard__filters" aria-label="Stay filters">
                    <div className="trip-explore-dashboard__filter-group">
                        <span className="trip-explore-dashboard__meta-label">Minimum rating</span>
                        <div className="trip-explore-dashboard__chip-row" role="group" aria-label="Minimum rating">
                            {RATING_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFilters((prev) => ({ ...prev, minRating: option.value }))}
                                    className={
                                        filters.minRating === option.value
                                            ? 'trip-explore-dashboard__chip trip-explore-dashboard__chip--active'
                                            : 'trip-explore-dashboard__chip'
                                    }
                                    aria-pressed={filters.minRating === option.value}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="trip-explore-dashboard__filter-group">
                        <label className="trip-explore-dashboard__range-field">
                            <span className="trip-explore-dashboard__meta-label">
                                Max distance to spot ·{' '}
                                {filters.maxDistanceKm >= STAYS_DISTANCE_LIMIT_KM
                                    ? 'no cap'
                                    : formatKm(filters.maxDistanceKm)}
                            </span>
                            <input
                                type="range"
                                min={0.5}
                                max={STAYS_DISTANCE_LIMIT_KM}
                                step={0.5}
                                value={filters.maxDistanceKm}
                                onChange={(event) => setFilters((prev) => ({
                                    ...prev,
                                    maxDistanceKm: Number.parseFloat(event.target.value),
                                }))}
                                aria-label="Maximum distance to ride spot in kilometres"
                            />
                        </label>
                    </div>

                    <div className="trip-explore-dashboard__filter-group">
                        <label className="trip-explore-dashboard__range-field">
                            <span className="trip-explore-dashboard__meta-label">
                                Budget per night ·{' '}
                                {filters.maxPricePerNight == null
                                    ? 'no cap'
                                    : formatCurrency(filters.maxPricePerNight)}
                            </span>
                            <input
                                type="range"
                                min={10}
                                max={priceCeiling}
                                step={5}
                                value={filters.maxPricePerNight ?? priceCeiling}
                                onChange={(event) => {
                                    const value = Number.parseInt(event.target.value, 10);
                                    setFilters((prev) => ({
                                        ...prev,
                                        maxPricePerNight: value >= priceCeiling ? null : value,
                                    }));
                                }}
                                aria-label="Maximum budget per night"
                            />
                        </label>
                    </div>

                    <div className="trip-explore-dashboard__filter-group">
                        <span className="trip-explore-dashboard__meta-label">Sort by</span>
                        <div className="trip-explore-dashboard__chip-row" role="group" aria-label="Sort stays">
                            {SORT_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setSortKey(option.id)}
                                    className={
                                        sortKey === option.id
                                            ? 'trip-explore-dashboard__chip trip-explore-dashboard__chip--active'
                                            : 'trip-explore-dashboard__chip'
                                    }
                                    aria-pressed={sortKey === option.id}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {hiddenCount > 0 && (
                <p className="trip-explore-dashboard__muted" role="status">
                    {hiddenCount} {hiddenCount === 1 ? 'stay is' : 'stays are'} hidden by the active filters.
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
                                    <strong
                                        className={
                                            price == null
                                                ? 'trip-explore-dashboard__hotel-price-value trip-explore-dashboard__hotel-price-value--pending'
                                                : 'trip-explore-dashboard__hotel-price-value'
                                        }
                                    >
                                        {price == null ? 'Rate pending' : formatCurrency(price, getGemCurrency(gem))}
                                    </strong>
                                </div>
                            </div>
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
                                    Book{gem.hotel.provider ? ` via ${gem.hotel.provider}` : ''} ↗
                                </a>
                            )}
                        </div>
                    );
                })}
            </div>
        </article>
    );
};

export default TripStaysTab;
