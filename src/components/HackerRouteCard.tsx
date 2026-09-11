import { faArrowRightLong, faBolt, faCartPlus, faCheck, faChevronDown, faChevronUp, faPlaneUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import { AirlineBrand, operatorBrands, splitOperators } from '../data/airlines';
import { airportTitle, cityName, cityWithCode } from '../services/airportLabels';
import { CartEstimate } from '../services/flightCart';
import { ItineraryPrice, honestCostOf, isRyanairLeg, legPriceKey } from '../services/hackerAutoPrice';
import {
    AirportRef,
    HackerFlightLeg,
    HackerItinerary,
    HackerLegPrice,
    HackerPriceResponse,
    LegFare,
    fetchHackerRoutePrice,
} from '../services/hackerRoutes';
import { euro, formatClock, formatDuration, formatLocalClock } from '../services/flightFormat';
import { clockMinutes } from '../services/hackFlightSort';
import { LegSchedule, ScheduledPoint, formatLegDate, itinerarySchedule } from '../services/itinerarySchedule';
import {
    ObservedFare,
    ObservedFlight,
    isObservedFareFresh,
    observedFareKey,
} from '../services/observedFares';
import { isRecentlySeen, rememberSessionFares } from '../services/sessionFares';
import AirlineLogo from './AirlineLogo';
import BookingLinks from './BookingLinks';
import ObservedFareInput from './ObservedFareInput';
import './HackerRouteCard.css';

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

/**
 * Above this, a connection has room to reclaim a hold bag and check it in
 * again. Below it, the routing only works if you are carrying everything —
 * which is a condition of the itinerary, not a detail, so the card says it
 * rather than leaving someone to discover it at a baggage belt.
 */
const COMFORTABLE_LAYOVER_MINUTES = 120;

/**
 * Said in full, on the card, not behind a hover — there is no hover on a phone,
 * and this is the sentence that decides whether someone should book the routing
 * at all.
 */
const TIGHT_CONNECTION_WARNING = 'Separate tickets. This is under 2 hours: do not use it with '
    + 'checked luggage, allow for delays, and accept that the onward airline is not responsible '
    + 'if you miss it.';

const CODESHARE_CAVEAT = 'These airlines sell seats on this flight under their own code but fly '
    + 'none of it — their network is on another continent. The fare is the operating airline\'s, so '
    + 'look it up there rather than on theirs.';

const HONEST_CAVEAT = 'Fare plus the costs nobody quotes: the cabin bag and the airport transfer. '
    + 'A self-transfer is two separate tickets, so it carries two of each — which is often what '
    + 'decides whether it really beats the direct flight.';

const OBSERVED_CAVEAT = 'Part of this total is a price you entered yourself after looking it up, '
    + 'not a fare any source quoted us. It is stored on this device only, and it is only as '
    + 'current as the day you saw it — re-check before booking.';

const EXACT_CAVEAT = 'Ryanair\'s cheapest fare that day is for exactly these departures, so this '
    + 'is what this itinerary costs.';

const SEEN_CAVEAT = 'This fare came back earlier in this browsing session and has been kept for '
    + 'the rest of today rather than asked for again. It is what the feed said at that moment, not '
    + 'a fresh quote — re-check on the booking links before paying.';

/**
 * What the extras are made of.
 *
 * "fare €15 + €89 extras" is a number nobody can act on — and on a €15 fare it
 * reads as a mistake. Named, it is two facts: a bag fee the traveller can
 * delete by not taking a bag, and a transfer they cannot.
 */
const extrasBreakdown = (parts: {
    bagCost: number;
    transferCost: number;
    lateArrivalCost: number;
    frictionCost: number;
    cabinBags: number;
    extras: number | null;
}): string => {
    const named: string[] = [];
    if (parts.bagCost > 0) {
        named.push(`${parts.cabinBags > 1 ? `${parts.cabinBags} cabin bags` : 'cabin bag'} ${euro(parts.bagCost)}`);
    }
    if (parts.transferCost > 0) {
        named.push(`airport transfer ${euro(parts.transferCost)}`);
    }
    // The single largest surprise on a cheap late flight, and the one that made
    // the old "+ €89 extras" unreadable: a €15 fare landing at 23:55 carries a
    // €60 taxi because the buses have stopped.
    if (parts.lateArrivalCost > 0) {
        named.push(`late-night taxi ${euro(parts.lateArrivalCost)}`);
    }
    if (parts.frictionCost > 0) {
        named.push(`airport risk margin ${euro(parts.frictionCost)}`);
    }
    const accounted = parts.bagCost + parts.transferCost + parts.lateArrivalCost + parts.frictionCost;
    const rest = Math.round(((parts.extras ?? 0) - accounted) * 100) / 100;
    if (rest >= 1) {
        named.push(`other ${euro(rest)}`);
    }
    return named.join(' · ');
};

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
    onObserveFare?: (flight: ObservedFlight, price: number) => void;
    onForgetFare?: (flight: ObservedFlight) => void;
    /**
     * Puts this route in the trip cart. The card hands up the price it is
     * currently showing, with the provenance attached — the cart's total is
     * only as honest as what each card knew when it was picked.
     *
     * Absent on surfaces with no cart, where the card shows no select button.
     */
    onSelect?: (estimate: CartEstimate) => void;
    /** "Select outbound" / "Select return" — which half of the trip this is. */
    selectLabel?: string;
    /** True when this is the route the cart already holds for that half. */
    selected?: boolean;
    /**
     * The traveller carries a small bag only, so the cabin-bag fee comes out
     * of every honest total on this card. Display-only: the fare is untouched.
     */
    smallBagOnly?: boolean;
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
    /**
     * Who might be flying this, and who is only selling it.
     *
     * The provider merges every marketing carrier into one list, so a Madrid–
     * Ibiza hop reads "American Airlines · Iberia Express · Vueling" and the
     * card used to call all three the operator. It matters here more than it
     * looks: most legs on this page carry no fare, so the name on this line is
     * how someone decides whose site to open to go and find one.
     */
    const { operators, codeshares } = splitOperators(leg.airlineCodes, schedule?.durationMinutes);
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
                {operators.length > 0 && <AirlineLogo code={operators[0].code} size={22} labelled />}
                <span className="hacker-route-card__leg-label">{label}</span>
                <strong>
                    <span title={airportTitle(leg.origin, placeFor(leg.origin))}>
                        {cityWithCode(leg.origin, placeFor(leg.origin))}
                    </span>
                    {' → '}
                    <span title={airportTitle(leg.destination, placeFor(leg.destination))}>
                        {cityWithCode(leg.destination, placeFor(leg.destination))}
                    </span>
                </strong>
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
            {operators.length > 0 && (
                <div className="hacker-route-card__operated">
                    {/* "or" where the field is narrowed but not resolved. Two
                        airlines with an "or" between them is a smaller and far
                        more useful claim than six with dots. */}
                    Operated by {operators.map((brand) => brand.name).join(codeshares.length > 0 ? ' or ' : ' · ')}
                    {codeshares.length > 0 && (
                        <span className="hacker-route-card__codeshare" title={CODESHARE_CAVEAT}>
                            {' · also sold by '}
                            {codeshares.map((brand) => brand.name).join(', ')}
                        </span>
                    )}
                </div>
            )}
            <BookingLinks
                origin={leg.origin}
                destination={leg.destination}
                date={bookingDate}
                carriers={leg.airlineCodes}
                durationMinutes={schedule?.durationMinutes}
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
    onSelect, selectLabel = 'Add to trip', selected = false, smallBagOnly = false,
}) => {
    const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [price, setPrice] = useState<HackerPriceResponse | null>(null);
    // Per-leg times and partner links, folded away until this route is the one
    // being considered — collapsed is how a list of 22 stays readable.
    const [expanded, setExpanded] = useState(false);

    const isDirect = itinerary.type === 'DIRECT';
    // Short enough that reclaiming and re-checking a hold bag will not fit.
    const isTightConnection = !isDirect
        && Number.isFinite(itinerary.layoverMinutes)
        && itinerary.layoverMinutes < COMFORTABLE_LAYOVER_MINUTES;

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

    /**
     * The chip row: who is flying this itinerary, across both its flights.
     *
     * Split per LEG, because a leg's own duration is what says whether a
     * long-haul carrier on it can be the operator — and then unioned, so a
     * carrier that genuinely operates one leg is never demoted on the strength
     * of merely being sold on the other.
     */
    const legSplits = [
        splitOperators(itinerary.leg1.airlineCodes, schedule.leg1.durationMinutes),
        ...(itinerary.leg2 ? [splitOperators(itinerary.leg2.airlineCodes, schedule.leg2?.durationMinutes)] : []),
    ];
    const airlines: AirlineBrand[] = operatorBrands(legSplits.flatMap((split) => split.operators.map((brand) => brand.code)));
    const soldBy: AirlineBrand[] = operatorBrands(legSplits.flatMap((split) => split.codeshares.map((brand) => brand.code)))
        .filter((brand) => !airlines.some((operator) => operator.name === brand.name));
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
        // Identity of the exact flight, not just the route and day — two
        // carriers fly this pair and a price belongs to one of them.
        const flight: ObservedFlight = {
            origin: entry.leg!.origin ?? '',
            destination: entry.leg!.destination ?? '',
            date: on,
            carriers: entry.leg!.airlineCodes,
            departureTime: entry.leg!.departureTime,
        };
        const sighting = observedFares[observedFareKey(flight)] ?? null;
        return {
            ...entry,
            flight,
            date: on,
            route: `${entry.leg!.origin} → ${entry.leg!.destination}`,
            // Still shown, so it can be seen and refreshed — but an expired
            // sighting does not count towards a price.
            observed: sighting,
            usableObserved: isObservedFareFresh(sighting) ? sighting : null,
        };
    });

    const pricedLegs = enriched
        .filter((entry) => entry.fare?.price != null)
        .map((entry) => ({ label: entry.label, price: entry.fare!.price as number }));

    // Legs with no fetched fare but a fare the traveller entered themselves.
    const observedLegs = enriched
        .filter((entry) => entry.fare?.price == null && entry.usableObserved != null)
        .map((entry) => ({ label: entry.label, price: entry.usableObserved!.price }));

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
        .filter((entry) => entry.fare?.price == null && entry.usableObserved == null)
        .map((entry) => ({
            label: entry.label,
            route: entry.route,
            // No error branch here: this path only runs after a manual fetch
            // that RETURNED, so a null price is the feed's answer, never a
            // failed request. A failed lookup surfaces as the retry state above.
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

    /**
     * Does the fare just fetched belong to the flights on this card?
     *
     * The button used to answer "cheapest fare that day" whatever came back,
     * which was safe but under-claimed: the response carries the departure its
     * fare is for, and roughly two thirds of the time that IS the flight shown.
     * Saying so matters because somebody pressed the button to price THIS
     * routing — leaving a matched fare labelled as somebody else's flight's
     * price sends them to re-check a number that needed no re-checking.
     *
     * Same rule as the automatic path in `hackerAutoPrice`: equal to the minute
     * or it is another departure's fare. Unknown on either side is not a match.
     */
    const fareIsForThisFlight = (
        fare: HackerLegPrice | null | undefined,
        scheduled?: string | null,
    ): boolean => {
        if (fare?.price == null) return false;
        const fareMinutes = clockMinutes(fare.departure);
        const flightMinutes = clockMinutes(scheduled);
        return fareMinutes !== null && flightMinutes !== null && fareMinutes === flightMinutes;
    };

    const manualExact = price != null
        && price.combinedPrice != null
        && fareIsForThisFlight(price.leg1, schedule.leg1.departure?.clock ?? itinerary.leg1.departureTime)
        && (!itinerary.leg2 || fareIsForThisFlight(price.leg2, schedule.leg2?.departure?.clock ?? itinerary.leg2.departureTime));

        // Honest cost for a manually fetched price, the same way the auto path does it.
    const manualHonest = honestCostOf([
        { price: price?.leg1?.price ?? null, antiCauchemar: price?.leg1?.antiCauchemar },
        ...(itinerary.leg2 && price?.leg2
            ? [{ price: price.leg2.price ?? null, antiCauchemar: price.leg2.antiCauchemar }]
            : []),
    ], { smallBagOnly });

    /**
     * The price this card is currently showing, handed to the cart with its
     * provenance intact — a route floor must not land in a trip total looking
     * like a fare somebody was quoted.
     */
    const cartEstimate = (): CartEstimate => {
        if (priceStatus === 'done' && price?.combinedPrice != null) {
            // The response DOES say which departure its fare is for, so a
            // fetched price is a floor only when that departure is not the one
            // on this card. A trip total must not inherit a caveat the fare
            // itself has cleared.
            return {
                fare: price.combinedPrice,
                honest: manualHonest.honestTotal,
                basis: manualExact ? 'exact' : 'floor',
            };
        }
        if (completedTotal !== null) {
            return { fare: completedTotal, honest: null, basis: 'observed' };
        }
        if (autoPrice) {
            return {
                fare: autoPrice.total,
                honest: autoPrice.honestTotal,
                // A total leaning on a fare the traveller typed is theirs, not
                // one anybody quoted us — the trip total has to say so.
                basis: autoPrice.observedLegs > 0 ? 'observed' : autoPrice.exact ? 'exact' : 'floor',
            };
        }
        return { fare: null, honest: null, basis: 'unknown' };
    };

    /** The fare-entry row, shown per leg that no free source can price. */
    const fareEntryRows = enriched.filter((entry) => entry.fare?.price == null && onObserveFare);

    /**
     * Legs the feed priced with a DIFFERENT departure's fare.
     *
     * Ryanair publishes one fare per route per day, so a 17:15 flight is quoted
     * the 08:35 one's €21.99 when the real fare is €34.78. Nothing free can
     * close that gap — the per-flight endpoint answers "Availability declined"
     * — but the person reading the card has the number in front of them, so
     * the entry box is offered here too rather than only where a leg is
     * unpriced. A leg already carrying a sighting keeps its box, so what was
     * entered can be seen, corrected or removed.
     */
    const floorLegs = new Set(autoPrice && !autoPrice.exact ? autoPrice.farePoints.map((point) => point.leg) : []);
    const autoEntryRows = autoPrice && onObserveFare
        ? enriched.filter((entry, index) => floorLegs.has(index === 0 ? 1 : 2) || entry.observed != null)
        : [];

    const getLivePrice = async () => {
        setPriceStatus('loading');
        try {
            const result = await fetchHackerRoutePrice(itinerary, date);
            setPrice(result);
            setPriceStatus('done');
            // Filed under the same keys the automatic path uses, so a fare
            // someone asked for by hand is not asked for again on the next
            // search. Ryanair legs only: they are the ones the memory is ever
            // consulted about, and storing the rest would be dead data.
            const remembered: Record<string, LegFare> = {};
            const remember = (
                leg: HackerFlightLeg | null | undefined,
                fare: HackerLegPrice | undefined,
                position: 0 | 1,
            ): void => {
                if (!leg?.origin || !leg?.destination || !fare || !isRyanairLeg(leg.airlineCodes)) return;
                remembered[legPriceKey(leg.origin, leg.destination, legDate(position), leg.departureTime)] = {
                    price: fare.price ?? null,
                    departure: fare.departure ?? null,
                    antiCauchemar: fare.antiCauchemar ?? null,
                    // The request came back, so a null price is the feed's
                    // answer rather than a failure to ask.
                    status: fare.price == null ? 'unpriced' : 'priced',
                };
            };
            remember(itinerary.leg1, result.leg1, 0);
            remember(itinerary.leg2, result.leg2, 1);
            rememberSessionFares(remembered);

            // Report the FARE, because that is the number the card leads with
            // and the list has to rank on what the traveller is reading.
            const honest = honestCostOf([
                { price: result.leg1?.price ?? null, antiCauchemar: result.leg1?.antiCauchemar },
                ...(itinerary.leg2 && result.leg2
                    ? [{ price: result.leg2.price ?? null, antiCauchemar: result.leg2.antiCauchemar }]
                    : []),
            ], { smallBagOnly });
            onPriced?.(result.combinedPrice ?? honest.honestTotal ?? null);
        } catch {
            setPriceStatus('error');
        }
    };

    return (
        <article className={[
            'hacker-route-card',
            expanded ? 'hacker-route-card--open' : '',
            selected ? 'hacker-route-card--selected' : '',
        ].filter(Boolean).join(' ')}>
            {/* Summary and price sit side by side, the way every flight
                metasearch lays a result out: what the journey IS on the left,
                what it COSTS on the right, and the booking detail folded away
                until someone picks this one. Twenty-two routes each carrying
                three rows of partner links is a wall, not a result list. */}
            <div className="hacker-route-card__main">
                <div className="hacker-route-card__summary">
                    <header className="hacker-route-card__head">
                        {/* Cities here, codes on the timeline below. "SNN → KRK
                            → AGP" is precise and unreadable; a card has room to
                            say Shannon, Kraków and Málaga once. */}
                        <div className="hacker-route-card__route">
                            <span className="hacker-route-card__code" title={airportTitle(itinerary.origin, placeFor(itinerary.origin))}>
                                {cityName(itinerary.origin, placeFor(itinerary.origin))}
                            </span>
                            {!isDirect && (
                                <>
                                    <FontAwesomeIcon icon={faArrowRightLong} className="hacker-route-card__arrow" />
                                    <span
                                        className="hacker-route-card__code hacker-route-card__code--hub"
                                        title={airportTitle(itinerary.hub, placeFor(itinerary.hub))}
                                    >
                                        {cityName(itinerary.hub, placeFor(itinerary.hub))}
                                    </span>
                                </>
                            )}
                            <FontAwesomeIcon icon={faArrowRightLong} className="hacker-route-card__arrow" />
                            <span className="hacker-route-card__code" title={airportTitle(itinerary.destination, placeFor(itinerary.destination))}>
                                {cityName(itinerary.destination, placeFor(itinerary.destination))}
                            </span>
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

                    {/* Take-off → landing, read left to right in one line. The
                        carrier marks sit on the rail beside it, as they do on
                        every other flight list, so the eye lands on the times. */}
                    {/* Take-off → landing runs the full width of the card, the way
                        every flight result is drawn. The carriers used to sit in a
                        column to the left of it, which cost the timeline a third of
                        its width to say something that belongs under it. */}
                    <div className="hacker-route-card__timeline">
                        <div className="hacker-route-card__endpoint">
                            <span className="hacker-route-card__clock">
                                {departurePoint?.clock ?? formatClock(itinerary.leg1.departureTime)}
                            </span>
                            <span className="hacker-route-card__place" title={airportTitle(itinerary.origin, placeFor(itinerary.origin))}>
                                {itinerary.origin}
                            </span>
                        </div>

                        <div className="hacker-route-card__path">
                            <span className="hacker-route-card__path-duration">
                                {formatDuration(itinerary.totalJourneyMinutes)}
                            </span>
                            <span className="hacker-route-card__path-line" aria-hidden="true">
                                {!isDirect && <i className="hacker-route-card__path-stop" />}
                            </span>
                            <span className={`hacker-route-card__path-stops ${isDirect ? 'hacker-route-card__path-stops--direct' : ''}`}>
                                {isDirect ? 'Direct' : `1 stop · ${cityName(itinerary.hub, placeFor(itinerary.hub))}`}
                            </span>
                        </div>

                        <div className="hacker-route-card__endpoint hacker-route-card__endpoint--arrive">
                            <span className="hacker-route-card__clock">
                                {arrivalPoint?.clock ?? formatClock((itinerary.leg2 ?? itinerary.leg1).arrivalTime)}
                                {daysSpanned > 0 && (
                                    <sup
                                        className="hacker-route-card__next-day"
                                        title={`Lands ${formatLegDate(arrivalPoint!.date)}`}
                                    >
                                        +{daysSpanned}
                                    </sup>
                                )}
                            </span>
                            <span className="hacker-route-card__place" title={airportTitle(itinerary.destination, placeFor(itinerary.destination))}>
                                {itinerary.destination}
                            </span>
                        </div>
                    </div>

                    <div className="hacker-route-card__carriers">
                        {airlines.map((brand) => (
                            <span key={brand.name} className="hacker-route-card__airline" title={brand.name}>
                                <AirlineLogo code={brand.code} size={18} labelled />
                                <span className="hacker-route-card__airline-name">{brand.name}</span>
                            </span>
                        ))}
                        {/* Counted, not listed. The airlines that only sell this
                            flight are still worth knowing about — someone may
                            have seen the route under one of their codes — but
                            spelling out six of them is what buried the operator
                            in the first place. */}
                        {soldBy.length > 0 && (
                            <span
                                className="hacker-route-card__airline hacker-route-card__airline--sold"
                                title={`${CODESHARE_CAVEAT} On this itinerary: ${soldBy.map((brand) => brand.name).join(', ')}.`}
                            >
                                +{soldBy.length} selling it
                            </span>
                        )}
                    </div>

                    {/* The connection is the whole catch of a self-transfer, so
                        it stays on the collapsed card — never behind the toggle. */}
                    {!isDirect && (
                        <div
                            className={`hacker-route-card__layover ${isTightConnection ? 'hacker-route-card__layover--tight' : ''}`}
                            role="note"
                        >
                            <FontAwesomeIcon icon={faPlaneUp} />
                            <span>
                                <strong>{formatDuration(itinerary.layoverMinutes)}</strong> layover at{' '}
                                <span title={airportTitle(itinerary.hub, placeFor(itinerary.hub))}>
                                    {cityWithCode(itinerary.hub, placeFor(itinerary.hub))}
                                </span>
                                {' · '}total journey <strong>{formatDuration(itinerary.totalJourneyMinutes)}</strong>
                            </span>
                            {isTightConnection && (
                                <span className="hacker-route-card__cabin-only">Cabin bags only</span>
                            )}
                            {isTightConnection && (
                                <p className="hacker-route-card__tight-warning">{TIGHT_CONNECTION_WARNING}</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="hacker-route-card__rail">
                    {/* A price the page already worked out beats a button, and a
                        fetched one beats both — someone who pressed the button did
                        so to refresh, so their answer wins. */}
                    {priceStatus === 'done' && price ? (
                        <div className="hacker-route-card__price">
                            {price.combinedPrice != null ? (
                                <>
                                    {/* "from" only where it is earned — same rule
                                        the automatic path applies one branch down. */}
                                    <span className="hacker-route-card__price-total">
                                        {manualExact ? euro(price.combinedPrice) : `from ${euro(price.combinedPrice)}`}
                                    </span>
                                    {manualHonest.honestTotal != null && (
                                        <>
                                            <span className="hacker-route-card__honest" title={HONEST_CAVEAT}>
                                                {euro(manualHonest.honestTotal)} all-in{smallBagOnly && ' (small bag)'}
                                            </span>
                                            <span className="hacker-route-card__extras">
                                                {extrasBreakdown(manualHonest)}
                                            </span>
                                        </>
                                    )}
                                    <span
                                        className="hacker-route-card__price-note"
                                        title={manualExact ? EXACT_CAVEAT : FLOOR_CAVEAT}
                                    >
                                        {manualExact
                                            ? (isDirect
                                                ? 'fare for this flight'
                                                : `${price.leg1.price != null ? euro(price.leg1.price) : '?'} + ${price.leg2?.price != null ? euro(price.leg2.price) : '?'} — fares for these flights (separate tickets)`)
                                            : isDirect
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
                                <span className="hacker-route-card__price-note">Live price unavailable right now — use the booking links below.</span>
                            )}
                        </div>
                    ) : autoPrice ? (
                        <div className={`hacker-route-card__price ${autoPrice.exact && autoPrice.observedLegs === 0 ? 'hacker-route-card__price--exact' : ''}`}>
                            {/* "from" only where it is earned. An itinerary built from
                                the day's cheapest departures really does cost this;
                                one merely sharing their day does not, and the two
                                must not look identical. */}
                            {/* The fare, and nothing added to it.
                                This used to lead with the honest total, which
                                meant the biggest number on the card matched
                                nothing the traveller could see on the airline's
                                own site — a €22 Ryanair fare showing as €46
                                because we had added a cabin bag they may not
                                even be carrying. The all-in is still here, one
                                line down, where it informs instead of
                                contradicts. */}
                            <span className="hacker-route-card__price-total">
                                {autoPrice.exact ? euro(autoPrice.total) : `from ${euro(autoPrice.total)}`}
                            </span>
                            {autoPrice.honestTotal != null && (
                                <>
                                    <span className="hacker-route-card__honest" title={HONEST_CAVEAT}>
                                        {euro(autoPrice.honestTotal)} all-in{smallBagOnly && ' (small bag)'}
                                    </span>
                                    <span className="hacker-route-card__extras">
                                        {extrasBreakdown(autoPrice)}
                                    </span>
                                </>
                            )}
                            <span
                                className="hacker-route-card__price-note"
                                title={autoPrice.exact ? EXACT_CAVEAT : FLOOR_CAVEAT}
                            >
                                {autoPrice.exact
                                    ? (isDirect
                                        ? 'fare for this flight'
                                        : `${autoPrice.leg1 != null ? euro(autoPrice.leg1) : '?'} + ${autoPrice.leg2 != null ? euro(autoPrice.leg2) : '?'} — fares for these flights (separate tickets)`)
                                    /* "route floor · cheapest departure 08:35 on leg 1" was
                                       accurate and unreadable. What it means is that this is
                                       somebody else's flight's price. */
                                    : isDirect
                                        ? `cheapest that day (${autoPrice.farePoints.map((point) => point.clock).join(', ')}) — not this ${departurePoint?.clock ?? formatClock(itinerary.leg1.departureTime)} flight`
                                        : `cheapest that day (${autoPrice.farePoints.map((point) => `${point.clock} on leg ${point.leg}`).join(', ')}) — not these flights`}
                            </span>
                            {/* Said plainly, next to the number it changes. */}
                            {autoPrice.observedLegs > 0 && (
                                <span className="hacker-route-card__seen" title={OBSERVED_CAVEAT}>
                                    {autoPrice.observedLegs > 1
                                        ? 'includes two fares you entered'
                                        : 'includes a fare you entered'}
                                </span>
                            )}
                            {/* Kept from earlier in the sitting rather than
                                fetched for this search. Said out loud once it is
                                old enough to matter — a fare from two minutes
                                ago needs no timestamp, one from an hour ago
                                does. */}
                            {autoPrice.seenAt && !isRecentlySeen(autoPrice.seenAt) && (
                                <span className="hacker-route-card__seen" title={SEEN_CAVEAT}>
                                    price seen {formatLocalClock(autoPrice.seenAt)} today
                                </span>
                            )}
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

                    {/* Picking a flight is not buying one — this puts the route
                        in the trip being assembled, and the ticket is still
                        bought on the airline's own site through the links below. */}
                    {onSelect && (
                        <button
                            type="button"
                            className={`hacker-route-card__add ${selected ? 'hacker-route-card__add--selected' : ''}`}
                            onClick={() => onSelect(cartEstimate())}
                            aria-pressed={selected}
                        >
                            <FontAwesomeIcon icon={selected ? faCheck : faCartPlus} aria-hidden="true" />
                            {selected ? 'In your trip' : selectLabel}
                        </button>
                    )}

                    {/* "Booking options", not "Select": this app links out to the
                        airline and the aggregators, it does not sell the ticket,
                        and the button should not pretend otherwise. */}
                    <button
                        type="button"
                        className="hacker-route-card__select"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((open) => !open)}
                    >
                        {expanded ? 'Hide booking options' : 'Booking options'}
                        <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="hacker-route-card__details">
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
            )}

            {/* Only offered once a fetch has come back empty for a leg —
                asking before then would invite typing in a number the page
                was about to find for free. */}
            {(() => {
                const rows = priceStatus === 'done' && fareEntryRows.length > 0 ? fareEntryRows : autoEntryRows;
                if (rows.length === 0) {
                    return null;
                }
                return (
                    <div className="hacker-route-card__observed">
                        {rows.map((entry) => (
                            <ObservedFareInput
                                key={entry.route}
                                route={entry.route}
                                observed={entry.observed}
                                onSave={(value) => onObserveFare?.(entry.flight, value)}
                                onForget={() => onForgetFare?.(entry.flight)}
                            />
                        ))}
                    </div>
                );
            })()}
        </article>
    );
};

export default HackerRouteCard;
