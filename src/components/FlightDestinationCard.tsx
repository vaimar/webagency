import React from 'react';
import { AirportDisplay, getAirportDisplay } from '../data/airportMetadata';
import { FlightDestination } from '../model/FlightDestination';
import { getAntiCauchemarPricingSummary } from '../services/antiCauchemarPricing';
import TruthCard from './TruthCard';

interface FlightDestinationCardProps {
    destination: FlightDestination;
    onSelect?: () => void;
    isSelected?: boolean;
    showsDateMatch?: boolean;
    shouldAnimate?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
});

const formatDate = (value: string): string => {
    if (!value) {
        return 'Flexible dates';
    }

    return dateFormatter.format(new Date(value));
};

const formatMoney = (value: number | string, currency: string = 'EUR'): string => {
    const amount = typeof value === 'number' ? value : Number.parseFloat(String(value));

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

    return `${currency} ${value}`;
};

const FlightDestinationCard: React.FC<FlightDestinationCardProps> = ({ destination, onSelect, isSelected = false, showsDateMatch = false, shouldAnimate = false }) => {
    const origin: AirportDisplay = getAirportDisplay(destination.origin);
    const arrival: AirportDisplay = getAirportDisplay(destination.destination);
    const fareChip = destination.links.flightOffers ? 'Offer-ready' : 'Preview fare';
    const currency = destination.antiCauchemar?.currency ?? destination.price.currency;
    const pricing = getAntiCauchemarPricingSummary(destination.price.total, destination.antiCauchemar);
    const honestPriceLabel = formatMoney(pricing.estimatedEntryPrice ?? destination.price.total, currency);
    const marketingPriceLabel = formatMoney(destination.price.total, currency);
    const hasEstimatedEntryPrice = typeof pricing.estimatedEntryPrice === 'number';

    return (
        <article
            className={`card flight-card ${onSelect ? 'flight-card--selectable' : ''} ${isSelected ? 'flight-card--selected' : ''} ${shouldAnimate ? 'flight-card--animate-select' : ''}`.trim()}
            onClick={onSelect}
            onKeyDown={(event) => {
                if (!onSelect) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect();
                }
            }}
            role={onSelect ? 'button' : undefined}
            aria-pressed={onSelect ? isSelected : undefined}
            tabIndex={onSelect ? 0 : undefined}
        >
            <div className="flight-card__media">
                <img
                    className="flight-card__media-image"
                    src={arrival.thumbnailUrl}
                    alt={`${arrival.city} airport view`}
                    loading="lazy"
                />
                <div className="flight-card__media-overlay">
                    <div className="flight-card__media-topline">
                        <span className="flight-card__flag">{arrival.flag}</span>
                        <span className="flight-card__badge">Anti-Cauchemar</span>
                    </div>
                    <span className="flight-card__thumbnail-label">{arrival.airportName}</span>
                </div>
            </div>
            <div className="flight-card__eyebrow">{origin.city} → {arrival.city}</div>
            <div className="flight-card__price-row">
                <div className="flight-card__price-stack">
                    <span className="flight-card__price-caption">{hasEstimatedEntryPrice ? 'Estimated one-way entry price' : 'One-way flight fare'}</span>
                    <div className="flight-card__price">{honestPriceLabel}</div>
                    <span className="flight-card__marketing-note">
                        {hasEstimatedEntryPrice
                            ? <>Flight fare <span className="flight-card__marketing-price">{marketingPriceLabel}</span></>
                            : 'Anti-Cauchemar warnings stay visible, but no fixed airport or baggage cost is assumed without a clear breakdown.'}
                    </span>
                </div>
                <div className="flight-card__chips">
                    <span className="flight-card__chip flight-card__chip--fare">{hasEstimatedEntryPrice ? 'Breakdown-backed fare' : 'Warning-backed fare'}</span>
                    <span className="flight-card__chip flight-card__chip--status">{fareChip}</span>
                    {showsDateMatch && <span className="flight-card__chip flight-card__chip--match">This fare matches your selected date</span>}
                </div>
            </div>
            <h3>{arrival.city}, {arrival.country}</h3>
            <p className="muted-text">
                {arrival.airportName} ({arrival.code})
                <br />
                Depart {formatDate(destination.departureDate)} · One-way fare snapshot
            </p>
            <TruthCard truth={destination.antiCauchemar} basePrice={destination.price.total} className="truth-card--embedded" />
            <dl className="flight-card__meta">
                <div>
                    <dt>Fare type</dt>
                    <dd>{destination.type.replace(/-/g, ' ')}</dd>
                </div>
                <div>
                    <dt>Airport note</dt>
                    <dd>{arrival.fareHighlight ?? fareChip}</dd>
                </div>
            </dl>
        </article>
    );
};

export default FlightDestinationCard;

