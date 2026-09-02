import { faArrowRightArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import AirportAutocomplete from './components/AirportAutocomplete';
import FlightCard from './components/FlightCard';
import TripSelfConnectTab from './components/TripSelfConnectTab';
import { SelfConnectStatus } from './components/TripSelfConnectTab';
import { getCityImageForAirport } from './data/cityImages';
import { FlightAvailable, refreshFlights, searchFlights } from './services/api';
import { getComparableFlightPrice, stripCabinBag } from './services/antiCauchemarPricing';
import {
    ObservedFares,
    forgetObservedFare,
    loadObservedFares,
    saveObservedFare,
} from './services/observedFares';
import { FLIGHT_SORT_OPTIONS, FlightSortKey, sortCachedFares } from './services/hackFlightSort';
import HackerResults from './components/HackerResults';
import { SelfConnectResult, fetchSelfConnect } from './services/selfConnect';
import './HackFlights.css';

type HackFlightsTab = 'live' | 'hacker';

/** One direction of a Route Hacker search. */
interface HackerSearch {
    origin: string;
    destination: string;
    date: string;
    /** Absent on a one-way search, where there is only one block to label. */
    heading?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hack Flights — the Self-Transfer / Creative Routing engine, standalone.
// Flight routing only: no stays, no activities, no dashboard fan-out.
//
// API quota guardrail — the two search modes hit DIFFERENT endpoints:
//   · extendWithSerpApi = false (default)
//       POST /api/flights/refresh + GET /api/flights
//       → Ryanair direct + local flight cache. Zero SerpApi / paid partners.
//   · extendWithSerpApi = true (explicit opt-in)
//       POST /api/trips/self-connect
//       → backend fans out live SerpApi hub searches + Ryanair route network.
// The unchecked path can never bill a partner because the billable endpoint
// is simply never called — the guardrail is the endpoint choice, not a flag.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CACHED_FARES = 6;

/**
 * Is the paid extended search offered at all?
 *
 * Off, because the SerpApi account behind it is at zero searches — every
 * extended query returns nothing, so the checkbox was an option that cost a
 * click and produced an empty result. The machinery below is untouched and
 * correct; flip this back to true once the plan has searches again (the free
 * tier resets monthly) and the checkbox returns exactly as it was.
 */
const EXTENDED_SEARCH_ENABLED = false;

type LegStatus = 'idle' | 'loading' | 'done' | 'error';

interface LegState {
    /** "Outbound" / "Return" — section heading. */
    label: string;
    from: string;
    to: string;
    date: string;
    /** Which engine produced this leg — decides how it renders. */
    mode: 'cached' | 'extended';
    status: LegStatus;
    /** Cached mode: honest-price-sorted Ryanair cache fares. */
    flights: FlightAvailable[];
    /** Cached mode: soft notice (e.g. nothing on the exact date). */
    notice: string | null;
    /** Extended mode: creative-routing result. */
    selfConnect: SelfConnectResult | null;
}

const idleLeg = (label: string, from: string, to: string, date: string, mode: 'cached' | 'extended'): LegState => ({
    label,
    from,
    to,
    date,
    mode,
    status: 'loading',
    flights: [],
    notice: null,
    selfConnect: null,
});

const dateOnly = (value?: string): string => value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';

/**
 * The cached fare window is the next ~13 days — that is what Ryanair's
 * cheapest-per-day feed returns, and it is all the free path ever has.
 *
 * This used to default to today + 21, which is always past the end of that
 * window, so the very first search every visitor ran could never match its own
 * date and always fell back to "no cached fare departs exactly on…". Seven days
 * out keeps both the outbound and the +3 return inside the window, so the first
 * result someone sees is an exact match for the date in the box.
 */
export const CACHED_FARE_WINDOW_DAYS = 13;
export const DEFAULT_DEPARTURE_OFFSET_DAYS = 7;

export const defaultDepartureDate = (): string => {
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + DEFAULT_DEPARTURE_OFFSET_DAYS);
    return target.toISOString().slice(0, 10);
};

export const defaultReturnDate = (departure: string): string => {
    const target = new Date(`${departure}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() + 3);
    return target.toISOString().slice(0, 10);
};

/** Cached fares sorted by the honest price, exact-date matches first. */
const rankCachedFares = (flights: FlightAvailable[], requestedDate: string): { flights: FlightAvailable[]; notice: string | null } => {
    const sorted = [...flights].sort((left, right) => (
        getComparableFlightPrice(left.price, left.antiCauchemar) - getComparableFlightPrice(right.price, right.antiCauchemar)
    ));
    const exact = sorted.filter((flight) => dateOnly(flight.departureDate) === requestedDate);
    if (exact.length > 0) {
        return { flights: exact.slice(0, MAX_CACHED_FARES), notice: null };
    }
    return {
        flights: sorted.slice(0, MAX_CACHED_FARES),
        notice: sorted.length > 0
            ? `No cached fare departs exactly on ${requestedDate} — showing the cheapest cached dates on this route instead.`
            : null,
    };
};

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

const HackFlights: React.FC = () => {
    // Shannon stays — it is the home airport this was built around. The
    // destination does not: SNN → BCN is not a route Ryanair flies, so the
    // default search shipped a query that could never return anything, and the
    // empty state read as "this product is broken" rather than "pick a route
    // that exists". AGP is a real Shannon route and is in the cached feed.
    const [origin, setOrigin] = useState('SNN');
    const [destination, setDestination] = useState('AGP');
    const [departureDate, setDepartureDate] = useState(defaultDepartureDate);
    const [returnDate, setReturnDate] = useState(() => defaultReturnDate(defaultDepartureDate()));
    // One-way ⟹ only the outbound leg is queried; the return date input goes away.
    const [isOneWay, setIsOneWay] = useState(false);
    // CRUCIAL: default false. Unchecked = cached/non-billed endpoints only.
    const [extendWithSerpApi, setExtendWithSerpApi] = useState(false);
    // Display-only: drop the cabin-bag estimate from honest totals for
    // travellers with just a small bag. The bag is an estimate, not a fee
    // everyone pays — so it's optional here.
    const [smallBagOnly, setSmallBagOnly] = useState(false);
    const [legs, setLegs] = useState<LegState[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    // Tab 1 "Live Deals" = the existing cached/live search. Tab 2 "Route Hacker"
    // = schedule-only itineraries from the local DB graph (zero paid API calls).
    // Route Hacker leads. For the same query it returns whole timetables —
    // direct flights and self-transfers, day by day — where the cached-fare tab
    // returns one or two Ryanair fares on dates it picked itself. Live deals
    // stays one click away: it is the only surface carrying the Anti-Cauchemar
    // breakdown, and the Route Hacker empty state sends people to it for routes
    // whose timetables are not loaded yet.
    const [activeTab, setActiveTab] = useState<HackFlightsTab>('hacker');
    // Route Hacker result filter: everything, direct flights only, or 2-flight
    // self-transfers only.
    // Hubs the traveller has ticked off. Empty = show everything, which is why
    // this stores exclusions rather than inclusions: a hub that appears in a
    // later search is visible by default instead of silently missing.
    // Result ordering, shared by both tabs: the question "what lands earliest?"
    // does not change when you switch engines.
    const [sortKey, setSortKey] = useState<FlightSortKey>('cheapest');
    // What the Route Hacker is currently showing: one direction, or two.
    const [hackerSearches, setHackerSearches] = useState<HackerSearch[]>([]);
    // Live fares fetched by individual Route Hacker cards, lifted here by
    // itinerary key so "cheapest" can rank them.
    // Fares fetched automatically, keyed by leg — every itinerary sharing a leg
    // reads the same entry, which is what keeps 52 lookups down to ~13.
    // Fares the traveller entered for legs no free source can price. Loaded once
    // from this device, and keyed by leg so one sighting completes every
    // itinerary routing through it.
    const [observedFares, setObservedFares] = useState<ObservedFares>(loadObservedFares);

    const observeFare = (origin: string, destination: string, on: string, price: number) => {
        setObservedFares((current) => saveObservedFare(current, origin, destination, on, price));
    };

    const forgetFare = (origin: string, destination: string, on: string) => {
        setObservedFares((current) => forgetObservedFare(current, origin, destination, on));
    };

    /**
     * Flip the route. Deliberately does NOT re-run the search: the extended
     * path bills a paid API per query, so a search only ever starts when the
     * visitor presses the button.
     */
    const swapDirection = () => {
        setOrigin(destination);
        setDestination(origin);
    };

    const patchLeg = (index: number, patch: Partial<LegState>) => {
        setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));
    };

    // Non-billed path: warm the Ryanair cache (direct airline API, free), then
    // read it back. No SerpApi, no paid aggregators — ever, on this path.
    const runCachedLeg = async (index: number, from: string, to: string, date: string) => {
        try {
            try {
                await refreshFlights({ origin: from, destination: to, date });
            } catch {
                // Refresh is best-effort cache warming; stale cache still answers.
            }
            let { flights } = await searchFlights({ origin: from, destination: to });
            if (flights.length === 0) {
                // Refresh answers 202 and fills the cache asynchronously — give a
                // cold route one settle window before declaring it empty.
                await new Promise<void>((resolve) => setTimeout(resolve, 4000));
                ({ flights } = await searchFlights({ origin: from, destination: to }));
            }
            const ranked = rankCachedFares(flights, date);
            patchLeg(index, { status: 'done', flights: ranked.flights, notice: ranked.notice });
        } catch {
            patchLeg(index, { status: 'error' });
        }
    };

    // Opt-in billed path: the self-connect engine fans out live SerpApi hub
    // searches (plus the free Ryanair route network) for creative 2-leg routes.
    const runExtendedLeg = async (index: number, from: string, to: string, date: string) => {
        try {
            const result = await fetchSelfConnect(from, to, date);
            patchLeg(index, { status: 'done', selfConnect: result });
        } catch {
            patchLeg(index, { status: 'error' });
        }
    };

    const runLeg = (index: number, leg: LegState) => {
        patchLeg(index, { status: 'loading', flights: [], notice: null, selfConnect: null });
        if (leg.mode === 'extended') {
            void runExtendedLeg(index, leg.from, leg.to, leg.date);
        } else {
            void runCachedLeg(index, leg.from, leg.to, leg.date);
        }
    };

    // Route Hacker: query the local schedule graph — instant, no paid calls.
    /**
     * A round trip is two independent searches, not one.
     *
     * Coming home is a different route on a different day, with its own hubs,
     * its own schedule and its own fares — Shannon → Málaga via Stansted says
     * nothing about which hub works on the way back. So each direction gets its
     * own results block, keyed on its parameters so a new search remounts it.
     */
    const runHackerSearch = () => {
        const searches: HackerSearch[] = isOneWay
            ? [{ origin, destination, date: departureDate }]
            : [
                { origin, destination, date: departureDate, heading: 'Outbound' },
                { origin: destination, destination: origin, date: returnDate, heading: 'Return' },
            ];
        setHackerSearches(searches);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!origin || !destination || origin === destination) {
            setFormError('Pick two different airports to route between.');
            return;
        }
        if (!departureDate) {
            setFormError('Pick a departure date.');
            return;
        }
        if (activeTab === 'hacker') {
            // A round-trip hacker search needs a return date just as much as the
            // cached one does, so the check moved above the tab split.
            if (!isOneWay && (!returnDate || returnDate < departureDate)) {
                setFormError('Round-trip needs a return date on or after the departure date.');
                return;
            }
            setFormError(null);
            runHackerSearch();
            return;
        }
        if (!isOneWay && (!returnDate || returnDate < departureDate)) {
            setFormError('Round-trip needs a return date on or after the departure date.');
            return;
        }
        setFormError(null);

        const mode: LegState['mode'] = extendWithSerpApi ? 'extended' : 'cached';
        // One-way payload = outbound leg only; round-trip adds the mirrored return leg.
        const nextLegs = [idleLeg('Outbound', origin, destination, departureDate, mode)];
        if (!isOneWay) {
            nextLegs.push(idleLeg('Return', destination, origin, returnDate, mode));
        }
        setLegs(nextLegs);
        nextLegs.forEach((leg, index) => {
            if (leg.mode === 'extended') {
                void runExtendedLeg(index, leg.from, leg.to, leg.date);
            } else {
                void runCachedLeg(index, leg.from, leg.to, leg.date);
            }
        });
    };

    return (
        <section className="hack-flights" aria-label="Hack flights search">
            <header className="hack-flights__header">
                <div className="hack-flights__header-copy">
                    <p className="hack-flights__eyebrow">Creative routing</p>
                    <h1 className="hack-flights__title">Find hack flights</h1>
                    <p className="hack-flights__subtitle">
                        Flights only, no stays. Two separate tickets routed through a cheap hub often
                        cost less than the direct flight — with the catch that a missed connection is
                        your problem, not the airline's. Cached fares are free to search; live partner
                        routing is opt-in.
                    </p>
                </div>
                <img
                    className="hack-flights__header-photo"
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Ryanair%2C_EI-DYZ%2C_Boeing_737-8AS_%2849585974527%29.jpg/960px-Ryanair%2C_EI-DYZ%2C_Boeing_737-8AS_%2849585974527%29.jpg"
                    alt="Low-cost Boeing 737 climbing after take-off"
                    loading="lazy"
                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
            </header>

            <div className="hack-flights__tabs" role="tablist" aria-label="Search mode">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'live'}
                    className={`hack-flights__tab ${activeTab === 'live' ? 'hack-flights__tab--active' : ''}`}
                    onClick={() => setActiveTab('live')}
                >
                    Live deals
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'hacker'}
                    className={`hack-flights__tab ${activeTab === 'hacker' ? 'hack-flights__tab--active' : ''}`}
                    onClick={() => setActiveTab('hacker')}
                >
                    Route hacker
                </button>
            </div>

            <form className="hack-flights__form" onSubmit={handleSubmit}>
                <div className="hack-flights__fields">
                    <div className="hack-flights__route-fields">
                        <AirportAutocomplete
                            label="From"
                            value={origin}
                            onChange={setOrigin}
                            placeholder="Origin city or airport…"
                        />
                        <button
                            type="button"
                            className="hack-flights__swap"
                            onClick={swapDirection}
                            aria-label={`Swap direction — search ${destination || 'destination'} to ${origin || 'origin'}`}
                            title="Swap origin and destination"
                        >
                            <FontAwesomeIcon icon={faArrowRightArrowLeft} aria-hidden="true" />
                        </button>
                        <AirportAutocomplete
                            label="To"
                            value={destination}
                            onChange={setDestination}
                            placeholder="Destination city or airport…"
                        />
                    </div>
                    <label className="hack-flights__field">
                        <span className="hack-flights__field-label">Departure</span>
                        <input
                            type="date"
                            className="hack-flights__input"
                            value={departureDate}
                            onChange={(event) => setDepartureDate(event.target.value)}
                        />
                    </label>
                    {!isOneWay && (
                        <label className="hack-flights__field">
                            <span className="hack-flights__field-label">Return</span>
                            <input
                                type="date"
                                className="hack-flights__input"
                                value={returnDate}
                                min={departureDate}
                                onChange={(event) => setReturnDate(event.target.value)}
                            />
                        </label>
                    )}
                </div>

                <div className="hack-flights__controls">
                    <label className="hack-flights__checkbox">
                        <input
                            type="checkbox"
                            checked={isOneWay}
                            onChange={(event) => setIsOneWay(event.target.checked)}
                        />
                        <span>One-way flight</span>
                        <em className="hack-flights__checkbox-hint">
                            {isOneWay ? 'Outbound leg only' : 'Round-trip · both directions searched'}
                        </em>
                    </label>
                    {activeTab === 'live' && (<>

                    <label className="hack-flights__checkbox">
                        <input
                            type="checkbox"
                            checked={smallBagOnly}
                            onChange={(event) => setSmallBagOnly(event.target.checked)}
                        />
                        <span>Small bag only</span>
                        <em className="hack-flights__checkbox-hint">
                            {smallBagOnly ? 'Cabin-bag estimate excluded' : 'Cabin-bag estimate included'}
                        </em>
                    </label>

                    {EXTENDED_SEARCH_ENABLED && (
                        <label className="hack-flights__checkbox">
                            <input
                                type="checkbox"
                                checked={extendWithSerpApi}
                                onChange={(event) => setExtendWithSerpApi(event.target.checked)}
                            />
                            {/* "SerpAPI" is a vendor name that means nothing to a
                                traveller. What they need to know is that ticking
                                this costs money and searches wider. */}
                            <span>Extend search (uses a paid API)</span>
                            <em className="hack-flights__checkbox-hint">
                                {/* The sub-label states the CURRENT state, so it has to
                                    say so out loud — sitting beside "uses a paid API",
                                    a bare "Free" read as a contradiction. */}
                                {extendWithSerpApi
                                    ? 'On — also searches partner airlines for two-ticket routings'
                                    : 'Off — free Ryanair-only search'}
                            </em>
                        </label>
                    )}
                    </>)}
                </div>

                {activeTab === 'live' && extendWithSerpApi && (
                    <p className="hack-flights__serp-warning" role="note">
                        Extended routing enabled. This may take longer to query live partners.
                    </p>
                )}

                {activeTab === 'hacker' && (
                    <p className="hack-flights__serp-warning hack-flights__serp-warning--info" role="note">
                        Route Hacker builds routes from timetables already stored here, so it is instant and free.
                        It finds direct flights and one-stop self-transfers — two separate tickets through a hub,
                        where a missed connection is your problem, not the airline's. Prices are fetched per route
                        when you ask for them.
                    </p>
                )}

                {formError && (
                    <p className="hack-flights__form-error" role="alert">{formError}</p>
                )}

                <button type="submit" className="hack-flights__submit">
                    {activeTab === 'hacker'
                        ? 'Assemble hacker routes'
                        : extendWithSerpApi ? 'Find creative routes' : 'Search cached fares'}
                </button>
            </form>

            {hackerSearches.map((search) => (
                <HackerResults
                    key={`${search.heading}-${search.origin}-${search.destination}-${search.date}`}
                    origin={search.origin}
                    destination={search.destination}
                    date={search.date}
                    heading={search.heading}
                    sortKey={sortKey}
                    onSortChange={setSortKey}
                    observedFares={observedFares}
                    onObserveFare={observeFare}
                    onForgetFare={forgetFare}
                />
            ))}

            {activeTab === 'live' && legs.some((leg) => leg.mode === 'cached' && leg.flights.length > 1) && (
                <SortChips value={sortKey} onChange={setSortKey} />
            )}

            {activeTab === 'live' && legs.map((leg, index) => {
                const destinationImage = getCityImageForAirport(leg.to);
                return (
                <section key={`${leg.label}-${leg.from}-${leg.to}`} className="hack-flights__leg" aria-label={`${leg.label} results`}>
                    <div className="hack-flights__leg-head">
                        <div className="hack-flights__leg-heading">
                            {destinationImage && (
                                <img
                                    className="hack-flights__leg-photo"
                                    src={destinationImage.url}
                                    alt={destinationImage.city}
                                    loading="lazy"
                                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                />
                            )}
                            <h2 className="hack-flights__leg-title">
                                {leg.label} · {leg.from} → {leg.to}
                            </h2>
                        </div>
                        <span className="hack-flights__leg-date">{leg.date}</span>
                    </div>

                    {leg.mode === 'extended' ? (
                        <TripSelfConnectTab
                            status={leg.status as SelfConnectStatus}
                            result={leg.selfConnect}
                            onRetry={() => runLeg(index, leg)}
                        />
                    ) : (
                        <>
                            {leg.status === 'loading' && (
                                <p className="hack-flights__muted" role="status">
                                    Reading cached fares for {leg.from} → {leg.to}…
                                </p>
                            )}
                            {leg.status === 'error' && (
                                <div className="hack-flights__error" role="alert">
                                    <p>The cached fare lookup failed for this leg.</p>
                                    <button type="button" className="hack-flights__retry" onClick={() => runLeg(index, leg)}>
                                        Try again
                                    </button>
                                </div>
                            )}
                            {leg.status === 'done' && leg.flights.length === 0 && (
                                /* The old copy said "no flight data means no route" and sent
                                   people straight at the billed path. Both halves were
                                   misleading: an empty result here almost always means the
                                   airline does not fly the pair at all, and the paid search
                                   is not even on offer while its quota is spent. Route Hacker
                                   is the honest next step — free, and it knows carriers
                                   beyond Ryanair. */
                                <p className="hack-flights__muted" role="status">
                                    No cached fares for {leg.from} → {leg.to}. The free search covers routes
                                    Ryanair flies itself, for the next {CACHED_FARE_WINDOW_DAYS} days — this pair
                                    is not in it, so most likely Ryanair does not fly it direct. Try{' '}
                                    <strong>Route hacker</strong>, which builds routes from stored timetables
                                    across every airline it knows, or pick a different destination.
                                </p>
                            )}
                            {leg.status === 'done' && leg.flights.length > 0 && (
                                <>
                                    {leg.notice && (
                                        <p className="hack-flights__muted" role="status">{leg.notice}</p>
                                    )}
                                    <div className="hack-flights__fares">
                                        {sortCachedFares(leg.flights, sortKey).map((flight, flightIndex) => (
                                            <FlightCard
                                                key={`${flight.flightNumber ?? 'flight'}-${flight.departureDate ?? flightIndex}`}
                                                flight={smallBagOnly && flight.antiCauchemar
                                                    ? { ...flight, antiCauchemar: stripCabinBag(flight.antiCauchemar) }
                                                    : flight}
                                                flightSource="live"
                                                flightDiagnosticsOk
                                                /* The cached rows carry no carrier field, but this
                                                   path only ever warms and reads Ryanair's own feed —
                                                   the same thing the form promises as a "free
                                                   Ryanair-only search". */
                                                operatorCode="FR"
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </section>
                );
            })}
        </section>
    );
};

export default HackFlights;
