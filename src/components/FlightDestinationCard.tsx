import React from 'react';
import { FlightDestination } from '../model/FlightDestination';

interface FlightDestinationCardProps {
    destination: FlightDestination;
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

const FlightDestinationCard: React.FC<FlightDestinationCardProps> = ({ destination }) => {
    return (
        <article className="card flight-card">
            <div className="flight-card__eyebrow">{destination.origin} → {destination.destination}</div>
            <div className="flight-card__price">
                {destination.price.currency} {destination.price.total}
            </div>
            <h3>{destination.destination}</h3>
            <p className="muted-text">
                Depart {formatDate(destination.departureDate)} · Return {formatDate(destination.returnDate)}
            </p>
            <dl className="flight-card__meta">
                <div>
                    <dt>Fare type</dt>
                    <dd>{destination.type.replace(/-/g, ' ')}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd>{destination.links.flightOffers ? 'Offer-ready' : 'Preview fare'}</dd>
                </div>
            </dl>
        </article>
    );
};

export default FlightDestinationCard;

