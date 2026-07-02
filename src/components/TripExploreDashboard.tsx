import React from 'react';
import { getAntiCauchemarPricingSummary } from '../services/antiCauchemarPricing';
import { ExploreWarning, HiddenGemHotel, TripExplorationResponse } from '../types/tripExploration';
import './TripExploreDashboard.css';

// Wire contract lives in src/types/tripExploration.ts (mirrors the Spring
// DTOs field-for-field). Re-exported here so existing imports keep working.
export type {
    AccommodationTradeoff,
    ActivityPlace,
    ExploreWarning,
    HiddenGemHotel,
    HotelDetails,
    HotelResult,
    TripExplorationResponse,
    TripExplorePayload,
    UnifiedFlight,
    UnifiedFlightOption,
} from '../types/tripExploration';

export interface TripExploreDashboardProps {
    tripData: TripExplorationResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers — all null-safe; they render nothing rather than a fake
// value when the backend did not supply the data.
// ─────────────────────────────────────────────────────────────────────────────

const formatCurrency = (value: number | null | undefined, currency = 'EUR'): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }

    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${Math.round(value)} ${currency}`;
    }
};

// Backend primitives (double) serialize as 0 when never set — treat 0 as
// "unknown" rather than pretending a €0 fare exists.
const asPositiveAmount = (value: number | null | undefined): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
);

// The backend's own selectionReason prose ("...0.1 km away...") often carries
// the precise distance even when the structured distanceToActivityKm field is
// missing/stale. We surface that real number instead of rounding to a lying "0 km".
const extractDistanceFromReason = (reason?: string | null): number | null => {
    if (!reason) {
        return null;
    }

    const match = reason.match(/(\d+(?:\.\d+)?)\s*km/i);
    if (!match) {
        return null;
    }

    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (value?: string | null): string => {
    if (!value) {
        return 'TBD';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(date);
};

const formatDateTime = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};

// ─────────────────────────────────────────────────────────────────────────────
// Field accessors — single source of truth for reading the wire contract
// ─────────────────────────────────────────────────────────────────────────────

const getHotelName = (gem?: HiddenGemHotel | null, fallbackIndex = 0): string => (
    gem?.hotel?.name ?? `Unnamed Hotel ${fallbackIndex + 1}`
);

const getHotelPrice = (gem?: HiddenGemHotel | null): number | undefined => (
    asPositiveAmount(gem?.hotel?.pricePerNight)
);

const getHotelCurrency = (gem?: HiddenGemHotel | null): string => (
    gem?.hotel?.priceCurrency ?? 'EUR'
);

const getHotelRating = (gem?: HiddenGemHotel | null): string | null => {
    const rating = gem?.hotel?.rating;
    if (typeof rating === 'number' && Number.isFinite(rating)) {
        return `${rating.toFixed(rating % 1 === 0 ? 0 : 1)}★`;
    }

    return null;
};

const getHotelDistance = (gem?: HiddenGemHotel | null): string | null => {
    // distanceToActivityKm is a composite-score field on the wrapper object
    // (sibling of `hotel`), not nested inside the hotel details themselves.
    const distance = gem?.distanceToActivityKm;

    if (typeof distance === 'number' && Number.isFinite(distance)) {
        // Force one decimal place so "0.1 km" never gets rounded down to a
        // misleading flat "0 km" — must match what selectionReason states.
        return `${distance.toFixed(1)} km`;
    }

    // Structured field missing entirely: fall back to the real number already
    // present in the backend's own selectionReason text, never a fake default.
    const reasonDistance = extractDistanceFromReason(gem?.selectionReason);
    if (reasonDistance != null) {
        return `${reasonDistance.toFixed(1)} km`;
    }

    return null;
};

const getWarningText = (warning: ExploreWarning | string): string => {
    if (typeof warning === 'string') {
        return warning;
    }

    const text = warning.message ?? warning.kind ?? 'Service warning';
    const prefixed = warning.source ? `${warning.source}: ${text}` : text;
    return warning.fallbackUsed ? `${prefixed} (fallback data)` : prefixed;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component — a read-only projection of TripExplorationResponse. It never
// mutates or re-shapes tripData; the full nested payload stays intact in the
// owner's state (persisted app-wide via CacheProvider) for other tabs.
// ─────────────────────────────────────────────────────────────────────────────

const TripExploreDashboard: React.FC<TripExploreDashboardProps> = ({ tripData }) => {
    const destination = tripData.destination ?? 'Your next drop';
    const travelDate = tripData.travelDate;
    const flight = tripData.bestUnifiedFlight;
    const hotels = tripData.hiddenGemHotels ?? [];
    const rawWarnings = tripData.orchestrationWarnings ?? [];
    const warnings = rawWarnings.map((warning) => getWarningText(warning));

    const status = (tripData.orchestrationStatus ?? 'OK').toUpperCase();
    const isDegraded = status !== 'OK';

    const truth = flight?.antiCauchemar;
    // Honest price hierarchy: base fare headline → audited/recomputed honest
    // total secondary → door-to-trip additive tertiary (never a replacement).
    const pricing = getAntiCauchemarPricingSummary(asPositiveAmount(flight?.ticketPrice), truth);
    const baseFare = pricing.ticketPrice ?? pricing.baseFare;
    const honestTotal = pricing.estimatedEntryPrice ?? asPositiveAmount(flight?.realWorldEntryPrice);
    const doorToTripPrice = asPositiveAmount(flight?.doorToTripPrice) ?? pricing.doorToTripPrice;
    const currency = pricing.currency;
    const showHonestTotal = honestTotal != null && (baseFare == null || Math.abs(honestTotal - baseFare) >= 1);

    const hasLogisticsCatch = Boolean(
        truth?.theCatch
        || pricing.hasManualCheckRequired
        || asPositiveAmount(truth?.hiddenCostPenalty) != null,
    );

    // Backend-provided labels only — never invented on the frontend.
    const priceProvenance = flight?.priceLabel ?? flight?.freshnessLabel ?? null;
    const routeLabel = flight?.departureAirport && flight?.arrivalAirport
        ? `${flight.departureAirport} → ${flight.arrivalAirport}`
        : null;
    const arrivalLabel = formatDateTime(flight?.scheduledArrival);
    const transferMinutes = asPositiveAmount(truth?.transferToCenterMinutes);
    const airportReality = pricing.hasManualCheckRequired
        ? '⚠ Manual check required'
        : truth?.logisticVerdict ?? (transferMinutes != null ? `~${Math.round(transferMinutes)} min to center` : null);
    const catchMessage = truth?.theCatch
        ?? flight?.priceDisclaimer
        ?? (truth?.manualCheckReasons?.length ? truth.manualCheckReasons.join(' · ') : null);
    const noFlightReason = tripData.resolutionReason
        ?? tripData.routeSelectionSummary
        ?? 'No flight data was returned for this route.';

    return (
        <section className="trip-explore-dashboard" aria-label="Trip explore dashboard">
            <header className="trip-explore-dashboard__header">
                <div>
                    <p className="trip-explore-dashboard__eyebrow">Adrenaline weekend</p>
                    <h2 className="trip-explore-dashboard__title">{destination}</h2>
                    <p className="trip-explore-dashboard__subtitle">
                        {travelDate ? `Main move • ${formatDate(travelDate)}` : 'Main move • ready to lock'}
                        {tripData.resolvedArrivalAirport ? ` • via ${tripData.resolvedArrivalAirport}` : ''}
                    </p>
                </div>
                <div className="trip-explore-dashboard__status-pill">
                    <span className="trip-explore-dashboard__status-dot" />
                    {status}
                </div>
            </header>

            {(isDegraded || warnings.length > 0) && (
                <div className="trip-explore-dashboard__warning-banner" role="status">
                    <strong>Orchestration status: {status}.</strong>
                    <div className="trip-explore-dashboard__warning-list">
                        {warnings.map((warning, index) => (
                            <span key={`${warning}-${index}`} className="trip-explore-dashboard__tiny-pill">
                                {warning}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="trip-explore-dashboard__grid">
                <div className="trip-explore-dashboard__column">
                    <article className="trip-explore-dashboard__card trip-explore-dashboard__card--flight">
                        <div className="trip-explore-dashboard__card-top">
                            <div>
                                <p className="trip-explore-dashboard__label">Journey</p>
                                <h3 className="trip-explore-dashboard__card-title">Flight & transit</h3>
                            </div>
                            {hasLogisticsCatch && (
                                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                                    Logistics Catch
                                </span>
                            )}
                        </div>

                        {flight ? (
                            <>
                                <div className="trip-explore-dashboard__flight-hero">
                                    <div>
                                        {(flight.airline || flight.sourceLabel) && (
                                            <p className="trip-explore-dashboard__flight-airline">
                                                {[flight.airline, flight.sourceLabel].filter(Boolean).join(' · ')}
                                            </p>
                                        )}
                                        {(flight.flightNumber ?? routeLabel) && (
                                            <p className="trip-explore-dashboard__flight-number">
                                                {flight.flightNumber ?? routeLabel}
                                            </p>
                                        )}
                                    </div>
                                    <div className="trip-explore-dashboard__price-stack">
                                        <span className="trip-explore-dashboard__price-caption">Base fare</span>
                                        <strong
                                            className={
                                                baseFare == null
                                                    ? 'trip-explore-dashboard__price trip-explore-dashboard__price--pending'
                                                    : 'trip-explore-dashboard__price'
                                            }
                                        >
                                            {baseFare == null ? 'Rate pending' : formatCurrency(baseFare, currency)}
                                        </strong>
                                        {showHonestTotal && (
                                            <span className="trip-explore-dashboard__price-secondary">
                                                Honest total · {formatCurrency(honestTotal, currency)}
                                            </span>
                                        )}
                                        {doorToTripPrice != null && (
                                            <span className="trip-explore-dashboard__price-secondary">
                                                Door-to-trip · {formatCurrency(doorToTripPrice, currency)}
                                            </span>
                                        )}
                                        {priceProvenance && (
                                            <span className="trip-explore-dashboard__price-caption">
                                                {priceProvenance}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {(arrivalLabel || airportReality) && (
                                    <div className="trip-explore-dashboard__meta-row">
                                        {arrivalLabel && (
                                            <div>
                                                <span className="trip-explore-dashboard__meta-label">Arrival</span>
                                                <strong>{arrivalLabel}</strong>
                                            </div>
                                        )}
                                        {airportReality && (
                                            <div>
                                                <span className="trip-explore-dashboard__meta-label">Airport reality</span>
                                                <strong>{airportReality}</strong>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {hasLogisticsCatch && catchMessage && (
                                    <div className="trip-explore-dashboard__alert-block">
                                        <span className="trip-explore-dashboard__alert-label">Anti-Cauchemar</span>
                                        <p>{catchMessage}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="trip-explore-dashboard__alert-block">
                                <span className="trip-explore-dashboard__alert-label">No flight, no trip</span>
                                <p>{noFlightReason}</p>
                            </div>
                        )}
                    </article>
                </div>

                <div className="trip-explore-dashboard__column">
                    <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels">
                        <div className="trip-explore-dashboard__card-top">
                            <div>
                                <p className="trip-explore-dashboard__label">Plan de ouf</p>
                                <h3 className="trip-explore-dashboard__card-title">Hidden gems shortlist</h3>
                            </div>
                            {hotels.length > 0 ? (
                                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                                    Top {hotels.length}
                                </span>
                            ) : (
                                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                                    No stays returned
                                </span>
                            )}
                        </div>

                        <div className="trip-explore-dashboard__hotel-stack">
                            {hotels.map((gem, index) => {
                                const hotelName = getHotelName(gem, index);
                                const price = getHotelPrice(gem);
                                const hotelCurrency = getHotelCurrency(gem);
                                const rating = getHotelRating(gem);
                                const distance = getHotelDistance(gem);
                                const reason = gem?.selectionReason;

                                return (
                                    <div key={`${hotelName}-${index}`} className="trip-explore-dashboard__hotel-card">
                                        <div className="trip-explore-dashboard__hotel-main">
                                            <div>
                                                <h4 className="trip-explore-dashboard__hotel-name">{hotelName}</h4>
                                                {(rating || distance) && (
                                                    <div className="trip-explore-dashboard__hotel-meta">
                                                        {rating && (
                                                            <span className="trip-explore-dashboard__hotel-rating">{rating}</span>
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
                                                    {price == null ? 'Rate pending' : formatCurrency(price, hotelCurrency)}
                                                </strong>
                                            </div>
                                        </div>
                                        {reason && (
                                            <div className="trip-explore-dashboard__reason-pill">
                                                {reason}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
};

export default TripExploreDashboard;
