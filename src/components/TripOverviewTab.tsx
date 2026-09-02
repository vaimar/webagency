import React, { useId, useState } from 'react';
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
    isFallbackOption,
    looksLikeBackendConstant,
    sanitizeAirline,
    sanitizeFlightNumber,
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
    // Progressive disclosure: the fuel/toll/parking micro-logistics stay behind
    // a single summary line until the shopper asks for the receipts.
    const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
    const logisticsPanelId = useId();
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
    /**
     * This card read `flight.airline` / `flight.flightNumber` straight off the
     * wire, so a synthesised route announced itself as "FALLBACK ROUTING" /
     * "FALLBACK-SNNIBZ". The sanitizers already existed for the flights list;
     * the overview simply never used them.
     */
    const isFallback = isFallbackOption(flight);
    const airlineLabel = sanitizeAirline(flight?.airline);
    const flightNumberLabel = sanitizeFlightNumber(flight?.flightNumber);
    const routeLabel = flight?.departureAirport && flight?.arrivalAirport
        ? `${flight.departureAirport} → ${flight.arrivalAirport}`
        : null;
    const transferMinutes = asPositiveAmount(truth?.transferToCenterMinutes);
    const airportReality = pricing.manualCheckRequired
        ? '⚠ Manual check required'
        : truth?.logisticVerdict ?? (transferMinutes != null ? `~${Math.round(transferMinutes)} min to center` : null);
    const arrivalLabel = formatDateTime(flight?.scheduledArrival);
    /**
     * Shown when no airline returned a fare. The backend used to synthesise a
     * flight rather than admit this, so the branch below was rarely reached;
     * now it is the honest answer and needs to say something useful.
     *
     * The backend fields are used only when they are real prose. Both sometimes
     * arrive as raw enums — `resolutionReason` was putting
     * "EXPLICIT_ARRIVAL_AIRPORT" in front of the user as an explanation — but
     * they also carry genuinely useful sentences like "City coordinates could not
     * be resolved for EXO 84", which are better than any generic wording.
     */
    const noFlightReason = [trip.resolutionReason, trip.routeSelectionSummary]
        .map((value) => value?.trim())
        .find((value): value is string => Boolean(value) && !looksLikeBackendConstant(value!))
        ?? 'No airline returned a fare for this route on these dates. Try different dates or a '
            + 'nearby airport — the total below leaves the flight out entirely.';

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
                        <strong>
                            {cost.flight != null
                                ? formatCurrency(cost.flight, cost.currency)
                                : 'Not priced'}
                        </strong>
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
                        {/* Collapsed by default: one sleek summary line owns the whole
                            fuel/toll/parking story until the shopper opens the receipts. */}
                        <button
                            type="button"
                            className="trip-explore-dashboard__drive-toggle"
                            aria-expanded={isLogisticsOpen}
                            aria-controls={logisticsPanelId}
                            onClick={() => setIsLogisticsOpen((open) => !open)}
                        >
                            <span className="trip-explore-dashboard__drive-toggle-main">
                                <span className="trip-explore-dashboard__drive-toggle-label">
                                    📊 Door-to-airport logistics breakdown
                                </span>
                                <span className="trip-explore-dashboard__meta-label">
                                    🚗 {drive.originCity} → {drive.departureAirport}
                                    {' · '}
                                    {formatMinutes(drive.addedMinutesRoundTrip)} added return
                                </span>
                            </span>
                            <span className="trip-explore-dashboard__drive-toggle-amount">
                                +{formatEur2(drive.totalEur)}
                                <span aria-hidden="true" className="trip-explore-dashboard__drive-chevron">▾</span>
                            </span>
                        </button>

                        {/* Split-airport trap stays impossible to miss even when the
                            breakdown is collapsed — compact chip, detail on hover/focus. */}
                        {drive.splitAirport && (
                            <InfoTooltip
                                tone="warn"
                                ariaLabel="Split-airport parking warning"
                                label="⚠ Split airport"
                            >
                                Your car will be parked at {drive.departureAirport}, not your home
                                airport {drive.returnAirport}. Make sure the return flight lands back
                                at {drive.departureAirport} to collect it — parking is billed for the
                                full stay there.
                            </InfoTooltip>
                        )}

                        {isLogisticsOpen && (
                            <div id={logisticsPanelId} className="trip-explore-dashboard__drive-rows">
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
                        {/* The catch rides next to the fare as a compact warn chip —
                            full Anti-Cauchemar note reveals on hover / focus. */}
                        {hasLogisticsCatch && (
                            <InfoTooltip
                                tone="warn"
                                ariaLabel="Anti-Cauchemar: the catch behind this fare"
                                label="⚠ The catch"
                            >
                                {catchMessage
                                    ?? 'This fare hides logistics costs — check the honest total before booking.'}
                            </InfoTooltip>
                        )}
                    </div>

                    {flight ? (
                        <>
                            <div className={`trip-explore-dashboard__flight-hero${isFallback ? ' trip-explore-dashboard__flight-hero--fallback' : ''}`}>
                                <div>
                                    {/* Crisp title only — the raw source flag lives in the muted
                                        provider caption below, never in the headline. */}
                                    {(airlineLabel ?? (isFallback ? 'No fare found' : null)) && (
                                        <p className="trip-explore-dashboard__flight-airline">
                                            {airlineLabel ?? 'No fare found'}
                                        </p>
                                    )}
                                    {(flightNumberLabel ?? routeLabel) && (
                                        <p className="trip-explore-dashboard__flight-number">
                                            {flightNumberLabel ?? routeLabel}
                                        </p>
                                    )}
                                    {providerLabel && (
                                        <p className="trip-explore-dashboard__flight-provider">
                                            {providerLabel}
                                        </p>
                                    )}
                                </div>
                                <div className="trip-explore-dashboard__price-stack">
                                    <span className="trip-explore-dashboard__price-caption">
                                        {isFallback ? 'Placeholder' : 'Base fare'}
                                    </span>
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
                                {isFallback && (
                                    <p className="trip-explore-dashboard__fallback-note">
                                        No airline returned a fare for this route on this date. The figure
                                        above is a placeholder, and the times below were not looked up —
                                        check with the airline before planning around them.
                                    </p>
                                )}
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

                        </>
                    ) : (
                        <div className="trip-explore-dashboard__alert-block">
                            <span className="trip-explore-dashboard__alert-label">No flights found</span>
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
                            <p className="trip-explore-dashboard__label">Where to stay</p>
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
