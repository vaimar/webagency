import React, { useCallback, useEffect, useState } from 'react';
import { AirlineBrand, operatorBrands } from '../data/airlines';
import { euro, formatClock, formatDuration } from '../services/flightFormat';
import {
    FlightSortKey,
    clockMinutes,
    hasKnownPrice,
    sortHackerRows,
} from '../services/hackFlightSort';
import {
    ItineraryPrice,
    fetchLegPrices,
    itineraryPrice,
    legPriceKey,
    ryanairLegUnpriced,
    uniqueRyanairLegs,
} from '../services/hackerAutoPrice';
import { airportsFor } from '../data/airportCities';
import { airportTitle, cityName } from '../services/airportLabels';
import { CartDirection, CartEstimate, cartFlightIdFor } from '../services/flightCart';
import { HackerItinerary, fetchHackerRoutes } from '../services/hackerRoutes';
import {
    RememberedFares,
    recallSessionFares,
    rememberSessionFares,
} from '../services/sessionFares';
import { FULL_DAY, HourWindow, isFullDay, withinWindow } from '../services/hourWindow';
import { formatLegDate, itinerarySchedule } from '../services/itinerarySchedule';
import {
    ObservedFares,
    ObservedFlight,
    isObservedFareFresh,
    observedFareKey,
} from '../services/observedFares';
import AirlineLogo from './AirlineLogo';
import FlightSortTabs from './FlightSortTabs';
import HackerRouteCard from './HackerRouteCard';
import TimeRangeFilter from './TimeRangeFilter';

type Status = 'idle' | 'loading' | 'done' | 'error';

/**
 * How many carrier chips to show before folding the rest away.
 *
 * A merged flight lists every marketing carrier on it, so a single search can
 * turn up thirty "airlines" of which two dozen fly nothing on the route — a
 * long tail that buried the filter bar under four rows of chips. Ordered by how
 * many routes they appear on, the ones worth ticking off are all at the front.
 */
const AIRLINE_CHIP_LIMIT = 6;

/**
 * How many airport pairs one search may fan out to.
 *
 * Picking "London" and "Paris" is four airports against three, which is twelve
 * separate route lookups. They are local and free, but twelve is where a
 * "city" stops being a city and starts being a crawl.
 */
const MAX_AIRPORT_PAIRS = 12;

/**
 * How many routings a city search keeps.
 *
 * A single airport pair can return well over a hundred routings on its own, so
 * a dozen pairs is thousands — more than anyone will read, and every distinct
 * leg in them is a fare lookup. Trimmed round-robin rather than by taking the
 * first pairs whole, so every airport is represented in what survives instead
 * of Heathrow filling the list before Beauvais gets a look in.
 */
const MAX_CITY_ROUTES = 120;

/** Every origin airport against every destination airport, capped. */
const airportPairs = (origin: string, destination: string): Array<[string, string]> => (
    airportsFor(origin)
        .flatMap((from) => airportsFor(destination).map((to): [string, string] => [from, to]))
        // A city and one of its own airports would otherwise ask for a flight
        // from a place to itself.
        .filter(([from, to]) => from !== to)
        .slice(0, MAX_AIRPORT_PAIRS)
);

/** One from each list in turn, until the cap — see MAX_CITY_ROUTES. */
const interleave = <T,>(lists: T[][], limit: number): T[] => {
    const merged: T[] = [];
    const longest = Math.max(0, ...lists.map((list) => list.length));
    for (let index = 0; index < longest && merged.length < limit; index += 1) {
        for (const list of lists) {
            if (index < list.length && merged.length < limit) {
                merged.push(list[index]);
            }
        }
    }
    return merged;
};

/**
 * Stable identity for one itinerary in the fetched list. The list order is
 * fixed once fetched, so the position is a safe part of the key — and it is
 * what makes two same-hub, same-clock routes distinguishable. Keys the React
 * list AND the per-route price map, so a fetched fare survives re-sorting.
 */
const itineraryKey = (itinerary: HackerItinerary, index: number): string => [
    itinerary.type,
    itinerary.hub ?? 'direct',
    itinerary.leg1.departureTime ?? '',
    itinerary.leg2?.departureTime ?? '',
    index,
].join('|');

