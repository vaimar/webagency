import { faExchangeAlt, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { getAirportDisplay } from '../data/airportMetadata';
import { FlightAvailable } from '../services/api';
import { flightUrls } from '../services/affiliates';
import TruthCard from './TruthCard';

interface FlightCardProps {
    flight: FlightAvailable;
    flightSource: 'live' | null;
    flightDiagnosticsOk: boolean;
}

const ESTIMATION_LABEL = 'Estimated from the previous 24 hours';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

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
    const validLinks = [links.googleFlights, links.skyscanner, links.kiwi].filter(isValidRedirectUrl);
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

const getRealWorldEntryPrice = (flight: FlightAvailable): number | undefined => {
    const honestPrice = flight.antiCauchemar?.realWorldEntryPrice ?? flight.antiCauchemar?.realCost;
    return typeof honestPrice === 'number' && Number.isFinite(honestPrice) ? honestPrice : undefined;
};

const getFlightArrival = (flight: FlightAvailable): string | undefined => (
    flight.arrivalDate ?? flight.arrivalTime ?? flight.returnDate
);

const FlightCard: React.FC<FlightCardProps> = ({ flight, flightSource, flightDiagnosticsOk }) => {
    const priceDisplay = getFlightPriceDisplay(flight, flightSource, flightDiagnosticsOk);
    const [googleFlights, skyscanner, kiwi] = priceDisplay.links;
    const honestPrice = getRealWorldEntryPrice(flight);
    const currency = flight.antiCauchemar?.currency ?? flight.currency ?? 'EUR';
    const honestPriceLabel = typeof honestPrice === 'number'
        ? formatPrice(honestPrice, currency)
        : formatPrice(flight.price, currency);
    const baseFareLabel = formatPrice(flight.price, currency);
    const originDetails = getAirportDisplay(flight.origin);
    const destinationDetails = getAirportDisplay(flight.destination);

    return (
        <article className="card card--hoverable flight-card flight-card--truth-first">
            <div className="flight-card__header">
                <div className="flight-card__route">
                    <span>{originDetails.city}</span>
                    <FontAwesomeIcon icon={faExchangeAlt} className="flight-card__route-icon" />
                    <span>{destinationDetails.city}</span>
                </div>
                <span className="flight-card__live-badge">{flightSource === 'live' ? 'Live route' : 'Route preview'}</span>
            </div>

            <div className="flight-card__price-row">
                <div className="flight-card__price-stack">
                    <span className="flight-card__price-caption">Real-world entry price</span>
                    <div className="flight-card__price">{honestPriceLabel}</div>
                    <span className="flight-card__marketing-note">Sorted by honest price, not the headline fare.</span>
                </div>
                <div className="flight-card__price-meta">
                    <span className="flight-card__marketing-label">Marketing fare</span>
                    <span className="flight-card__marketing-price">{baseFareLabel}</span>
                    <span className="flight-card__price-label">
                        {priceDisplay.showExactPrice ? 'Verified booking path' : 'Base fare estimated from the previous 24 hours'}
                    </span>
                </div>
            </div>

            <h3>{flight.flightNumber ? `Flight ${flight.flightNumber} to ${destinationDetails.city}` : `${destinationDetails.city}, ${destinationDetails.country}`}</h3>
            <p className="muted-text flight-card__copy">
                {destinationDetails.airportName} ({destinationDetails.code})
                {getFlightArrival(flight) && <><br /></>}
                Depart: {formatTime(flight.departureDate ?? flight.departureTime)}
                {getFlightArrival(flight) && <><br />Arrive: {formatTime(getFlightArrival(flight))}</>}
            </p>

            <TruthCard truth={flight.antiCauchemar} className="truth-card--embedded" />

            <div className="trip-booking-links" style={{ marginTop: 'auto' }}>
                {googleFlights && <a href={googleFlights} target="_blank" rel="noopener noreferrer" className="trip-external-link">Google Flights <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {skyscanner && <a href={skyscanner} target="_blank" rel="noopener noreferrer" className="trip-external-link">Skyscanner <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {kiwi && <a href={kiwi} target="_blank" rel="noopener noreferrer" className="trip-external-link">Kiwi <FontAwesomeIcon icon={faExternalLinkAlt} style={{ marginLeft: '4px', fontSize: '0.65rem' }} /></a>}
                {priceDisplay.links.length === 0 && <span className="muted-text" style={{ fontSize: '0.8rem' }}>No verified booking link.</span>}
            </div>
        </article>
    );
};

export default FlightCard;

