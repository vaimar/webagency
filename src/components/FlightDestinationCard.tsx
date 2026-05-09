import React from 'react';
import { AirportDisplay, getAirportDisplay } from '../data/airportMetadata';
import { FlightDestination } from '../model/FlightDestination';

interface FlightDestinationCardProps {
    destination: FlightDestination;
    onSelect?: () => void;
    isSelected?: boolean;
    showsDateMatch?: boolean;
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

const FlightDestinationCard: React.FC<FlightDestinationCardProps> = ({ destination, onSelect, isSelected = false, showsDateMatch = false }) => {
    const origin: AirportDisplay = getAirportDisplay(destination.origin);
    const arrival: AirportDisplay = getAirportDisplay(destination.destination);
    const fareChip = destination.links.flightOffers ? 'Offer-ready' : 'Preview fare';

    return (
        <article
            className={`card flight-card ${onSelect ? 'flight-card--selectable' : ''} ${isSelected ? 'flight-card--selected' : ''}`.trim()}
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
                <div className="flight-card__price">
                    {destination.price.currency} {destination.price.total}
                </div>
                <div className="flight-card__chips">
                    <span className="flight-card__chip flight-card__chip--fare">From {destination.price.currency} {destination.price.total}</span>
                    <span className="flight-card__chip flight-card__chip--status">{fareChip}</span>
                    {showsDateMatch && <span className="flight-card__chip flight-card__chip--match">This fare matches your selected date</span>}
                </div>
            </div>
            <h3>{arrival.city}, {arrival.country}</h3>
            <p className="muted-text">
                {arrival.airportName} ({arrival.code})
                <br />
                Depart {formatDate(destination.departureDate)} · Return {formatDate(destination.returnDate)}
            </p>
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

