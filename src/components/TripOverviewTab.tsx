import React from 'react';
import {
    asPositiveAmount,
    formatCurrency,
    formatDateTime,
    formatKm,
    formatMinutes,
    formatRating,
    getFirstMileDrive,
    getFlightPricing,
    getFlightCatchMessage,
    getGemCurrency,
    getGemDistanceKm,
    getGemPrice,
    getGemRating,
    getTripCostEstimate,
    humanizeProviderLabel,
    shouldPromotePendingStayAvailability,
} from '../services/tripExploreSelectors';
import { round2 } from '../services/driveEstimate';
import { TripExplorationResponse, UnifiedFlightOption } from '../types/tripExploration';
import InfoTooltip from './InfoTooltip';

interface TripOverviewTabProps {
    trip: TripExplorationResponse;
    /** Flight the user picked in the flights tab; falls back to the backend's best. */
    selectedFlight?: UnifiedFlightOption | null;
    /** Trip length in nights — parking is charged per night. */
    nights?: number;
    /** True when the traveller drives to the airport (rental_car first mile). */
    driveMode?: boolean;
}

interface TimelineItem {
    label: string;
    value: string;
}

// Cents-precision euros for the drive breakdown, where €2.30 vs €2 actually
// matters (tolls). The headline package total stays whole-euro.
const formatEur2 = (value: number): string => {
    try {
        return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
    } catch {
        return `€${value.toFixed(2)}`;
    }
};

