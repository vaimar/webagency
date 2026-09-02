import { faExchangeAlt, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { airlineCodeFor, airlineName } from '../data/airlines';
import { getAirportDisplay } from '../data/airportMetadata';
import { getCityImageForAirport } from '../data/cityImages';
import { FlightAvailable } from '../services/api';
import { getAntiCauchemarPricingSummary } from '../services/antiCauchemarPricing';
import { flightUrls } from '../services/affiliates';
import AirlineLogo from './AirlineLogo';
import TruthCard from './TruthCard';

interface FlightCardProps {
    flight: FlightAvailable;
    flightSource: 'live' | null;
    /**
     * Carrier the CALLER knows operates these fares, as an IATA code, used only
     * when the fare row itself names no airline. The cached-fare feed stores a
     * price, a route and two timestamps and nothing else, so the only thing that
     * knows the flights came from Ryanair is the search that asked for them.
     */
    operatorCode?: string | null;
    flightDiagnosticsOk: boolean;
    hero?: boolean;
    onSelect?: () => void;
    isSelected?: boolean;
}

const ESTIMATION_LABEL = 'Estimated from the previous 24 hours';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Is this card a placeholder rather than a fare?
 *
 * When no provider returns anything, the backend synthesises a flight
 * (`FlightSearchService.buildHeuristicFallbackFlight`): airline "Fallback
 * Routing", flight number "FALLBACK-<origin><dest>", a flat €89, and 09:00 →
 * 12:30 times that were never looked up. It then reports `routeAvailable: true`.
 *
 * Rendered in the normal card that is indistinguishable from a real €89 fare —
 * same big price, same "Honest total", same booking links. Everything below
 * exists to make that impossible to mistake.
 */
const isFallbackFlight = (flight: FlightAvailable): boolean => (
    /^FALLBACK[-_]/i.test(flight.flightNumber ?? '')
    || /^fallback\s+routing$/i.test((flight.airline ?? '').trim())
    || (flight as { provider?: string }).provider === 'heuristic-fallback'
);

const formatPrice = (price: number | string, currency: string = 'EUR'): string => {
    const amount = typeof price === 'number' ? price : Number.parseFloat(String(price));

    if (Number.isFinite(amount)) {
        try {
            return new Intl.NumberFormat('en-IE', {
                style: 'currency',
                currency,
                minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2,
            }).format(amount);
        } catch {
            // fall through to the plain text fallback below
        }
    }

    return `${currency} ${price}`;
};

const extractDatePart = (value?: string): string => {
    if (!value) return '';
    if (DATE_ONLY_RE.test(value)) return value;
    const match = value.match(ISO_DATE_PREFIX_RE);
    return match?.[1] ?? '';
};

const formatTime = (value?: string): string => {
    if (!value) return '—';

    if (DATE_ONLY_RE.test(value)) {
        const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(utcDate);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const getFlightDate = (flight: FlightAvailable): string => extractDatePart(flight.departureDate ?? flight.departureTime ?? '');

const getFlightLinks = (flight: FlightAvailable) => {
    const date = getFlightDate(flight);
    return flightUrls(flight.origin, flight.destination, date);
};

const isValidRedirectUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch {
        return false;
    }
};

const isWithin24Hours = (value?: string): boolean => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;
};

const getFlightPriceDisplay = (
    flight: FlightAvailable,
    flightSource: 'live' | null,
    flightDiagnosticsOk: boolean,
) => {
    const links = getFlightLinks(flight);
    const validLinks = [links.googleFlights, links.kiwi].filter(isValidRedirectUrl);
    const hasVerifiedRedirect = validLinks.length > 0;
    const hasActiveBookingApi = flightSource === 'live' && flightDiagnosticsOk;
    const isFreshRealtime = isWithin24Hours(flight.fetchDate) || !flight.fetchDate;
    const isRealtimeVerified = hasVerifiedRedirect && hasActiveBookingApi && isFreshRealtime;

    return {
        links: validLinks,
        showExactPrice: isRealtimeVerified,
        label: isRealtimeVerified ? formatPrice(flight.price, flight.currency ?? flight.antiCauchemar?.currency ?? 'EUR') : ESTIMATION_LABEL,
    };
};

const getFlightArrival = (flight: FlightAvailable): string | undefined => (
    flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate
);

/**
 * How long the flight is, as "2h15", from the two timestamps.
 *
 * Null unless both parse and the arrival is after the departure — a cached row
 * missing its arrival should show nothing rather than a made-up figure.
 */
const getFlightDuration = (flight: FlightAvailable): string | null => {
    const from = Date.parse(flight.departureDate ?? flight.departureTime ?? '');
    const to = Date.parse(getFlightArrival(flight) ?? '');
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        return null;
    }
    const minutes = Math.round((to - from) / 60_000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h${rest.toString().padStart(2, '0')}`;
};

const FlightCard: React.FC<FlightCardProps> = ({
    flight,
    flightSource,
    flightDiagnosticsOk,
    operatorCode = null,
    hero = false,
    onSelect,
    isSelected = false,
}) => {
    const priceDisplay = getFlightPriceDisplay(flight, flightSource, flightDiagnosticsOk);
    const allLinks = getFlightLinks(flight);
    const [googleFlights, kiwi] = priceDisplay.links;
    const pricing = getAntiCauchemarPricingSummary(flight.price, flight.antiCauchemar);
    const currency = flight.antiCauchemar?.currency ?? flight.currency ?? 'EUR';
    const primaryPriceLabel = formatPrice(pricing.estimatedEntryPrice ?? flight.price, currency);
    const baseFareLabel = formatPrice(flight.price, currency);
    const doorToTripLabel = pricing.doorToTripPrice ? formatPrice(pricing.doorToTripPrice, currency) : null;
    const originDetails = getAirportDisplay(flight.origin);
    const destinationDetails = getAirportDisplay(flight.destination);
    const destinationImage = getCityImageForAirport(flight.destination);
    const hasEstimatedEntryPrice = typeof pricing.estimatedEntryPrice === 'number';
    const hasOpaqueWarning = pricing.hasOpaquePenalty || Boolean(flight.antiCauchemar?.theCatch || flight.antiCauchemar?.logisticVerdict);
    const isFallback = isFallbackFlight(flight);
    // A synthesised placeholder carries the airline "Fallback Routing" and a
    // made-up number — never brand one with a real carrier's logo.
    const airlineCode = isFallback ? null : (airlineCodeFor(flight.flightNumber, flight.airline) ?? operatorCode);
    // A placeholder's times were never looked up, so its "duration" would be fiction.
    const duration = isFallback ? null : getFlightDuration(flight);
    const articleClassName = [
        'card',
        'flight-card',
        !hero ? 'card--hoverable' : '',
        onSelect ? 'flight-card--selectable' : '',
        isSelected ? 'flight-card--selected' : '',
        !hero ? 'flight-card--truth-first' : '',
        isFallback ? 'flight-card--fallback' : '',
    ].filter(Boolean).join(' ');
    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (!onSelect) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect();
        }
    };

    if (hero) {
        return (
            <article
                className={`${articleClassName} flight-card--hero`.trim()}
                onClick={onSelect}
                onKeyDown={handleKeyDown}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-pressed={onSelect ? isSelected : undefined}
            >
                <div className="flight-card--hero__top">
                    <div className="flight-card--hero__route">
                        <div className="flight-card--hero__city">
                            <span className="flight-card--hero__city-code">{originDetails.code}</span>
                            <span className="flight-card--hero__city-name">{originDetails.city}</span>
                            <span className="flight-card--hero__airport-name">{originDetails.airportName}</span>
                        </div>
                        <div className="flight-card--hero__arrow">
                            <FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" />
                            <span className="flight-card--hero__one-way">One way</span>
                        </div>
                        <div className="flight-card--hero__city">
                            <span className="flight-card--hero__city-code">{destinationDetails.code}</span>
                            <span className="flight-card--hero__city-name">{destinationDetails.city}</span>
                            <span className="flight-card--hero__airport-name">{destinationDetails.airportName}</span>
                        </div>
                    </div>
                    <div className="flight-card--hero__price-block">
                        <span className="flight-card__live-badge">
                            {isFallback ? 'No fare found' : flightSource === 'live' ? 'Live route' : 'Route preview'}
                        </span>
                        <span className="flight-card__price-caption">
                            {isFallback ? 'Placeholder — not a quote' : 'Flight fare'}
                        </span>
                        <div className="flight-card--hero__price">{baseFareLabel}</div>
                        {hasEstimatedEntryPrice && (
                            <span className="flight-card--hero__price--total">Honest total: {primaryPriceLabel}</span>
                        )}
                        {doorToTripLabel && (
                            <span className="flight-card--hero__price--door-to-trip">
                                Door-to-trip: {doorToTripLabel}
                            </span>
                        )}
                        {pricing.hasManualCheckRequired && (
                            <span className="flight-card__manual-check-badge">⚠ Costs require manual check</span>
                        )}
                    </div>
                </div>

                <div className="flight-card--hero__details">
                    <div className="flight-card--hero__times">
                        <div>
                            <span className="flight-card__price-caption">Depart</span>
                            <strong>{formatTime(flight.departureDate ?? flight.departureTime)}</strong>
                        </div>
                        {getFlightArrival(flight) && (
                            <div>
                                <span className="flight-card__price-caption">Arrive</span>
                                <strong>{formatTime(getFlightArrival(flight))}</strong>
                            </div>
                        )}
                        {flight.flightNumber && !isFallback && (
                            <div>
                                <span className="flight-card__price-caption">Flight</span>
                                <strong>{flight.flightNumber}</strong>
                            </div>
                        )}
                        {duration && (
                            <div>
                                <span className="flight-card__price-caption">Duration</span>
                                <strong>{duration}</strong>
                            </div>
                        )}
                        {airlineCode && (
                            <div>
                                <span className="flight-card__price-caption">Airline</span>
                                <strong className="flight-card__airline">
                                    <AirlineLogo code={airlineCode} size={20} labelled />
                                    {airlineName(airlineCode)}
                                </strong>
                            </div>
                        )}
                    </div>
                    <div className="flight-card--hero__price-breakdown">
                        <span className="flight-card__marketing-label">
                            {hasEstimatedEntryPrice
                                ? 'Only known extras are added. Mystery penalties stay out of the price.'
                                : hasOpaqueWarning
                                    ? 'Warning only — no bus, bag, or pickup cost is assumed unless the breakdown is explicit.'
                                    : priceDisplay.showExactPrice
                                        ? 'Verified booking path'
                                        : 'Base fare estimated from the previous 24 hours'}
                        </span>
                    </div>
                </div>

                <TruthCard
                    truth={flight.antiCauchemar ?? null}
                    basePrice={flight.price}
                    destinationCode={flight.destination}
                    arrivalTime={getFlightArrival(flight)}
                    className="truth-card--embedded"
                />

                <div className="trip-booking-links flight-card--hero__links">
                    {isValidRedirectUrl(allLinks.ryanair) && <a href={allLinks.ryanair} target="_blank" rel="noopener noreferrer" className="trip-external-link trip-external-link--primary">Ryanair <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                    {googleFlights && <a href={googleFlights} target="_blank" rel="noopener noreferrer" className="trip-external-link">Google Flights <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                    {kiwi && <a href={kiwi} target="_blank" rel="noopener noreferrer" className="trip-external-link">Kiwi <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                    {priceDisplay.links.length === 0 && <span className="muted-text" style={{ fontSize: '0.8rem' }}>No verified booking link.</span>}
                </div>
            </article>
        );
    }

    return (
        <article
            className={articleClassName}
            onClick={onSelect}
            onKeyDown={handleKeyDown}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? isSelected : undefined}
        >
            {destinationImage ? (
                <div className="flight-card__media flight-card__media--banner">
                    <img
                        className="flight-card__media-image"
                        src={destinationImage.url}
                        alt={`${destinationImage.city} — destination`}
                        loading="lazy"
                        onError={(event) => { event.currentTarget.parentElement!.style.display = 'none'; }}
                    />
                    <div className="flight-card__media-overlay">
                        <div className="flight-card__media-topline">
                            <span className="flight-card__route flight-card__route--on-media">
                                <span>{originDetails.city}</span>
                                <FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" />
                                <span>{destinationDetails.city}</span>
                            </span>
                            <span className="flight-card__live-badge">{flightSource === 'live' ? 'Live route' : 'Route preview'}</span>
                        </div>
                        <span className="flight-card__media-caption">{destinationImage.city} · {destinationImage.credit}</span>
                    </div>
                </div>
            ) : (
                <div className="flight-card__header">
                    <div className="flight-card__route">
                        <span>{originDetails.city}</span>
                        <FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" />
                        <span>{destinationDetails.city}</span>
                    </div>
                    <span className="flight-card__live-badge">{flightSource === 'live' ? 'Live route' : 'Route preview'}</span>
                </div>
            )}

            {/* A synthesised route gets a banner instead of a price headline. It has
                no fare to show, so showing one in the same type as a real fare is
                the one thing this card must not do. */}
            {isFallback && (
                <p className="flight-card__fallback-notice">
                    <strong>No fare found for this route.</strong> Nothing came back from any provider for{' '}
                    {originDetails.code} → {destinationDetails.code} on this date, so the figure below is a
                    placeholder, not a price anyone has quoted. Check the airline directly before planning
                    around it.
                </p>
            )}

            <div className="flight-card__price-row">
                <div className="flight-card__price-stack">
                    <span className="flight-card__price-caption">
                        {isFallback
                            ? 'Placeholder estimate — no quote behind it'
                            : hasEstimatedEntryPrice ? 'Estimated one-way entry price' : 'One-way flight fare'}
                    </span>
                    <div className="flight-card__price">{hasEstimatedEntryPrice ? primaryPriceLabel : baseFareLabel}</div>
                    {hasEstimatedEntryPrice && !isFallback && (
                        <span className="flight-card__marketing-note">
                            Flight fare <span className="flight-card__marketing-price">{baseFareLabel}</span>
                        </span>
                    )}
                    <span className="flight-card__marketing-note">
                        {isFallback
                            ? 'Departure and arrival times below are placeholders too.'
                            : hasEstimatedEntryPrice
                                ? 'Fare + known extras only. Mystery costs stay out.'
                                : 'Anti-Cauchemar warnings stay visible below, but no fixed extra is added without a clear breakdown.'}
                    </span>
                </div>
                {hasEstimatedEntryPrice && (
                    <div className="flight-card__price-meta">
                        <span className="flight-card__marketing-label">Extras added</span>
                        {(pricing.cabinBagEstimate ?? 0) > 0 && (
                            <span className="flight-card__price-label">
                                <span>Cabin bag</span>
                                <span className="flight-card__price-label-amount">~{formatPrice(pricing.cabinBagEstimate!, currency)}</span>
                            </span>
                        )}
                        {(pricing.airportShuttleEstimate ?? 0) > 0 && (
                            <span className="flight-card__price-label">
                                <span>Transfer</span>
                                <span className="flight-card__price-label-amount">~{formatPrice(pricing.airportShuttleEstimate!, currency)}</span>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {airlineCode && (
                <div className="flight-card__airline flight-card__airline--row">
                    <AirlineLogo code={airlineCode} size={22} labelled />
                    {airlineName(airlineCode)}
                </div>
            )}

            {/* "Flight FALLBACK-SNNGVA" is an internal identifier, not a flight
                number — never present it as one. */}
            <h3>
                {flight.flightNumber && !isFallback
                    ? `Flight ${flight.flightNumber} to ${destinationDetails.city}`
                    : `${destinationDetails.city}, ${destinationDetails.country}`}
            </h3>
            <p className="muted-text flight-card__copy">
                {destinationDetails.airportName} ({destinationDetails.code})
                <br />
                One way  Depart {getFlightDate(flight)}
                {getFlightArrival(flight) && <><br />Arrive: {formatTime(getFlightArrival(flight))}</>}
                {duration && <><br />Duration: {duration}</>}
            </p>

            <TruthCard
                truth={flight.antiCauchemar ?? null}
                basePrice={flight.price}
                destinationCode={flight.destination}
                arrivalTime={getFlightArrival(flight)}
                className="truth-card--embedded"
            />

            <div className="trip-booking-links" style={{ marginTop: 'auto' }}>
                {isValidRedirectUrl(allLinks.ryanair) && <a href={allLinks.ryanair} target="_blank" rel="noopener noreferrer" className="trip-external-link">Ryanair <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {googleFlights && <a href={googleFlights} target="_blank" rel="noopener noreferrer" className="trip-external-link">Google Flights <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {kiwi && <a href={kiwi} target="_blank" rel="noopener noreferrer" className="trip-external-link">Kiwi <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {priceDisplay.links.length === 0 && <span className="muted-text" style={{ fontSize: '0.8rem' }}>No verified booking link.</span>}
            </div>
        </article>
    );
};

export default FlightCard;

