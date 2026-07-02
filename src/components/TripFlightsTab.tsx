import React, { useMemo, useState } from 'react';
import {
    applyFlightViewMode,
    formatCurrency,
    FlightViewMode,
    getFlightRows,
    getProviderBadges,
} from '../services/tripExploreSelectors';
import { TripExplorationResponse } from '../types/tripExploration';

interface TripFlightsTabProps {
    trip: TripExplorationResponse;
}

const VIEW_MODES: Array<{ id: FlightViewMode; label: string }> = [
    { id: 'all', label: 'All routes' },
    { id: 'cheapest', label: 'Cheapest first' },
    { id: 'approved', label: 'Anti-Cauchemar approved' },
];

const TripFlightsTab: React.FC<TripFlightsTabProps> = ({ trip }) => {
    const [viewMode, setViewMode] = useState<FlightViewMode>('all');

    const allRows = useMemo(() => getFlightRows(trip), [trip]);
    const rows = useMemo(() => applyFlightViewMode(allRows, viewMode), [allRows, viewMode]);
    const providerBadges = getProviderBadges(trip);
    const comparisonSummary = trip.bestSameFlightComparison?.comparisonSummary ?? null;

    return (
        <article className="trip-explore-dashboard__card">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">Deep logistics</p>
                    <h3 className="trip-explore-dashboard__card-title">Flights & transit breakdowns</h3>
                </div>
                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                    {rows.length} of {allRows.length} routes
                </span>
            </div>

            {providerBadges.length > 0 && (
                <div className="trip-explore-dashboard__warning-list" aria-label="Providers">
                    {providerBadges.map((badge) => (
                        <span key={badge} className="trip-explore-dashboard__tiny-pill">{badge}</span>
                    ))}
                </div>
            )}

            <div className="trip-explore-dashboard__chip-row" role="group" aria-label="Flight view mode">
                {VIEW_MODES.map((mode) => (
                    <button
                        key={mode.id}
                        type="button"
                        onClick={() => setViewMode(mode.id)}
                        className={
                            viewMode === mode.id
                                ? 'trip-explore-dashboard__chip trip-explore-dashboard__chip--active'
                                : 'trip-explore-dashboard__chip'
                        }
                        aria-pressed={viewMode === mode.id}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>

            {comparisonSummary && (
                <p className="trip-explore-dashboard__muted">{comparisonSummary}</p>
            )}

            <div className="trip-explore-dashboard__flight-list">
                {rows.length === 0 && (
                    <p className="trip-explore-dashboard__muted">
                        {allRows.length === 0
                            ? 'The backend returned no flight options for this route.'
                            : 'No routes pass the Anti-Cauchemar filter — every option has a catch.'}
                    </p>
                )}

                {rows.map((row) => (
                    <div key={row.key} className="trip-explore-dashboard__flight-row">
                        <div className="trip-explore-dashboard__flight-row-main">
                            <div>
                                {(row.airline || row.providerLabel) && (
                                    <p className="trip-explore-dashboard__flight-airline">
                                        {[row.airline, row.providerLabel].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                                {(row.flightNumber ?? row.routeLabel) && (
                                    <p className="trip-explore-dashboard__flight-row-title">
                                        {[row.flightNumber, row.routeLabel].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                                {(row.departureLabel || row.arrivalLabel) && (
                                    <p className="trip-explore-dashboard__muted">
                                        {[row.departureLabel, row.arrivalLabel].filter(Boolean).join(' → ')}
                                    </p>
                                )}
                                {row.transitSummary && (
                                    <p className="trip-explore-dashboard__muted">{row.transitSummary}</p>
                                )}
                            </div>
                            <div className="trip-explore-dashboard__price-stack">
                                <strong
                                    className={
                                        row.baseFare == null
                                            ? 'trip-explore-dashboard__hotel-price-value trip-explore-dashboard__hotel-price-value--pending'
                                            : 'trip-explore-dashboard__hotel-price-value'
                                    }
                                >
                                    {row.baseFare == null ? 'Rate pending' : formatCurrency(row.baseFare, row.currency)}
                                </strong>
                                {row.honestTotal != null && (row.baseFare == null || Math.abs(row.honestTotal - row.baseFare) >= 1) && (
                                    <span className="trip-explore-dashboard__price-secondary">
                                        Honest total · {formatCurrency(row.honestTotal, row.currency)}
                                    </span>
                                )}
                                {row.doorToTripPrice != null && (
                                    <span className="trip-explore-dashboard__price-secondary">
                                        Door-to-trip · {formatCurrency(row.doorToTripPrice, row.currency)}
                                    </span>
                                )}
                                {row.provenance && (
                                    <span className="trip-explore-dashboard__price-caption">{row.provenance}</span>
                                )}
                                {row.approved ? (
                                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                                        Anti-Cauchemar ✓
                                    </span>
                                ) : row.catchMessage != null && (
                                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                                        Catch
                                    </span>
                                )}
                            </div>
                        </div>
                        {row.catchMessage && (
                            <p className="trip-explore-dashboard__flight-catch">{row.catchMessage}</p>
                        )}
                    </div>
                ))}
            </div>
        </article>
    );
};

export default TripFlightsTab;
