import { faCartShopping, faCheck, faPenToSquare, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import { operatorBrands } from '../data/airlines';
import { placeWithCode } from '../services/airportLabels';
import {
    CartDirection,
    CartFlight,
    DIRECTION_ORDER,
    FlightCart as Cart,
    amountOf,
    cartCityFor,
    cartTotals,
    directionLabel,
    flightFor,
} from '../services/flightCart';
import { euro, formatClock, formatDuration } from '../services/flightFormat';
import { formatLegDate } from '../services/itinerarySchedule';
import { parseFareInput } from '../services/observedFares';
import AirlineLogo from './AirlineLogo';
import BookingLinks from './BookingLinks';
import './FlightCart.css';

// Your trip — the flights picked so far, and the state of buying them.
//
// It is a cart in the shape everyone knows and deliberately NOT in the part
// that matters most: nothing here is bought. The ticket is bought on the
// airline's site, in another tab, and this panel is what the traveller comes
// back to — tick it off, put in what it actually cost, and the total stops
// being an estimate one leg at a time.

/** What a price is worth, said in the fewest words that stay true. */
const BASIS_NOTE: Record<CartFlight['estimate']['basis'], string> = {
    exact: 'fare for these flights',
    floor: 'cheapest fare that day — may be another departure',
    observed: 'price you entered yourself',
    unknown: 'no price found — check on the airline site',
};

interface CartRowProps {
    flight: CartFlight;
    onRemove: (id: string) => void;
    onChange: (direction: CartDirection) => void;
    onBooked: (id: string, booked: boolean) => void;
    onPaid: (id: string, paid: number | null) => void;
    onReference: (id: string, reference: string) => void;
}

const CartRow: React.FC<CartRowProps> = ({ flight, onRemove, onChange, onBooked, onPaid, onReference }) => {
    const [paidInput, setPaidInput] = useState(flight.paid != null ? String(flight.paid) : '');
    const [referenceInput, setReferenceInput] = useState(flight.reference ?? '');
    const isDirect = flight.type === 'DIRECT';
    const amount = amountOf(flight);
    const brands = operatorBrands(flight.legs.flatMap((leg) => leg.carriers));
    const first = flight.legs[0];
    const last = flight.legs[flight.legs.length - 1];

    const commitPaid = () => onPaid(flight.id, parseFareInput(paidInput));

    return (
        <li className={`flight-cart__row ${flight.booked ? 'flight-cart__row--booked' : ''}`}>
            <div className="flight-cart__row-head">
                <span className="flight-cart__direction">{directionLabel(flight.direction)}</span>
                {/* Cities on the trip line, codes on the ticket lines below —
                    a trip is read as places and booked as codes. */}
                <span className="flight-cart__route">
                    <span title={flight.origin}>{cartCityFor(flight, flight.origin) ?? flight.origin}</span>
                    {!isDirect && (
                        <> → <span className="flight-cart__hub" title={flight.hub ?? ''}>
                            {cartCityFor(flight, flight.hub) ?? flight.hub}
                        </span></>
                    )}
                    {' → '}
                    <span title={flight.destination}>
                        {cartCityFor(flight, flight.destination) ?? flight.destination}
                    </span>
                </span>
                <span className="flight-cart__when">{formatLegDate(first.date)}</span>
                <span className="flight-cart__clocks">
                    {formatClock(first.departureTime)} → {formatClock(last.arrivalTime)}
                    {last.date !== first.date && <sup className="flight-cart__next-day">+1</sup>}
                </span>
                <span className="flight-cart__stops">
                    {isDirect
                        ? 'Direct'
                        : `1 stop · ${formatDuration(flight.layoverMinutes)} at ${cartCityFor(flight, flight.hub) ?? flight.hub}`}
                </span>
                <div className="flight-cart__row-actions">
                    <button
                        type="button"
                        className="flight-cart__link-button"
                        onClick={() => onChange(flight.direction)}
                    >
                        <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" />
                        Change
                    </button>
                    <button
                        type="button"
                        className="flight-cart__link-button flight-cart__link-button--remove"
                        onClick={() => onRemove(flight.id)}
                        aria-label={`Remove the ${directionLabel(flight.direction).toLowerCase()} flight`}
                    >
                        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                        Remove
                    </button>
                </div>
            </div>

            <div className="flight-cart__row-body">
                <div className="flight-cart__legs">
                    {brands.length > 0 && (
                        <div className="flight-cart__carriers">
                            {brands.map((brand) => (
                                <AirlineLogo key={brand.code} code={brand.code} size={18} labelled />
                            ))}
                        </div>
                    )}
                    {/* Booking happens out there, so the way out there sits on
                        the row itself — one set of links per ticket, because a
                        self-transfer is two tickets bought in two places. */}
                    {flight.legs.map((leg, index) => (
                        <div key={`${leg.origin}-${leg.destination}-${leg.date}`} className="flight-cart__leg">
                            <span className="flight-cart__leg-label">
                                {isDirect ? 'Flight' : `Ticket ${index + 1}`}
                                {' · '}{placeWithCode(leg.origin, leg.originCity)}
                                {' → '}{placeWithCode(leg.destination, leg.destinationCity)}
                                {' · '}{formatLegDate(leg.date)} {formatClock(leg.departureTime)}
                            </span>
                            <BookingLinks
                                surface="flight-cart"
                                origin={leg.origin}
                                destination={leg.destination}
                                date={leg.date}
                                carriers={leg.carriers}
                                departureTime={leg.departureTime}
                                arrivalTime={leg.arrivalTime}
                            />
                        </div>
                    ))}
                </div>

                <div className="flight-cart__money">
                    <span className={`flight-cart__amount ${flight.paid != null ? 'flight-cart__amount--paid' : ''}`}>
                        {amount != null
                            ? `${flight.paid != null || flight.estimate.basis === 'exact' ? '' : '≈ '}${euro(amount)}`
                            : '—'}
                    </span>
                    <span className="flight-cart__basis">
                        {flight.paid != null ? 'what you paid' : BASIS_NOTE[flight.estimate.basis]}
                    </span>
                    {/* The fare is the headline; what it really costs once the
                        bag and the transfer are counted sits under it. */}
                    {flight.paid == null && flight.estimate.honest != null && flight.estimate.fare != null && (
                        <span className="flight-cart__basis">
                            {euro(flight.estimate.honest)} all-in with bag + transfer
                        </span>
                    )}

                    <label className="flight-cart__booked">
                        <input
                            type="checkbox"
                            checked={flight.booked}
                            onChange={(event) => onBooked(flight.id, event.target.checked)}
                        />
                        <span>I have booked this</span>
                    </label>

                    {/* Only after the ticket exists: asking what it cost before
                        anyone has been to the airline site is asking them to
                        make a number up. */}
                    {flight.booked && (
                        <div className="flight-cart__confirm">
                            <label className="flight-cart__field">
                                <span>Paid</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="flight-cart__input"
                                    placeholder="€"
                                    value={paidInput}
                                    onChange={(event) => setPaidInput(event.target.value)}
                                    onBlur={commitPaid}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            commitPaid();
                                        }
                                    }}
                                />
                            </label>
                            <label className="flight-cart__field">
                                <span>Ref</span>
                                <input
                                    type="text"
                                    className="flight-cart__input"
                                    placeholder="Booking reference"
                                    value={referenceInput}
                                    onChange={(event) => setReferenceInput(event.target.value)}
                                    onBlur={() => onReference(flight.id, referenceInput)}
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
};

interface FlightCartProps {
    cart: Cart;
    /** One-way trips are complete with an outbound alone — no empty return slot. */
    isOneWay: boolean;
    /** The direction being chosen right now, or 'review' once both are picked. */
    activeStep: CartDirection | 'review';
    onChoose: (direction: CartDirection) => void;
    onRemove: (id: string) => void;
    onBooked: (id: string, booked: boolean) => void;
    onPaid: (id: string, paid: number | null) => void;
    onReference: (id: string, reference: string) => void;
    onClear: () => void;
}

const FlightCart: React.FC<FlightCartProps> = ({
    cart, isOneWay, activeStep, onChoose, onRemove, onBooked, onPaid, onReference, onClear,
}) => {
    const directions: CartDirection[] = isOneWay ? ['outbound'] : DIRECTION_ORDER;
    const totals = cartTotals(cart);
    const everythingBooked = totals.count > 0
        && totals.bookedCount === totals.count
        && directions.every((direction) => flightFor(cart, direction));

    return (
        <section className="flight-cart" aria-label="Your trip">
            <header className="flight-cart__head">
                <h2 className="flight-cart__title">
                    <FontAwesomeIcon icon={faCartShopping} aria-hidden="true" />
                    Your trip
                </h2>
                {/* The steps of a round trip, in the order the page asks for
                    them. A one-way trip has one step and does not need a rail
                    to say so. */}
                <ol className="flight-cart__steps">
                    {directions.map((direction, index) => {
                        const picked = flightFor(cart, direction);
                        const state = picked ? 'done' : activeStep === direction ? 'active' : 'todo';
                        return (
                            <li key={direction} className={`flight-cart__step flight-cart__step--${state}`}>
                                <span className="flight-cart__step-number">
                                    {picked ? <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> : index + 1}
                                </span>
                                <span>{directionLabel(direction)}</span>
                            </li>
                        );
                    })}
                    <li className={`flight-cart__step flight-cart__step--${everythingBooked ? 'done' : activeStep === 'review' ? 'active' : 'todo'}`}>
                        <span className="flight-cart__step-number">
                            {everythingBooked ? <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> : directions.length + 1}
                        </span>
                        <span>Book</span>
                    </li>
                </ol>
                {cart.length > 0 && (
                    <button type="button" className="flight-cart__link-button" onClick={onClear}>
                        Empty trip
                    </button>
                )}
            </header>

            <ul className="flight-cart__rows">
                {directions.map((direction) => {
                    const picked = flightFor(cart, direction);
                    if (picked) {
                        return (
                            <CartRow
                                key={picked.id}
                                flight={picked}
                                onRemove={onRemove}
                                onChange={onChoose}
                                onBooked={onBooked}
                                onPaid={onPaid}
                                onReference={onReference}
                            />
                        );
                    }
                    return (
                        <li key={direction} className="flight-cart__row flight-cart__row--empty">
                            <span className="flight-cart__direction">{directionLabel(direction)}</span>
                            <span className="flight-cart__empty-note">
                                {activeStep === direction
                                    ? 'Pick one from the results below.'
                                    : 'Not chosen yet.'}
                            </span>
                            {activeStep !== direction && (
                                <button type="button" className="flight-cart__link-button" onClick={() => onChoose(direction)}>
                                    Choose {directionLabel(direction).toLowerCase()}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            <footer className="flight-cart__total">
                <div className="flight-cart__total-copy">
                    <span className="flight-cart__total-label">
                        {totals.allPaid ? 'Total paid' : 'Trip total'}
                    </span>
                    <span className="flight-cart__total-note">
                        {totals.count === 0
                            ? 'Nothing picked yet — the total builds as you choose flights.'
                            : totals.allPaid
                            ? `${totals.count === 1 ? 'One ticket' : `${totals.count} tickets`} booked — this is what it cost.`
                            : totals.hasFloor
                                ? 'An estimate: part of it is the cheapest fare on that route that day, which may belong to another departure. Booking a leg and entering what you paid replaces its share.'
                                : 'An estimate until you book. Enter what you actually paid and this becomes the real number.'}
                        {totals.count > 0 && totals.unpricedCount > 0 && (
                            ` ${totals.unpricedCount === 1 ? 'One flight has' : `${totals.unpricedCount} flights have`} no price yet, so ${totals.unpricedCount === 1 ? 'it is' : 'they are'} missing from this.`
                        )}
                    </span>
                </div>
                {totals.count > 0 && (
                <div className="flight-cart__total-figure">
                    <strong className={totals.allPaid ? 'flight-cart__total-amount flight-cart__total-amount--paid' : 'flight-cart__total-amount'}>
                        {totals.allPaid ? '' : totals.hasFloor ? 'from ' : '≈ '}
                        {euro(totals.total)}
                    </strong>
                    {!totals.allPaid && totals.paid > 0 && (
                        <span className="flight-cart__total-split">
                            {euro(totals.paid)} paid · {euro(totals.estimated)} still estimated
                        </span>
                    )}
                </div>
                )}
            </footer>
        </section>
    );
};

export default FlightCart;
