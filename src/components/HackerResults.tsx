import React, { useCallback, useEffect, useState } from 'react';
import { getAirportDisplay } from '../data/airportMetadata';
import {
    FLIGHT_SORT_OPTIONS,
    FlightSortKey,
    hasKnownPrice,
    sortHackerRows,
} from '../services/hackFlightSort';
import {
    ItineraryPrice,
    fetchLegPrices,
    itineraryPrice,
    ryanairLegUnpriced,
    uniqueRyanairLegs,
} from '../services/hackerAutoPrice';
import { HackerItinerary, LegFare, fetchHackerRoutes } from '../services/hackerRoutes';
import { ObservedFares, observedFareKey } from '../services/observedFares';
import HackerRouteCard from './HackerRouteCard';

type Status = 'idle' | 'loading' | 'done' | 'error';

/** Cheapest / take-off / landing / shortest — the order the results are read in. */
const SortChips: React.FC<{ value: FlightSortKey; onChange: (key: FlightSortKey) => void }> = ({ value, onChange }) => (
    <div className="hack-flights__sort" role="group" aria-label="Sort results">
        <span className="hack-flights__sort-label">Sort by</span>
        {FLIGHT_SORT_OPTIONS.map((option) => (
            <button
                key={option.key}
                type="button"
                className={`hack-flights__filter-chip ${value === option.key ? 'hack-flights__filter-chip--active' : ''}`}
                aria-pressed={value === option.key}
                onClick={() => onChange(option.key)}
            >
                {option.label}
            </button>
        ))}
    </div>
);

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
    onObserveFare: (origin: string, destination: string, date: string, price: number) => void;
    onForgetFare: (origin: string, destination: string, date: string) => void;
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
    const [hackerPrices, setHackerPrices] = useState<Record<string, number | null>>({});
    const [legPrices, setLegPrices] = useState<Record<string, LegFare>>({});
    const [autoPricing, setAutoPricing] = useState(false);

    const load = useCallback(() => {
        let cancelled = false;
        void (async () => {
            try {
                const routes = await fetchHackerRoutes(origin, destination, date);
                if (cancelled) return;
                setHackerRoutes(routes);
                setStatus('done');

                // Ryanair answers a fare in about 45ms from a free API, so the
                // only thing the button was really guarding was volume — and
                // pricing distinct LEGS rather than whole itineraries cuts a
                // 27-route search from 52 lookups to about 13.
                const legs = uniqueRyanairLegs(routes, date);
                if (legs.length === 0) return;
                setAutoPricing(true);
                try {
                    const prices = await fetchLegPrices(legs);
                    if (!cancelled) setLegPrices(prices);
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
        setLegPrices({});
        load();
    };

    useEffect(load, [load]);

    return (
        <section className="hack-flights__leg" aria-label={`${heading ?? 'Route Hacker'} results`}>
            {heading && (
                <div className="hack-flights__leg-head">
                    <h2 className="hack-flights__leg-title">{heading} · {origin} → {destination}</h2>
                    <span className="hack-flights__leg-date">{date}</span>
                </div>
            )}

                {status === 'loading' && (
                    <p className="hack-flights__muted" role="status">Assembling self-transfers from the schedule graph…</p>
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
                        No schedule-based routes for {origin} → {destination} on {date}.
                        Route Hacker only knows the airports whose timetables are loaded so far, and
                        these two are not among them yet. Try <strong>Live deals</strong> for this route instead.
                    </p>
                )}
                {hackerRoutes.length > 0 && (() => {
                    // Rows carry the route, its stable key and whatever price
                    // the card has fetched — everything the sort needs.
                    const allRows = hackerRoutes.map((itinerary, index) => {
                        const key = itineraryKey(itinerary, index);
                        const auto: ItineraryPrice | null = itineraryPrice(itinerary, date, legPrices);
                        return {
                            key,
                            itinerary,
                            auto,
                            // Someone who pressed the button wanted a fresh
                            // answer, so theirs outranks the automatic one.
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
                        (from, to, on) => observedFares[observedFareKey(from, to, on)] != null,
                    ));
                    const hiddenCount = allRows.length - rows.length;
                    const visible = sortHackerRows(rows.filter(({ itinerary: it }) => (
                        (hackerFilter === 'all'
                            || (hackerFilter === 'direct' && it.type === 'DIRECT')
                            || (hackerFilter === 'transfer' && it.type === 'SELF_TRANSFER'))
                        // A direct flight has no hub to be excluded by.
                        && (!it.hub || !excludedHubs.includes(it.hub))
                    )), sortKey);
                    // Hubs present in what survived, commonest first.
                    const hubCounts = new Map<string, number>();
                    rows.forEach((row) => {
                        const hub = row.itinerary.hub;
                        if (hub) hubCounts.set(hub, (hubCounts.get(hub) ?? 0) + 1);
                    });
                    const hubs = Array.from(hubCounts.entries())
                        .sort(([leftHub, left], [rightHub, right]) => right - left || leftHub.localeCompare(rightHub));
                    const toggleHub = (hub: string) => setExcludedHubs((current) => (
                        current.includes(hub) ? current.filter((code) => code !== hub) : [...current, hub]
                    ));

                    const shownDirect = rows.filter((row) => row.itinerary.type === 'DIRECT').length;
                    const filters: { key: typeof hackerFilter; label: string }[] = [
                        { key: 'all', label: `All (${rows.length})` },
                        { key: 'direct', label: `Direct (${shownDirect})` },
                        { key: 'transfer', label: `2 flights (${rows.length - shownDirect})` },
                    ];
                    return (
                        <>
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
                            {hubs.length > 1 && (
                                <fieldset className="hack-flights__hubs">
                                    <legend className="hack-flights__hubs-legend">Connect via</legend>
                                    {hubs.map(([hub, count]) => {
                                        const airport = getAirportDisplay(hub);
                                        const included = !excludedHubs.includes(hub);
                                        return (
                                            <label
                                                key={hub}
                                                className={`hack-flights__hub ${included ? '' : 'hack-flights__hub--off'}`}
                                                title={`${airport.city}, ${airport.country}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={included}
                                                    onChange={() => toggleHub(hub)}
                                                />
                                                <span>{hub}</span>
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

                            <SortChips value={sortKey} onChange={onSortChange} />
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
                                            observedFares={observedFares}
                                            onObserveFare={onObserveFare}
                                            onForgetFare={onForgetFare}
                                            onPriced={(price) => setHackerPrices((current) => ({ ...current, [row.key]: price }))}
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
