import { faArrowRightLong, faBolt, faPlaneUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import { AirlineBrand, operatorBrands } from '../data/airlines';
import { ItineraryPrice, honestCostOf, isRyanairLeg } from '../services/hackerAutoPrice';
import {
    AirportRef,
    HackerFlightLeg,
    HackerItinerary,
    HackerPriceResponse,
    fetchHackerRoutePrice,
} from '../services/hackerRoutes';
import { LegSchedule, ScheduledPoint, formatLegDate, itinerarySchedule } from '../services/itinerarySchedule';
import { ObservedFare, observedFareKey } from '../services/observedFares';
import AirlineLogo from './AirlineLogo';
import BookingLinks from './BookingLinks';
import ObservedFareInput from './ObservedFareInput';
import './HackerRouteCard.css';

const formatClock = (value?: string | null): string => {
    if (!value) return '—';
    const match = value.match(/^(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
};

const formatDuration = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes < 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
};

/**
 * Ryanair's fare feed publishes ONE cheapest fare per day per route, not a fare
 * per departure. So the number beside an 07:45 flight may well belong to the
 * 06:20 one — true of the button since it shipped, and far more visible now
 * that the page prices itself. Saying so is cheaper than being quietly wrong.
 */
const FLOOR_CAVEAT = 'Ryanair publishes one cheapest fare per day per route, not a fare per '
    + 'departure. This price belongs to a different flight on the same day, so it is the floor '
    + 'for the route rather than what this itinerary costs — check the booking links for the '
    + 'flight shown above.';

const PARTIAL_CAVEAT = 'Only part of this journey could be priced. A leg flown by anyone other '
    + 'than Ryanair needs the paid aggregator, so its fare is unknown. A RYANAIR leg with no price '
    + 'means Ryanair published no fare for that route on that date, which usually means it does '
    + 'not operate that day. Either way the figure shown is one leg, NOT the cost of the trip.';

const HONEST_CAVEAT = 'Fare plus the costs nobody quotes: the cabin bag and the airport transfer. '
    + 'A self-transfer is two separate tickets, so it carries two of each — which is often what '
    + 'decides whether it really beats the direct flight.';

const OBSERVED_CAVEAT = 'Part of this total is a price you entered yourself after looking it up, '
    + 'not a fare any source quoted us. It is stored on this device only, and it is only as '
    + 'current as the day you saw it — re-check before booking.';

const EXACT_CAVEAT = 'Ryanair\'s cheapest fare that day is for exactly these departures, so this '
    + 'is what this itinerary costs.';

const euro = (value: number): string => `€${value.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`;

interface HackerRouteCardProps {
    itinerary: HackerItinerary;
    /** YYYY-MM-DD travel date, passed through to booking links and price fetch. */
    date: string;
    /**
     * Reports a fetched fare up to the list, so "sort by cheapest" can rank the
     * routes someone has actually priced. Prices are per-card and on demand, so
     * without this the list has no idea what anything costs.
     */
    onPriced?: (price: number | null) => void;
    /**
     * Fare already worked out for this route, shown without anyone asking.
     * Ryanair legs price from a free API in milliseconds, so making people
     * click for them was asking permission the request did not need.
     */
    autoPrice?: ItineraryPrice | null;
    /** True while the auto price for this route is still being fetched. */
    autoPricing?: boolean;
    /**
     * Fares the traveller recorded themselves, by leg key, for the legs no free
     * source can price. Looked up per leg so one sighting completes every
     * itinerary that shares it.
     */
    observedFares?: Record<string, ObservedFare>;
    onObserveFare?: (origin: string, destination: string, date: string, price: number) => void;
    onForgetFare?: (origin: string, destination: string, date: string) => void;
}

interface LegRowProps {
    leg: HackerFlightLeg;
    label: string;
    /** Resolves an airport code to what the backend knows about that place. */
    placeFor: (iata?: string | null) => AirportRef | null;
    /** Resolved calendar dates for this leg, or null when times are missing. */
    schedule: LegSchedule | null;
    /** Fallback travel date for the booking links when the leg has no schedule. */
    fallbackDate: string;
}

/** One flight row: carrier, route, its own date, times, booking links. */
const LegRow: React.FC<LegRowProps> = ({ leg, label, schedule, fallbackDate, placeFor }) => {
    const brands = operatorBrands(leg.airlineCodes);
    const departure = schedule?.departure ?? null;
    const arrival = schedule?.arrival ?? null;
    // Every leg books on its OWN date. An overnight self-transfer's second
    // ticket is for tomorrow, and sending that search to the airline under
    // today's date is how people end up on the wrong flight.
    const bookingDate = departure?.date ?? fallbackDate;
    // Airline convention: a clock time that belongs to a later day carries the
    // day count, so 00:45 on the far side of midnight cannot read as this morning.
    const nightsLater = arrival && departure ? arrival.dayOffset - departure.dayOffset : 0;

    return (
        <div className="hacker-route-card__leg">
            <div className="hacker-route-card__leg-top">
                {brands.length > 0 && <AirlineLogo code={brands[0].code} size={22} labelled />}
                <span className="hacker-route-card__leg-label">{label}</span>
                <strong>{leg.origin} → {leg.destination}</strong>
                {departure && (
                    <span className="hacker-route-card__leg-date">{formatLegDate(departure.date)}</span>
                )}
                <span className="hacker-route-card__leg-times">
                    {departure?.clock ?? formatClock(leg.departureTime)}
                    {' → '}
                    {arrival?.clock ?? formatClock(leg.arrivalTime)}
                    {nightsLater > 0 && (
                        <sup className="hacker-route-card__next-day" title={`Lands ${formatLegDate(arrival!.date)}`}>
                            +{nightsLater}
                        </sup>
                    )}
                    {/* Time in the air for THIS flight. The banner above gives
                        the whole journey including the wait at the hub, which is
                        a different and much larger number. */}
                    {schedule?.durationMinutes != null && (
                        <span className="hacker-route-card__leg-duration">
                            {formatDuration(schedule.durationMinutes)}
                        </span>
                    )}
                </span>
            </div>
            {brands.length > 0 && (
                <div className="hacker-route-card__operated">
                    Operated by {brands.map((brand) => brand.name).join(' · ')}
                </div>
            )}
            <BookingLinks
                origin={leg.origin}
                destination={leg.destination}
                date={bookingDate}
                carriers={leg.airlineCodes}
                departureTime={departure?.clock ?? leg.departureTime}
                arrivalTime={arrival?.clock ?? leg.arrivalTime}
                originPlace={placeFor(leg.origin)}
                destinationPlace={placeFor(leg.destination)}
            />
        </div>
    );
};

const HackerRouteCard: React.FC<HackerRouteCardProps> = ({
    itinerary, date, onPriced, autoPrice = null, autoPricing = false,
    observedFares = {}, onObserveFare, onForgetFare,
}) => {
    const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [price, setPrice] = useState<HackerPriceResponse | null>(null);

    const isDirect = itinerary.type === 'DIRECT';

    // Union of every carrier across the itinerary's flights, for the chip row.
    const airlines: AirlineBrand[] = operatorBrands([
        ...(itinerary.leg1.airlineCodes ?? []),
        ...(itinerary.leg2?.airlineCodes ?? []),
    ]);

    // The backend resolves each stop against the full airport table, so a hub
    // the curated metadata has never heard of still has a city and a country.
    const placeFor = (iata?: string | null): AirportRef | null => {
        if (!iata) return null;
        const code = iata.toUpperCase();
        return [itinerary.originAirport, itinerary.hubAirport, itinerary.destinationAirport]
            .find((airport) => airport?.iata?.toUpperCase() === code) ?? null;
    };

    // Clock times resolved to real dates, so an overnight layover is legible.
    const schedule = itinerarySchedule(itinerary, date);
    const departurePoint: ScheduledPoint | null = schedule.leg1.departure;
    const arrivalPoint: ScheduledPoint | null = (schedule.leg2 ?? schedule.leg1).arrival;
    const daysSpanned = departurePoint && arrivalPoint ? arrivalPoint.dayOffset - departurePoint.dayOffset : 0;

    // Which legs the price call actually managed to fare, and which it did not.
    // Only meaningful once a manual fetch has returned; the auto path never runs
    // on a mixed itinerary in the first place.
    const legOutcomes = [
        { fare: price?.leg1, leg: itinerary.leg1, label: isDirect ? 'Flight' : 'Leg 1' },
        { fare: price?.leg2, leg: itinerary.leg2, label: 'Leg 2' },
    ].filter((entry) => entry.leg != null);

    // A leg's own date, so a sighting is filed against the day it was for.
    const legDate = (index: 0 | 1): string => (
        (index === 0 ? schedule.leg1.departure?.date : schedule.leg2?.departure?.date) ?? date
    );

    const enriched = legOutcomes.map((entry, index) => {
        const position = (index === 0 ? 0 : 1) as 0 | 1;
        const on = legDate(position);
        const key = observedFareKey(entry.leg!.origin ?? '', entry.leg!.destination ?? '', on);
        return {
            ...entry,
            date: on,
            route: `${entry.leg!.origin} → ${entry.leg!.destination}`,
            observed: observedFares[key] ?? null,
        };
    });

    const pricedLegs = enriched
        .filter((entry) => entry.fare?.price != null)
        .map((entry) => ({ label: entry.label, price: entry.fare!.price as number }));

    // Legs with no fetched fare but a fare the traveller entered themselves.
    const observedLegs = enriched
        .filter((entry) => entry.fare?.price == null && entry.observed != null)
        .map((entry) => ({ label: entry.label, price: entry.observed!.price }));

    /**
     * Why a leg has no price — the two reasons are not the same thing.
     *
     * A Vueling leg is unpriced because nothing free can price Vueling. A
     * RYANAIR leg is unpriced because Ryanair published no fare for that route
     * on that date, which usually means it does not fly it that day. Saying
     * "no free fare source" about a flight the card itself labels "Operated by
     * Ryanair" is simply untrue, and it sends people hunting for a price that
     * was never missing — the flight was.
     */
    const unpricedLegs = enriched
        .filter((entry) => entry.fare?.price == null && entry.observed == null)
        .map((entry) => ({
            label: entry.label,
            route: entry.route,
            reason: isRyanairLeg(entry.leg?.airlineCodes)
                ? `${entry.route} has no Ryanair fare on ${formatLegDate(entry.date)} — it may not fly that day`
                : `${entry.route} has no free fare source`,
        }));

    /**
     * A journey total once every leg has a number, whatever its source.
     *
     * Only worth showing when nothing is missing: a total that quietly omits a
     * leg is the one number on this card that could actually mislead someone
     * into booking. Mixed provenance is fine as long as it is declared.
     */
    const completedTotal = unpricedLegs.length === 0 && observedLegs.length > 0
        ? Math.round([...pricedLegs, ...observedLegs].reduce((sum, leg) => sum + leg.price, 0) * 100) / 100
        : null;

    // Honest cost for a manually fetched price, the same way the auto path does it.
    const manualHonest = honestCostOf([
        { price: price?.leg1?.price ?? null, antiCauchemar: price?.leg1?.antiCauchemar },
        ...(itinerary.leg2 && price?.leg2
            ? [{ price: price.leg2.price ?? null, antiCauchemar: price.leg2.antiCauchemar }]
            : []),
    ]);

    /** The fare-entry row, shown per leg that no free source can price. */
    const fareEntryRows = enriched.filter((entry) => entry.fare?.price == null && onObserveFare);

    const getLivePrice = async () => {
        setPriceStatus('loading');
        try {
            const result = await fetchHackerRoutePrice(itinerary, date);
            setPrice(result);
            setPriceStatus('done');
            onPriced?.(result.combinedPrice ?? null);
        } catch {
            setPriceStatus('error');
        }
    };

    return (
        <article className="hacker-route-card">
            <header className="hacker-route-card__head">
                <div className="hacker-route-card__route">
                    <span className="hacker-route-card__code">{itinerary.origin}</span>
                    {!isDirect && (
                        <>
                            <FontAwesomeIcon icon={faArrowRightLong} className="hacker-route-card__arrow" />
                            <span className="hacker-route-card__code hacker-route-card__code--hub">{itinerary.hub}</span>
                        </>
                    )}
                    <FontAwesomeIcon icon={faArrowRightLong} className="hacker-route-card__arrow" />
                    <span className="hacker-route-card__code">{itinerary.destination}</span>
                </div>
                <div className="hacker-route-card__head-meta">
                    {departurePoint && (
                        <span className="hacker-route-card__head-date">
                            {formatLegDate(departurePoint.date)}
                            {daysSpanned > 0 && (
                                <span className="hacker-route-card__head-until">
                                    {' → '}{formatLegDate(arrivalPoint!.date)}
                                </span>
                            )}
                        </span>
                    )}
                    <span className={`hacker-route-card__type-badge ${isDirect ? 'hacker-route-card__type-badge--direct' : ''}`}>
                        {isDirect ? 'Direct' : '2 flights'}
                    </span>
                </div>
            </header>

            {isDirect ? (
                <div className="hacker-route-card__layover hacker-route-card__layover--direct" role="note">
                    <FontAwesomeIcon icon={faPlaneUp} />
                    <span>
                        Direct flight · total journey <strong>{formatDuration(itinerary.totalJourneyMinutes)}</strong>
                    </span>
                </div>
            ) : (
                <div className="hacker-route-card__layover" role="note">
                    <FontAwesomeIcon icon={faPlaneUp} />
                    <span>
                        <strong>{formatDuration(itinerary.layoverMinutes)}</strong> layover at {itinerary.hub}
                        {' · '}total journey <strong>{formatDuration(itinerary.totalJourneyMinutes)}</strong>
                    </span>
                </div>
            )}

            <div className="hacker-route-card__airlines">
                {airlines.map((brand) => (
                    <span key={brand.name} className="hacker-route-card__airline">
                        <AirlineLogo code={brand.code} size={16} labelled />
                        {brand.name}
                    </span>
                ))}
            </div>

            <div className="hacker-route-card__legs">
                <LegRow
                    leg={itinerary.leg1}
                    label={isDirect ? 'Flight' : 'Leg 1'}
                    schedule={schedule.leg1}
                    fallbackDate={date}
                    placeFor={placeFor}
                />
                {!isDirect && itinerary.leg2 && (
                    <LegRow
                        leg={itinerary.leg2}
                        label="Leg 2"
                        schedule={schedule.leg2}
                        fallbackDate={date}
                        placeFor={placeFor}
                    />
                )}
            </div>

            <div className="hacker-route-card__price-row">
                {/* A price the page already worked out beats a button, and a
                    fetched one beats both — someone who pressed the button did
                    so to refresh, so their answer wins. */}
                {priceStatus === 'done' && price ? (
                    <div className="hacker-route-card__price">
                        {price.combinedPrice != null ? (
                            <>
                                <span className="hacker-route-card__price-total">
                                    from {euro(manualHonest.honestTotal ?? price.combinedPrice)}
                                </span>
                                {manualHonest.honestTotal != null && (
                                    <span className="hacker-route-card__honest" title={HONEST_CAVEAT}>
                                        honest total · fare {euro(price.combinedPrice)} + {euro(manualHonest.extras ?? 0)} extras
                                        {manualHonest.cabinBags > 1 && ` · ${manualHonest.cabinBags} cabin bags`}
                                    </span>
                                )}
                                <span className="hacker-route-card__price-note" title={FLOOR_CAVEAT}>
                                    {isDirect
                                        ? 'cheapest fare that day'
                                        : `cheapest fares that day · ${price.leg1.price != null ? euro(price.leg1.price) : '?'} + ${price.leg2?.price != null ? euro(price.leg2.price) : '?'} (separate tickets)`}
                                </span>
                            </>
                        ) : completedTotal !== null ? (
                            <>
                                {/* Every leg has a number, but not every number
                                    came from the same place — so the total is
                                    shown with its provenance attached rather
                                    than as a quoted fare. */}
                                <span className="hacker-route-card__price-total hacker-route-card__price-total--observed">
                                    ≈ {euro(completedTotal)}
                                </span>
                                <span className="hacker-route-card__price-note" title={OBSERVED_CAVEAT}>
                                    {[
                                        pricedLegs.length > 0
                                            ? `${pricedLegs.map((leg) => euro(leg.price)).join(' + ')} live`
                                            : null,
                                        `${observedLegs.map((leg) => euro(leg.price)).join(' + ')} you saw`,
                                    ].filter(Boolean).join(' + ')}
                                    {' (separate tickets)'}
                                </span>
                            </>
                        ) : pricedLegs.length > 0 ? (
                            <>
                                {/* Half a journey's fare is still worth having.
                                    A Ryanair hop paired with a Vueling one used
                                    to throw away the €26 it had just fetched and
                                    say "unavailable", when what it really knew
                                    was the price of one leg and nothing about
                                    the other. The "+ ?" is doing the work here:
                                    it has to be impossible to read this as the
                                    cost of the whole trip. */}
                                <span className="hacker-route-card__price-total hacker-route-card__price-total--partial">
                                    {pricedLegs.map((leg) => euro(leg.price)).join(' + ')} + ?
                                </span>
                                <span className="hacker-route-card__price-note" title={PARTIAL_CAVEAT}>
                                    {`${pricedLegs.map((leg) => leg.label).join(' and ')} only — `}
                                    {unpricedLegs.map((leg) => leg.reason).join(', ')}
                                    {'. Use its booking links for the rest.'}
                                </span>
                            </>
                        ) : (
                            <span className="hacker-route-card__price-note">Live price unavailable right now — use the booking links above.</span>
                        )}
                    </div>
                ) : autoPrice ? (
                    <div className={`hacker-route-card__price ${autoPrice.exact ? 'hacker-route-card__price--exact' : ''}`}>
                        {/* "from" only where it is earned. An itinerary built from
                            the day's cheapest departures really does cost this;
                            one merely sharing their day does not, and the two
                            must not look identical. */}
                        <span className="hacker-route-card__price-total">
                            {(() => {
                                const headline = autoPrice.honestTotal ?? autoPrice.total;
                                return autoPrice.exact ? euro(headline) : `from ${euro(headline)}`;
                            })()}
                        </span>
                        {autoPrice.honestTotal != null && (
                            <span className="hacker-route-card__honest" title={HONEST_CAVEAT}>
                                honest total · fare {euro(autoPrice.total)} + {euro(autoPrice.extras ?? 0)} extras
                                {autoPrice.cabinBags > 1 && ` · ${autoPrice.cabinBags} cabin bags`}
                            </span>
                        )}
                        <span
                            className="hacker-route-card__price-note"
                            title={autoPrice.exact ? EXACT_CAVEAT : FLOOR_CAVEAT}
                        >
                            {autoPrice.exact
                                ? (isDirect
                                    ? 'fare for this flight'
                                    : `${autoPrice.leg1 != null ? euro(autoPrice.leg1) : '?'} + ${autoPrice.leg2 != null ? euro(autoPrice.leg2) : '?'} — fares for these flights (separate tickets)`)
                                : `route floor · cheapest ${autoPrice.farePoints.length > 1 ? 'departures' : 'departure'} ${autoPrice.farePoints.map((point) => `${point.clock} on leg ${point.leg}`).join(', ')}`}
                        </span>
                    </div>
                ) : autoPricing ? (
                    <span className="hacker-route-card__price-note" role="status">Pricing…</span>
                ) : (
                    <button
                        type="button"
                        className="hacker-route-card__price-cta"
                        onClick={getLivePrice}
                        disabled={priceStatus === 'loading'}
                    >
                        <FontAwesomeIcon icon={faBolt} />
                        {priceStatus === 'loading' ? 'Fetching live price…' : 'Get Live Price'}
                    </button>
                )}
                {priceStatus === 'error' && (
                    <span className="hacker-route-card__price-note hacker-route-card__price-note--error">
                        Couldn't fetch a live price — the booking links still work.
                    </span>
                )}

                {/* Only offered once a fetch has come back empty for a leg —
                    asking before then would invite typing in a number the page
                    was about to find for free. */}
                {priceStatus === 'done' && fareEntryRows.length > 0 && (
                    <div className="hacker-route-card__observed">
                        {fareEntryRows.map((entry) => (
                            <ObservedFareInput
                                key={entry.route}
                                route={entry.route}
                                observed={entry.observed}
                                onSave={(value) => onObserveFare?.(
                                    entry.leg!.origin ?? '', entry.leg!.destination ?? '', entry.date, value,
                                )}
                                onForget={() => onForgetFare?.(
                                    entry.leg!.origin ?? '', entry.leg!.destination ?? '', entry.date,
                                )}
                            />
                        ))}
                    </div>
                )}
            </div>
        </article>
    );
};

export default HackerRouteCard;