const buildTimeline = (trip: TripExplorationResponse, flight: UnifiedFlightOption | null | undefined): TimelineItem[] => {
    const truth = flight?.antiCauchemar;
    const departure = formatDateTime(flight?.scheduledDeparture);
    const arrival = formatDateTime(flight?.scheduledArrival);
    const transfer = formatMinutes(truth?.transferToCenterMinutes);
    const driveToHub = formatMinutes(flight?.originDriveMinutes);
    const activity = trip.primaryActivity;

    const items: Array<TimelineItem | null> = [
        driveToHub
            ? { label: 'Drive to hub', value: [`~${driveToHub}`, flight?.departureAirport].filter(Boolean).join(' → ') }
            : null,
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

const TripOverviewTab: React.FC<TripOverviewTabProps> = ({ trip, selectedFlight = null, nights, driveMode }) => {
    const flight = selectedFlight ?? trip.bestUnifiedFlight;
    const truth = flight?.antiCauchemar;
    const pricing = getFlightPricing(flight);
    const showHonestTotal = pricing.honestTotal != null
        && (pricing.baseFare == null || Math.abs(pricing.honestTotal - pricing.baseFare) >= 1);

    const hasLogisticsCatch = Boolean(
        truth?.theCatch
        || pricing.manualCheckRequired
        || asPositiveAmount(truth?.hiddenCostPenalty) != null,
    );
    const catchMessage = flight ? getFlightCatchMessage(flight) : null;
    const providerLabel = humanizeProviderLabel(flight?.sourceLabel ?? flight?.source ?? null);
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
    const bestGemProviderLabel = humanizeProviderLabel(bestGem?.hotel?.provider);
    const bestGemAvailabilityCta = shouldPromotePendingStayAvailability(bestGem);
    const timeline = buildTimeline(trip, flight);

    // First-mile driving cost (fuel + tolls + parking) when the traveller drives
    // to whichever airport this flight departs from — Shannon is cheap, a
    // fly-drive to Dublin adds tolls + long-stay parking. Shared with the
    // verdict card so both quote the same money for the same flight.
    const drive = getFirstMileDrive(trip, flight, nights, driveMode);
    const cost = getTripCostEstimate(trip, nights, drive?.totalEur, flight);

    return (
        <>
            <article className="trip-explore-dashboard__card trip-explore-dashboard__package">
                <div className="trip-explore-dashboard__card-top">
                    <div>
                        <p className="trip-explore-dashboard__label">Door-to-trip estimate</p>
                        <h3 className="trip-explore-dashboard__card-title">
                            {formatCurrency(cost.total, cost.currency)}
                            <span className="trip-explore-dashboard__package-caption"> · {cost.nights} nights, 1 traveller</span>
                        </h3>
                    </div>
                    {cost.partial && (
                        <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                            Partial estimate
                        </span>
                    )}
                </div>
                <div className="trip-explore-dashboard__package-lines">
                    <div className="trip-explore-dashboard__package-line">
                        <span>Flight</span>
                        <strong>{cost.flight != null ? formatCurrency(cost.flight, cost.currency) : '—'}</strong>
                    </div>
                    <div className="trip-explore-dashboard__package-line">
                        <span>Where to sleep</span>
                        <strong>{cost.sleep != null ? formatCurrency(cost.sleep, cost.currency) : '—'}</strong>
                    </div>
                    <div className="trip-explore-dashboard__package-line">
                        <span>Food <em>est.</em></span>
                        <strong>{formatCurrency(cost.food, cost.currency)}</strong>
                    </div>
                    <div className="trip-explore-dashboard__package-line">
                        <span>Local transport <em>est.</em></span>
                        <strong>{formatCurrency(cost.transport, cost.currency)}</strong>
                    </div>
                    {cost.drive != null && (
                        <div className="trip-explore-dashboard__package-line">
                            <span>Drive to airport <em>est.</em></span>
                            <strong>{formatCurrency(cost.drive, cost.currency)}</strong>
                        </div>
                    )}
                </div>

                {drive && (
                    <div className="trip-explore-dashboard__drive-breakdown">
                        <span className="trip-explore-dashboard__meta-label">
                            🚗 Drive {drive.originCity} → {drive.departureAirport}
                            {' · '}
                            {formatMinutes(drive.addedMinutesRoundTrip)} added return
                        </span>
                        <div className="trip-explore-dashboard__drive-rows">
                            <div className="trip-explore-dashboard__drive-row">
                                <span>Fuel · {drive.distanceKm * 2} km return</span>
                                <strong>{formatEur2(drive.fuelEur)}</strong>
                            </div>
                            {drive.tolls.map((toll) => (
                                <div key={toll.name} className="trip-explore-dashboard__drive-row">
                                    <span>{toll.name} <em>{formatEur2(toll.amountEur)} × 2 return</em></span>
                                    <strong>{formatEur2(round2(toll.amountEur * 2))}</strong>
                                </div>
                            ))}
                            <div className="trip-explore-dashboard__drive-row">
                                <span>Airport parking · {drive.nights} × {formatEur2(drive.parkingPerDayEur)}/day</span>
                                <strong>{formatEur2(drive.parkingEur)}</strong>
                            </div>
                        </div>

                        {drive.splitAirport && (
                            <div className="trip-explore-dashboard__drive-alert" role="alert">
                                ⚠ Split-airport logistics: your car will be parked at <strong>{drive.departureAirport}</strong>,
                                not your home airport <strong>{drive.returnAirport}</strong>. Make sure your return flight lands
                                back at {drive.departureAirport} to collect it — parking is billed for the full stay there.
                            </div>
                        )}
                    </div>
                )}

                <p className="trip-explore-dashboard__muted">
                    Honest estimate — real flight price and lead stay, plus food/transport signals. Not a one-click bundle;
                    {cost.partial ? ' flight or stay pricing is still pending, so the total is a floor.' : ' book each part separately.'}
                </p>
            </article>

            <div className="trip-explore-dashboard__grid">
            <div className="trip-explore-dashboard__column">
                <article className="trip-explore-dashboard__card trip-explore-dashboard__card--flight">
                    <div className="trip-explore-dashboard__card-top">
                        <div>
                            <p className="trip-explore-dashboard__label">Journey</p>
                            <h3 className="trip-explore-dashboard__card-title">
                                {selectedFlight ? 'Your selected flight' : 'Top match flight'}
                            </h3>
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
                                    {/* Crisp title only — the raw source flag lives in the muted
                                        provider caption below, never in the headline. */}
                                    {flight.airline && (
                                        <p className="trip-explore-dashboard__flight-airline">
                                            {flight.airline}
                                        </p>
                                    )}
                                    {(flight.flightNumber ?? routeLabel) && (
                                        <p className="trip-explore-dashboard__flight-number">
                                            {flight.flightNumber ?? routeLabel}
                                        </p>
                                    )}
                                    {providerLabel && (
                                        <p className="trip-explore-dashboard__flight-provider">
                                            {providerLabel}
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
                                        <span className="trip-explore-dashboard__price-secondary trip-explore-dashboard__price-secondary--honest">
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
                                <div className="trip-explore-dashboard__arrival-row">
                                    <div>
                                        <span className="trip-explore-dashboard__meta-label">Arrival</span>
                                        {arrivalLabel && <strong>{arrivalLabel}</strong>}
                                    </div>
                                    {/* Progressive disclosure: the local-transport reality is a
                                        compact badge next to the arrival time, not a full-width
                                        block. The detail reveals on hover / focus. */}
                                    {airportReality && (
                                        <InfoTooltip
                                            tone={pricing.manualCheckRequired ? 'warn' : 'info'}
                                            ariaLabel="Getting from the airport to the center"
                                            label={pricing.manualCheckRequired ? '⚠ Transfer' : '🚕 Transfer'}
                                        >
                                            {airportReality}
                                        </InfoTooltip>
                                    )}
                                </div>
                            )}

                            {flight.originAccessNote && (
                                <div className="trip-explore-dashboard__reason-pill">
                                    {flight.originAccessNote}
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
                <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels trip-explore-dashboard__card--top-match">
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
                                    {bestGemPrice == null && bestGemAvailabilityCta ? (
                                        bestGem?.hotel?.bookingLink ? (
                                            <a
                                                className="trip-explore-dashboard__link trip-explore-dashboard__link--button"
                                                href={bestGem.hotel.bookingLink}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Check availability{bestGemProviderLabel ? ` · ${bestGemProviderLabel}` : ''} ↗
                                            </a>
                                        ) : (
                                            <span className="trip-explore-dashboard__link trip-explore-dashboard__link--button" role="status">
                                                Check availability
                                            </span>
                                        )
                                    ) : (
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
                                    )}
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
        </>
    );
};

export default TripOverviewTab;
