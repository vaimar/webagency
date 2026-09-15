import React from 'react';

/** The priced half of a "way in" on the spot page, as `SpotAccessPricingService.Fare` sends it. */
export interface AccessFareValue {
    price: number;
    currency: string;
    /** `realWorldEntryPrice`: the fare plus known extras. The backend falls back to the bare fare when it could not stamp one. */
    entryPrice: number;
    priceLabel: string | null;
}

const formatPrice = (amount: number, currency = 'EUR'): string => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency, maximumFractionDigits: 0,
}).format(amount);

/**
 * Fare first, all-in adjacent — the Route Hacker exception in AGENTS.md.
 *
 * This row used to lead with the all-in, so the same flight showed one headline
 * price here and another on the Flights tab teaser and in the cart. The all-in
 * reads the same basis the teaser's secondary figure does, and is hidden under
 * the same rule: when it equals the fare, the extras are unknown, not zero.
 */
const AccessFare: React.FC<{ fare: AccessFareValue }> = ({ fare }) => (
    <>
        <span className="spot-detail__fare-price">{formatPrice(fare.price, fare.currency)}</span>
        {fare.entryPrice !== fare.price && (
            <span className="spot-detail__fare-allin">{formatPrice(fare.entryPrice, fare.currency)} all-in</span>
        )}
        <span className="spot-detail__fare-note">
            fare{fare.priceLabel ? ` · ${fare.priceLabel.toLowerCase()}` : ''}
        </span>
    </>
);

export default AccessFare;
