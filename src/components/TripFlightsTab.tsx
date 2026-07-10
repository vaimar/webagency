import React, { useMemo, useState } from 'react';
import {
    asPositiveAmount,
    formatCurrency,
    FlightViewMode,
    getFlightRows,
    getFlightViewSelection,
    getProviderBadges,
    getSameFlightQuotes,
    humanizeProviderLabel,
} from '../services/tripExploreSelectors';
import { TripExplorationResponse, UnifiedFlightOption } from '../types/tripExploration';
import BookingLinks from './BookingLinks';

interface SelectedFlightLike {
    key: string;
    option: UnifiedFlightOption;
}

interface TripFlightsTabProps {
    trip: TripExplorationResponse;
    selectedFlightKey: string | null;
    onSelectFlight: (selection: SelectedFlightLike | null) => void;
}

const VIEW_MODES: Array<{ id: FlightViewMode; label: string }> = [
    { id: 'all', label: 'All routes' },
    { id: 'cheapest', label: 'Cheapest first' },
    { id: 'approved', label: 'Anti-Cauchemar approved' },
];

const TripFlightsTab: React.FC<TripFlightsTabProps> = ({ trip, selectedFlightKey, onSelectFlight }) => {
    const [viewMode, setViewMode] = useState<FlightViewMode>('all');

    const allRows = useMemo(() => getFlightRows(trip), [trip]);
    const flightView = useMemo(() => getFlightViewSelection(allRows, viewMode), [allRows, viewMode]);
    const rows = flightView.rows;
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

            {flightView.fallbackUsed && flightView.warningMessage && (
                <div className="trip-explore-dashboard__warning-banner" role="status">
                    <strong>{flightView.warningMessage}</strong>
                </div>
            )}

            <div className="trip-explore-dashboard__flight-list">
                {rows.length === 0 && (
                    <p className="trip-explore-dashboard__muted">
                        {allRows.length === 0
                            ? 'The backend returned no flight options for this route.'
                            : 'No routes pass the Anti-Cauchemar filter — every option has a catch.'}
                    </p>
                )}

                {rows.map((row) => {
                    const isSelected = row.key === selectedFlightKey;
                    const quotes = getSameFlightQuotes(trip, row);

                    return (
                        <div
                            key={row.key}
                            className={
                                isSelected
                                    ? 'trip-explore-dashboard__flight-row trip-explore-dashboard__flight-row--selected'
                                    : 'trip-explore-dashboard__flight-row'
                            }
                        >
                            <div className="trip-explore-dashboard__flight-row-main">
                                <div>
                                    {row.airline && (
                                        <p className="trip-explore-dashboard__flight-airline">
                                            {row.airline}
                                        </p>
                                    )}
                                    {(row.flightNumber ?? row.routeLabel) && (
                                        <p className="trip-explore-dashboard__flight-row-title">
                                            {[row.flightNumber, row.routeLabel].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                    {row.providerLabel && (
                                        <p className="trip-explore-dashboard__flight-provider">
                                            {row.providerLabel}
                                        </p>
                                    )}
                                    {(row.departureLabel || row.arrivalLabel) && (
                                        <p className="trip-explore-dashboard__muted">
                                            {[row.departureLabel, row.arrivalLabel].filter(Boolean).join(' → ')}
                                        </p>
                                    )}
                                    <p className="trip-explore-dashboard__flight-stops">
                                        {row.connectionSummary ? (
                                            <span className="trip-explore-dashboard__stops-badge">🔁 {row.connectionSummary}</span>
                                        ) : (
                                            <span className="trip-explore-dashboard__stops-badge trip-explore-dashboard__stops-badge--direct">Direct</span>
                                        )}
                                        {row.totalDurationLabel && (
                                            <span className="trip-explore-dashboard__muted"> · {row.totalDurationLabel} total</span>
                                        )}
                                    </p>
                                    {row.transitSummary && (
                                        <p className="trip-explore-dashboard__muted">{row.transitSummary}</p>
                                    )}
                                </div>
                                <div className="trip-explore-dashboard__price-stack">
                                    {row.flyDrive && (
                                        <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                                            Fly-Drive Alternative
                                        </span>
                                    )}
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
                                    <button
                                        type="button"
                                        className={
                                            isSelected
                                                ? 'trip-explore-dashboard__chip trip-explore-dashboard__chip--active'
                                                : 'trip-explore-dashboard__chip'
                                        }
                                        aria-pressed={isSelected}
                                        onClick={() => onSelectFlight(
                                            isSelected ? null : { key: row.key, option: row.option },
                                        )}
                                    >
                                        {isSelected ? 'Selected ✓' : 'Select flight'}
                                    </button>
                                </div>
                            </div>

                            {row.originAccessNote && (
                                <div className="trip-explore-dashboard__reason-pill">
                                    {row.originAccessNote}
                                </div>
                            )}

                            {quotes.length > 0 && (
                                <div className="trip-explore-dashboard__warning-list" aria-label="Same flight quotes">
                                    <span className="trip-explore-dashboard__meta-label">
                                        Same flight · {quotes.length} quotes
                                    </span>
                                    {quotes.map((quote, quoteIndex) => (
                                        <span key={`${row.key}-quote-${quoteIndex}`} className="trip-explore-dashboard__tiny-pill">
                                            {[
                                                humanizeProviderLabel(quote.sourceLabel ?? quote.source),
                                                asPositiveAmount(quote.ticketPrice) != null
                                                    ? formatCurrency(quote.ticketPrice, quote.antiCauchemar?.currency ?? 'EUR')
                                                    : null,
                                                quote.priceLabel,
                                            ].filter(Boolean).join(' · ')}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {row.catchMessage && (
                                <p className="trip-explore-dashboard__flight-catch">{row.catchMessage}</p>
                            )}

                            <BookingLinks
                                origin={row.option.departureAirport}
                                destination={row.option.arrivalAirport}
                                date={trip.travelDate}
                            />
                        </div>
                    );
                })}
            </div>
        </article>
    );
};

export default TripFlightsTab;
