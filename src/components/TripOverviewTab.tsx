import React from 'react';
import {
    asPositiveAmount,
    formatCurrency,
    formatDateTime,
    formatKm,
    formatMinutes,
    formatRating,
    getFlightPricing,
    getGemCurrency,
    getGemDistanceKm,
    getGemPrice,
    getGemRating,
} from '../services/tripExploreSelectors';
import { TripExplorationResponse } from '../types/tripExploration';

interface TripOverviewTabProps {
    trip: TripExplorationResponse;
}

interface TimelineItem {
    label: string;
    value: string;
}

const buildTimeline = (trip: TripExplorationResponse): TimelineItem[] => {
    const flight = trip.bestUnifiedFlight;
    const truth = flight?.antiCauchemar;
    const departure = formatDateTime(flight?.scheduledDeparture);
    const arrival = formatDateTime(flight?.scheduledArrival);
    const transfer = formatMinutes(truth?.transferToCenterMinutes);
    const activity = trip.primaryActivity;

    const items: Array<TimelineItem | null> = [
        departure
            ? { label: 'Departure', value: [flight?.departureAirport, departure].filter(Boolean).join(' · ') }
            : null,
        arrival
            ? { label: 'Arrival', value: [flight?.arrivalAirport ?? trip.resolvedArrivalAirport, arrival].filter(Boolean).join(' · ') }
            : null,
        transfer
            ? { label: 'Airport → center', value: `~${transfer}` }
            : null,
        activity?.name
            ? { label: 'Ride spot', value: [activity.name, formatKm(activity.distanceKm ?? null)].filter(Boolean).join(' · ') }
            : null,
    ];

    return items.filter((item): item is TimelineItem => item != null);
};

const TripOverviewTab: React.FC<TripOverviewTabProps> = ({ trip }) => {
    const flight = trip.bestUnifiedFlight;
    const truth = flight?.antiCauchemar;
    const pricing = getFlightPricing(flight);
    const showHonestTotal = pricing.honestTotal != null
        && (pricing.baseFare == null || Math.abs(pricing.honestTotal - pricing.baseFare) >= 1);

    const hasLogisticsCatch = Boolean(
        truth?.theCatch
        || pricing.manualCheckRequired
        || asPositiveAmount(truth?.hiddenCostPenalty) != null,
    );
    const catchMessage = truth?.theCatch
        ?? flight?.priceDisclaimer
        ?? (truth?.manualCheckReasons?.length ? truth.manualCheckReasons.join(' · ') : null);
    const routeLabel = flight?.departureAirport && flight?.arrivalAirport
        ? `${flight.departureAirport} → ${flight.arrivalAirport}`
        : null;
    const transferMinutes = asPositiveAmount(truth?.transferToCenterMinutes);
    const airportReality = pricing.manualCheckRequired
        ? '⚠ Manual check required'
        : truth?.logisticVerdict ?? (transferMinutes != null ? `~${Math.round(transferMinutes)} min to center` : null);
    const arrivalLabel = formatDateTime(flight?.scheduledArrival);
    const noFlightReason = trip.resolutionReason
        ?? trip.routeSelectionSummary
        ?? 'No flight data was returned for this route.';

    // Backend pre-sorts hiddenGemHotels by composite score (best first).
    const bestGem = trip.hiddenGemHotels?.[0];
    const bestGemPrice = getGemPrice(bestGem);
    const bestGemRating = formatRating(getGemRating(bestGem));
    const bestGemDistance = formatKm(getGemDistanceKm(bestGem) ?? null);
    const timeline = buildTimeline(trip);

    return (
        <div className="trip-explore-dashboard__grid">
            <div className="trip-explore-dashboard__column">
                <article className="trip-explore-dashboard__card trip-explore-dashboard__card--flight">
                    <div className="trip-explore-dashboard__card-top">
                        <div>
                            <p className="trip-explore-dashboard__label">Journey</p>
                            <h3 className="trip-explore-dashboard__card-title">Top match flight</h3>
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
                                            pricing.baseFare == null
                                                ? 'trip-explore-dashboard__price trip-explore-dashboard__price--pending'
                                                : 'trip-explore-dashboard__price'
                                        }
                                    >
                                        {pricing.baseFare == null
                                            ? 'Rate pending'
                                            : formatCurrency(pricing.baseFare, pricing.currency)}
                                    </strong>
                                    {showHonestTotal && (
                                        <span className="trip-explore-dashboard__price-secondary">
                                            Honest total · {formatCurrency(pricing.honestTotal, pricing.currency)}
                                        </span>
                                    )}
                                    {pricing.doorToTripPrice != null && (
                                        <span className="trip-explore-dashboard__price-secondary">
                                            Door-to-trip · {formatCurrency(pricing.doorToTripPrice, pricing.currency)}
                                        </span>
                                    )}
                                    {pricing.provenance && (
                                        <span className="trip-explore-dashboard__price-caption">
                                            {pricing.provenance}
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

                    {timeline.length > 0 && (
                        <div className="trip-explore-dashboard__timeline" aria-label="Route timeline">
                            {timeline.map((item) => (
                                <div key={item.label} className="trip-explore-dashboard__timeline-item">
                                    <span className="trip-explore-dashboard__timeline-dot" />
                                    <div>
                                        <span className="trip-explore-dashboard__meta-label">{item.label}</span>
                                        <strong>{item.value}</strong>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </div>

            <div className="trip-explore-dashboard__column">
                <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels">
                    <div className="trip-explore-dashboard__card-top">
                        <div>
                            <p className="trip-explore-dashboard__label">Plan de ouf</p>
                            <h3 className="trip-explore-dashboard__card-title">Best stay match</h3>
                        </div>
                        {!bestGem && (
                            <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                                No stays returned
                            </span>
                        )}
                    </div>

                    {bestGem && (
                        <div className="trip-explore-dashboard__hotel-card">
                            <div className="trip-explore-dashboard__hotel-main">
                                <div>
                                    <h4 className="trip-explore-dashboard__hotel-name">
                                        {bestGem.hotel?.name ?? 'Unnamed Hotel 1'}
                                    </h4>
                                    {(bestGemRating || bestGemDistance) && (
                                        <div className="trip-explore-dashboard__hotel-meta">
                                            {bestGemRating && (
                                                <span className="trip-explore-dashboard__hotel-rating">{bestGemRating}</span>
                                            )}
                                            {bestGemDistance && (
                                                <span className="trip-explore-dashboard__hotel-distance">{bestGemDistance}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="trip-explore-dashboard__hotel-price">
                                    <span className="trip-explore-dashboard__price-caption">/night</span>
                                    <strong
                                        className={
                                            bestGemPrice == null
                                                ? 'trip-explore-dashboard__hotel-price-value trip-explore-dashboard__hotel-price-value--pending'
                                                : 'trip-explore-dashboard__hotel-price-value'
                                        }
                                    >
                                        {bestGemPrice == null
                                            ? 'Rate pending'
                                            : formatCurrency(bestGemPrice, getGemCurrency(bestGem))}
                                    </strong>
                                </div>
                            </div>
                            {bestGem.selectionReason && (
                                <div className="trip-explore-dashboard__reason-pill">
                                    {bestGem.selectionReason}
                                </div>
                            )}
                        </div>
                    )}
                </article>
            </div>
        </div>
    );
};

export default TripOverviewTab;