interface HackerResultsProps {
    origin: string;
    destination: string;
    /** YYYY-MM-DD for this direction — the return leg searches its own day. */
    date: string;
    /** "Outbound" / "Return", or absent for a one-way search. */
    heading?: string;
    /** Ordering is shared across directions so both read the same way. */
    sortKey: FlightSortKey;
    onSortChange: (key: FlightSortKey) => void;
    observedFares: ObservedFares;
    onObserveFare: (flight: ObservedFlight, price: number) => void;
    onForgetFare: (flight: ObservedFlight) => void;
    /** Which half of the trip this block fills. Absent = no cart on this surface. */
    direction?: CartDirection;
    /** The route the cart already holds for that half, by id. */
    selectedId?: string | null;
    onSelect?: (itinerary: HackerItinerary, estimate: CartEstimate) => void;
    /** Drop the cabin-bag estimate from every honest total on these results. */
    smallBagOnly?: boolean;
}

/**
 * One direction's worth of Route Hacker results.
 *
 * Owns its own routes, prices, stop filter and hub filter, because a return
 * journey is a different search with different hubs — Shannon to Málaga via
 * Stansted has nothing to do with which hubs work coming home. Remount it (a
 * new key) to run a new search.
 */
const HackerResults: React.FC<HackerResultsProps> = ({
    origin, destination, date, heading, sortKey, onSortChange,
    observedFares, onObserveFare, onForgetFare,
    direction, selectedId = null, onSelect, smallBagOnly = false,
}) => {
    // Starts loading, because a mount IS a search: the page gives this component
    // a key built from its route and date, so new parameters remount it rather
    // than reusing it. Nothing here needs resetting on the way in.
    const [status, setStatus] = useState<Status>('loading');
    const [hackerRoutes, setHackerRoutes] = useState<HackerItinerary[]>([]);
    const [hackerFilter, setHackerFilter] = useState<'all' | 'direct' | 'transfer'>('all');
    // Hubs the traveller has ticked off. Empty = show everything, which is why
    // this stores exclusions rather than inclusions: a hub that appears in a
    // later search is visible by default instead of silently missing.
    const [excludedHubs, setExcludedHubs] = useState<string[]>([]);
    // Same shape, same reason as the hubs: an airline that turns up in a later
    // search is on by default rather than quietly absent.
    const [excludedAirlines, setExcludedAirlines] = useState<string[]>([]);
    // Hour windows for take-off and landing — "after work" and "before the last
    // bus", the two questions a departure board cannot answer by sorting alone.
    const [takeOffWindow, setTakeOffWindow] = useState<HourWindow>(FULL_DAY);
    const [landingWindow, setLandingWindow] = useState<HourWindow>(FULL_DAY);
    const [showAllAirlines, setShowAllAirlines] = useState(false);
    const [hackerPrices, setHackerPrices] = useState<Record<string, number | null>>({});
    // Seeded from what this tab has already fetched today, so a result block
    // that has been mounted before comes back with its prices already on it.
    const [legPrices, setLegPrices] = useState<RememberedFares>(recallSessionFares);
    const [autoPricing, setAutoPricing] = useState(false);
    // What a city search actually covered, for the line that says so. Null on
    // a plain airport-to-airport search, which needs no explanation.
    const [coverage, setCoverage] = useState<{ pairs: Array<[string, string]>; found: number } | null>(null);

    const load = useCallback(() => {
        let cancelled = false;
        void (async () => {
            try {
                // A city is several airports, so it is several searches. They
                // run together and land as one list: what a traveller wants to
                // compare is Beauvais against Charles de Gaulle, and that only
                // works if both are on the same page under the same sort.
                const pairs = airportPairs(origin, destination);
                const answers = await Promise.all(pairs.map(
                    ([from, to]) => fetchHackerRoutes(from, to, date).catch(() => null),
                ));
                if (cancelled) return;
                if (answers.every((answer) => answer === null)) {
                    // Every lookup failed — that is an outage, not an empty
                    // result, and it has to read as one.
                    throw new Error('every route lookup failed');
                }
                const found = answers.reduce((sum, answer) => sum + (answer?.length ?? 0), 0);
                const routes = pairs.length > 1
                    ? interleave(answers.map((answer) => answer ?? []), MAX_CITY_ROUTES)
                    : (answers[0] ?? []);
                setCoverage(pairs.length > 1 ? { pairs, found } : null);
                setHackerRoutes(routes);
                setStatus('done');

                // Ryanair answers a fare in about 45ms from a free API, so the
                // only thing the button was really guarding was volume — and
                // pricing distinct LEGS rather than whole itineraries cuts a
                // 27-route search from 52 lookups to about 13.
                const legs = uniqueRyanairLegs(routes, date);
                if (legs.length === 0) return;

                // Anything already answered today is not asked again: the same
                // Shannon departure feeds a dozen hubs and both directions of a
                // round trip, so by the second search most of the list is
                // already known.
                const known = recallSessionFares();
                if (!cancelled) setLegPrices(known);
                const missing = legs.filter((leg) => (
                    !known[legPriceKey(leg.origin, leg.destination, leg.date, leg.departureTime)]
                ));
                if (missing.length === 0) return;

                setAutoPricing(true);
                try {
                    const fetched = await fetchLegPrices(missing);
                    // Merged into the memory on the way into state, so the next
                    // mount starts where this one finished.
                    const merged = rememberSessionFares(fetched);
                    if (!cancelled) setLegPrices(merged);
                } finally {
                    if (!cancelled) setAutoPricing(false);
                }
            } catch {
                if (!cancelled) setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [origin, destination, date]);

    /** Retry after a failure — an event, so resetting state here is fine. */
    const runSearch = () => {
        setStatus('loading');
        setHackerRoutes([]);
        // Not cleared: a retry is after a failed ROUTE lookup, and the fares
        // this tab already has are still today's.
        setLegPrices(recallSessionFares());
        load();
    };

    useEffect(load, [load]);

    return (
        <section className="hack-flights__leg" aria-label={`${heading ?? 'Route Hacker'} results`}>
            {heading && (
                <div className="hack-flights__leg-head">
                    <h2 className="hack-flights__leg-title">
                        {heading} · <span title={airportTitle(origin)}>{cityName(origin)}</span>
                        {' → '}
                        <span title={airportTitle(destination)}>{cityName(destination)}</span>
                    </h2>
                    <span className="hack-flights__leg-date">{formatLegDate(date)}</span>
                </div>
            )}

            {/* A city search has to say which airports it stood for: "Paris"
                covering Beauvais is the single most surprising thing this page
                does, and it is only useful if it is stated. */}
            {coverage && (
                <p className="hack-flights__coverage" role="status">
                    Searched {coverage.pairs.length} airport {coverage.pairs.length === 1 ? 'pair' : 'pairs'}:{' '}
                    <strong>{airportsFor(origin).join(' · ')}</strong> → <strong>{airportsFor(destination).join(' · ')}</strong>
                    {coverage.found > hackerRoutes.length && (
                        <> · keeping {hackerRoutes.length} of the {coverage.found} routings found, spread evenly across those airports</>
                    )}
                </p>
            )}

                {status === 'loading' && (
                    /* Placeholder rows shaped like the results they become, so
                       the page does not jump when they land. The sentence stays
                       for anyone who cannot see the shapes. */
                    <div className="hack-flights__skeletons">
                        <p className="hack-flights__muted" role="status">
                            Assembling self-transfers from the schedule graph…
                        </p>
                        {[0, 1, 2].map((index) => (
                            <div key={index} className="hack-flights__skeleton" aria-hidden="true">
                                <div className="hack-flights__skeleton-main">
                                    <span className="hack-flights__skeleton-bar hack-flights__skeleton-bar--sm" />
                                    <span className="hack-flights__skeleton-bar hack-flights__skeleton-bar--lg" />
                                    <span className="hack-flights__skeleton-bar hack-flights__skeleton-bar--md" />
                                </div>
                                <div className="hack-flights__skeleton-rail">
                                    <span className="hack-flights__skeleton-bar hack-flights__skeleton-bar--price" />
                                    <span className="hack-flights__skeleton-bar hack-flights__skeleton-bar--btn" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {status === 'error' && (
                    <div className="hack-flights__error" role="alert">
                        <p>The Route Hacker lookup failed.</p>
                        <button type="button" className="hack-flights__retry" onClick={() => void runSearch()}>Try again</button>
                    </div>
                )}
                {status === 'done' && hackerRoutes.length === 0 && (
                    /* "ingest their schedules" was an instruction to the
                       developer, printed at the visitor. Nobody outside this
                       repo can act on it, and it reads as an error message
                       that blames them. */
                    <p className="hack-flights__muted" role="status">
                        No schedule-based routes for {cityName(origin)} → {cityName(destination)} on {date}.
                        Route Hacker only knows the airports whose timetables are loaded so far, and
                        these two are not among them yet. Try <strong>Live deals</strong> for this route instead.
                    </p>
                )}
                {hackerRoutes.length > 0 && (() => {
                    // Rows carry the route, its stable key and whatever price
                    // the card has fetched — everything the sort needs.
                    const allRows = hackerRoutes.map((itinerary, index) => {
                        const key = itineraryKey(itinerary, index);
                        const auto: ItineraryPrice | null = itineraryPrice(itinerary, date, legPrices, smallBagOnly, observedFares);
                        // The same schedule the card renders from, so a route is
                        // filtered on the times the traveller can actually read
                        // on it rather than on the raw clocks behind them.
                        const schedule = itinerarySchedule(itinerary, date);
                        const lastLeg = schedule.leg2 ?? schedule.leg1;
                        return {
                            key,
                            itinerary,
                            auto,
                            departsAt: clockMinutes(schedule.leg1.departure?.clock ?? itinerary.leg1.departureTime),
                            landsAt: clockMinutes(
                                lastLeg.arrival?.clock ?? (itinerary.leg2 ?? itinerary.leg1).arrivalTime,
                            ),
                            airlines: operatorBrands([
                                ...(itinerary.leg1.airlineCodes ?? []),
                                ...(itinerary.leg2?.airlineCodes ?? []),
                            ]),
                            // Someone who pressed the button wanted a fresh
                            // answer, so theirs outranks the automatic one.
                            //
                            // The FARE, because that is the number the cards
                            // lead with: a toolbar reading "from €46" over a
                            // list of €22 cards is the same contradiction the
                            // cards themselves used to carry. Each card still
                            // shows its all-in underneath, which is where the
                            // two-cabin-bag argument against a self-transfer
                            // gets made.
                            price: hackerPrices[key] ?? auto?.total ?? itinerary.price ?? null,
                        };
                    });

                    // Drop routes whose Ryanair leg has no fare on its date.
                    //
                    // The schedule grid works off a weekday pattern held
                    // valid for six months, so it offers flights on days
                    // they do not operate. Ryanair's fare feed answers per
                    // calendar day and is the better witness — if it has
                    // nothing for that leg on that date, the flight almost
                    // certainly is not flying and the whole routing is
                    // built on it. Nothing is hidden until the lookups have
                    // finished, so a route never flickers away mid-search.
                    const rows = autoPricing ? allRows : allRows.filter((row) => !ryanairLegUnpriced(
                        row.itinerary,
                        date,
                        legPrices,
                        // An expired sighting must not keep a route alive: the
                        // fare it vouched for may be weeks stale, and the feed
                        // now says the flight has no fare at all. Matched on the
                        // exact flight, so a price seen on one carrier does not
                        // vouch for another's departure on the same route.
                        (leg, on) => isObservedFareFresh(observedFares[observedFareKey({
                            origin: leg.origin ?? '',
                            destination: leg.destination ?? '',
                            date: on,
                            carriers: leg.airlineCodes,
                            departureTime: leg.departureTime,
                        })]),
                    ));
                    const hiddenCount = allRows.length - rows.length;

                    // Four independent questions, one predicate each.
                    //
                    // They are named rather than inlined because each facet is
                    // then counted against the OTHER three: the number on a hub
                    // chip is how many routes it would give you given everything
                    // else you have set, and a hub you have just unticked keeps
                    // its chip and its count so it can be ticked back on.
                    type Row = (typeof rows)[number];
                    const matchesStops = (row: Row): boolean => (
                        hackerFilter === 'all'
                        || (hackerFilter === 'direct' && row.itinerary.type === 'DIRECT')
                        || (hackerFilter === 'transfer' && row.itinerary.type === 'SELF_TRANSFER')
                    );
                    // A direct flight has no hub to be excluded by.
                    const matchesHubs = (row: Row): boolean => (
                        !row.itinerary.hub || !excludedHubs.includes(row.itinerary.hub)
                    );
                    // A self-transfer flown by two carriers is out as soon as
                    // either of them is unticked: you cannot take the routing
                    // without flying both.
                    const matchesAirlines = (row: Row): boolean => (
                        !row.airlines.some((brand) => excludedAirlines.includes(brand.code))
                    );
                    const matchesTimes = (row: Row): boolean => (
                        withinWindow(row.departsAt, takeOffWindow)
                        && withinWindow(row.landsAt, landingWindow)
                    );

                    const visible = sortHackerRows(rows.filter((row) => (
                        matchesStops(row) && matchesHubs(row) && matchesAirlines(row) && matchesTimes(row)
                    )), sortKey);
                    const forStops = rows.filter((row) => matchesHubs(row) && matchesAirlines(row) && matchesTimes(row));
                    const forHubs = rows.filter((row) => matchesStops(row) && matchesAirlines(row) && matchesTimes(row));
                    const forAirlines = rows.filter((row) => matchesStops(row) && matchesHubs(row) && matchesTimes(row));
                    // Hubs present in what survived, commonest first.
                    const hubCounts = new Map<string, number>();
                    forHubs.forEach((row) => {
                        const hub = row.itinerary.hub;
                        if (hub) hubCounts.set(hub, (hubCounts.get(hub) ?? 0) + 1);
                    });
                    // Whatever the backend knows about each hub, so a chip for an
                    // airport the curated table has never heard of still has a
                    // city name on it.
                    const hubRefs = new Map(rows.flatMap((row) => (
                        row.itinerary.hubAirport?.iata
                            ? [[row.itinerary.hubAirport.iata.toUpperCase(), row.itinerary.hubAirport] as const]
                            : []
                    )));
                    const hubs = Array.from(hubCounts.entries())
                        .sort(([leftHub, left], [rightHub, right]) => right - left || leftHub.localeCompare(rightHub));
                    const toggleHub = (hub: string) => setExcludedHubs((current) => (
                        current.includes(hub) ? current.filter((code) => code !== hub) : [...current, hub]
                    ));

                    // Carriers present in what survived, commonest first — the
                    // same tally as the hubs, because it answers the same kind
                    // of question ("not that one, thanks").
                    const airlineCounts = new Map<string, { brand: AirlineBrand; count: number }>();
                    forAirlines.forEach((row) => row.airlines.forEach((brand) => {
                        const seen = airlineCounts.get(brand.code);
                        if (seen) seen.count += 1;
                        else airlineCounts.set(brand.code, { brand, count: 1 });
                    }));
                    const airlines = Array.from(airlineCounts.values())
                        .sort((left, right) => right.count - left.count || left.brand.name.localeCompare(right.brand.name));
                    const toggleAirline = (code: string) => setExcludedAirlines((current) => (
                        current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]
                    ));
                    // An airline already unticked stays on screen wherever it
                    // sits in the tail — a filter you cannot see is one you
                    // cannot undo.
                    const shownAirlines = showAllAirlines
                        ? airlines
                        : airlines.filter((entry, index) => (
                            index < AIRLINE_CHIP_LIMIT || excludedAirlines.includes(entry.brand.code)
                        ));

                    const filtersActive = excludedHubs.length > 0
                        || excludedAirlines.length > 0
                        || !isFullDay(takeOffWindow)
                        || !isFullDay(landingWindow)
                        || hackerFilter !== 'all';
                    const resetFilters = () => {
                        setExcludedHubs([]);
                        setExcludedAirlines([]);
                        setTakeOffWindow(FULL_DAY);
                        setLandingWindow(FULL_DAY);
                        setHackerFilter('all');
                    };

                    const shownDirect = forStops.filter((row) => row.itinerary.type === 'DIRECT').length;
                    const filters: { key: typeof hackerFilter; label: string }[] = [
                        { key: 'all', label: `All (${forStops.length})` },
                        { key: 'direct', label: `Direct (${shownDirect})` },
                        { key: 'transfer', label: `2 flights (${forStops.length - shownDirect})` },
                    ];
                    // What wins under each ordering — the number every
                    // metasearch prints on its sort tabs, so "is it worth
                    // switching?" is answered without switching. Derived by
                    // running the real comparator, so a tab can never advertise
                    // a figure the list would not actually put first.
                    const bestUnder = (key: FlightSortKey) => sortHackerRows(visible, key)[0] ?? null;
                    const orNull = (value: string): string | null => (value === '—' ? null : value);
                    const cheapest = bestUnder('cheapest');
                    const quickest = bestUnder('duration');
                    const earliest = bestUnder('departure');
                    const lands = bestUnder('arrival');
                    const summaries = {
                        cheapest: cheapest?.price != null ? euro(cheapest.price) : null,
                        departure: orNull(formatClock(earliest?.itinerary.leg1.departureTime)),
                        arrival: orNull(formatClock(
                            (lands?.itinerary.leg2 ?? lands?.itinerary.leg1)?.arrivalTime,
                        )),
                        duration: orNull(formatDuration(quickest?.itinerary.totalJourneyMinutes)),
                    };

                    return (
                        <>
                            <div className="hack-flights__toolbar">
                                <p className="hack-flights__result-count">
                                    <strong>{visible.length}</strong>
                                    {visible.length === 1 ? ' route' : ' routes'}
                                    {summaries.cheapest && <> · from <strong>{summaries.cheapest}</strong></>}
                                </p>
                                <FlightSortTabs value={sortKey} onChange={onSortChange} summaries={summaries} />
                            </div>

                            <div className="hack-flights__filterbar">
                            <div className="hack-flights__hacker-filter" role="group" aria-label="Filter routes by stops">
                                {filters.map((filter) => (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        className={`hack-flights__filter-chip ${hackerFilter === filter.key ? 'hack-flights__filter-chip--active' : ''}`}
                                        aria-pressed={hackerFilter === filter.key}
                                        onClick={() => setHackerFilter(filter.key)}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            <div className="hack-flights__times" role="group" aria-label="Filter routes by time">
                                <TimeRangeFilter label="Take-off" value={takeOffWindow} onChange={setTakeOffWindow} />
                                <TimeRangeFilter label="Landing" value={landingWindow} onChange={setLandingWindow} />
                            </div>

                            {airlines.length > 1 && (
                                <fieldset className="hack-flights__hubs">
                                    <legend className="hack-flights__hubs-legend">Airlines</legend>
                                    {shownAirlines.map(({ brand, count }) => {
                                        const included = !excludedAirlines.includes(brand.code);
                                        return (
                                            <label
                                                key={brand.code}
                                                className={`hack-flights__hub hack-flights__hub--airline ${included ? '' : 'hack-flights__hub--off'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={included}
                                                    onChange={() => toggleAirline(brand.code)}
                                                />
                                                <AirlineLogo code={brand.code} size={16} labelled />
                                                <span>{brand.name}</span>
                                                <em className="hack-flights__hub-count">{count}</em>
                                            </label>
                                        );
                                    })}
                                    {airlines.length > AIRLINE_CHIP_LIMIT && (
                                        <button
                                            type="button"
                                            className="hack-flights__hubs-reset"
                                            onClick={() => setShowAllAirlines((open) => !open)}
                                        >
                                            {showAllAirlines
                                                ? 'Show fewer airlines'
                                                : `Show all ${airlines.length} airlines`}
                                        </button>
                                    )}
                                </fieldset>
                            )}

                            {hubs.length > 1 && (
                                <fieldset className="hack-flights__hubs">
                                    <legend className="hack-flights__hubs-legend">Connect via</legend>
                                    {hubs.map(([hub, count]) => {
                                        const included = !excludedHubs.includes(hub);
                                        return (
                                            <label
                                                key={hub}
                                                className={`hack-flights__hub ${included ? '' : 'hack-flights__hub--off'}`}
                                                title={airportTitle(hub, hubRefs.get(hub))}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={included}
                                                    onChange={() => toggleHub(hub)}
                                                />
                                                {/* The city, not the code: nobody
                                                    unticks KRK, they untick Kraków. */}
                                                <span>{cityName(hub, hubRefs.get(hub))}</span>
                                                <em className="hack-flights__hub-code">{hub}</em>
                                                <em className="hack-flights__hub-count">{count}</em>
                                            </label>
                                        );
                                    })}
                                    {excludedHubs.length > 0 && (
                                        <button
                                            type="button"
                                            className="hack-flights__hubs-reset"
                                            onClick={() => setExcludedHubs([])}
                                        >
                                            Show all hubs
                                        </button>
                                    )}
                                </fieldset>
                            )}
                            {filtersActive && (
                                <button
                                    type="button"
                                    className="hack-flights__hubs-reset hack-flights__reset-all"
                                    onClick={resetFilters}
                                >
                                    Reset filters
                                </button>
                            )}
                            </div>

                            {hiddenCount > 0 && (
                                <p className="hack-flights__sort-hint" role="status">
                                    {hiddenCount} {hiddenCount === 1 ? 'route' : 'routes'} hidden — Ryanair
                                    publishes no fare for one of their legs on that date, so the flight
                                    almost certainly does not operate.
                                </p>
                            )}
                            {sortKey === 'cheapest' && !autoPricing && !hasKnownPrice(rows) && (
                                /* Hacker fares are fetched one route at a time, so
                                   until someone asks for a price there is nothing to
                                   rank by — say so instead of showing an arbitrary
                                   order under a "Cheapest" chip. */
                                <p className="hack-flights__sort-hint" role="status">
                                    No fares fetched yet — hit <strong>Get Live Price</strong> on the routes you like and
                                    they will rank cheapest-first here.
                                </p>
                            )}
                            {visible.length === 0 ? (
                                <p className="hack-flights__muted" role="status">
                                    {excludedHubs.length > 0
                                        ? 'Nothing left — every remaining route connects through a hub you have unticked.'
                                        : excludedAirlines.length > 0
                                        ? 'Nothing left — every remaining route is flown by an airline you have unticked.'
                                        : !isFullDay(takeOffWindow) || !isFullDay(landingWindow)
                                        ? 'No route takes off and lands inside the hours you set. Widen the sliders to see the rest.'
                                        : hackerFilter === 'all'
                                            ? `Every route found for ${date} was built on a leg Ryanair publishes no fare for, so none of them look real.`
                                            : `No ${hackerFilter === 'direct' ? 'direct flights' : '2-flight self-transfers'} for this route on ${date}.`}
                                </p>
                            ) : (
                                <div className="hack-flights__hacker-list">
                                    {visible.map((row) => (
                                        <HackerRouteCard
                                            key={row.key}
                                            itinerary={row.itinerary}
                                            date={date}
                                            autoPrice={row.auto}
                                            autoPricing={autoPricing}
                                            smallBagOnly={smallBagOnly}
                                            observedFares={observedFares}
                                            onObserveFare={onObserveFare}
                                            onForgetFare={onForgetFare}
                                            onPriced={(price) => setHackerPrices((current) => ({ ...current, [row.key]: price }))}
                                            onSelect={onSelect && direction
                                                ? (estimate) => onSelect(row.itinerary, estimate)
                                                : undefined}
                                            selectLabel={direction === 'return' ? 'Select return' : 'Select outbound'}
                                            /* Compared on identity rather than list position: the
                                               same departures re-found by a later search are the
                                               same flight, and the one in the trip has to keep
                                               saying so. */
                                            selected={Boolean(direction)
                                                && selectedId === cartFlightIdFor(direction as CartDirection, row.itinerary, date)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    );
                })()}
        </section>
    );
};

export default HackerResults;
