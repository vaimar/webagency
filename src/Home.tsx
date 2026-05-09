import { faInfoCircle, faMapMarkerAlt, faPlane, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useMemo, useState } from 'react';
import Select, { components, GroupBase, OptionProps, SingleValueProps, StylesConfig } from 'react-select';
import FlightCard from './components/FlightCard';
import FlightDestinationCard from './components/FlightDestinationCard';
import { RequestDiagnostics, TripGuide, TripGuideLoading } from './components/TripGuide';
import { AirportDisplay, buildAirportSearchText, DESTINATION_AIRPORT_OPTIONS, formatAirportOptionLabel, getAirportDisplay, groupAirportsByCountry, ORIGIN_AIRPORT_OPTIONS } from './data/airportMetadata';
import { addDaysToDateOnly } from './hooks/routeSearchDates';
import { useRouteSearch } from './hooks/useRouteSearch';
import { FlightDestination } from './model/FlightDestination';
import { fetchFlightDestinations } from './services/flightService';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const LANDING_ORIGIN = 'DUB';
const LANDING_MAX_PRICE = 260;
const NO_HONEST_ROUTES_FOUND = 'No Honest Routes Found';

const formatPrice = (price: number | string, currency: string = 'EUR'): string => {
    const amount = typeof price === 'number' ? price : Number.parseFloat(String(price));

    if (Number.isFinite(amount)) {
        try {
            return new Intl.NumberFormat('en-IE', {
                style: 'currency',
                currency,
                minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2,
            }).format(amount);
        } catch {
            // Fall through to the plain-text formatter below.
        }
    }

    return `${currency} ${price}`;
};

const getDestinationLeadPrice = (destination: FlightDestination): string => {
    const currency = destination.antiCauchemar?.currency ?? destination.price.currency;
    const honestPrice = destination.antiCauchemar?.realWorldEntryPrice ?? destination.antiCauchemar?.realCost;
    return formatPrice(honestPrice ?? destination.price.total, currency);
};

type AirportOption = {
    value: string;
    label: string;
    airport: AirportDisplay;
};

const mapAirportGroupsToSelect = (groups: ReturnType<typeof groupAirportsByCountry>): GroupBase<AirportOption>[] => (
    groups.map((group) => ({
        label: `${group.flag} ${group.country}`,
        options: group.airports.map((airport) => ({
            value: airport.code,
            label: formatAirportOptionLabel(airport.code),
            airport: { ...airport, searchCode: airport.code },
        })),
    }))
);

const selectStyles: StylesConfig<AirportOption, false> = {
    control: (base, state) => ({
        ...base,
        minHeight: 52,
        borderRadius: 14,
        borderColor: state.isFocused ? '#173c63' : '#d5dfeb',
        boxShadow: state.isFocused ? '0 0 0 3px rgba(23, 60, 99, 0.12)' : 'none',
        background: '#f8fbfd',
        '&:hover': {
            borderColor: '#173c63',
        },
    }),
    option: (base, state) => ({
        ...base,
        background: state.isSelected ? '#173c63' : state.isFocused ? '#edf4fb' : '#ffffff',
        color: state.isSelected ? '#ffffff' : '#102033',
        padding: 0,
    }),
    menu: (base) => ({
        ...base,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 22px 40px rgba(15, 41, 66, 0.16)',
        zIndex: 250,
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 260,
    }),
    menuList: (base) => ({
        ...base,
        padding: 8,
    }),
    placeholder: (base) => ({
        ...base,
        color: '#64748b',
    }),
    singleValue: (base) => ({
        ...base,
        color: '#102033',
    }),
    groupHeading: (base) => ({
        ...base,
        margin: 0,
        padding: '10px 12px 6px',
        color: '#2f5f8f',
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 800,
    }),
};

const AirportOptionRow: React.FC<OptionProps<AirportOption, false>> = (props) => {
    const { airport } = props.data;

    return (
        <components.Option {...props}>
            <div className="airport-select__option">
                <span className="airport-select__flag" aria-hidden="true">{airport.flag}</span>
                <span className="airport-select__copy">
                    <strong>{airport.city}</strong>
                    <span>{airport.airportName} · {airport.country}</span>
                </span>
                <span className="airport-select__code">{airport.code}</span>
            </div>
        </components.Option>
    );
};

const AirportSingleValue: React.FC<SingleValueProps<AirportOption, false>> = (props) => {
    const { airport } = props.data;

    return (
        <components.SingleValue {...props}>
            <div className="airport-select__value">
                <span aria-hidden="true">{airport.flag}</span>
                <span>{airport.city} ({airport.code})</span>
            </div>
        </components.SingleValue>
    );
};

const filterAirportOption = (candidate: { data: AirportOption }, rawInput: string): boolean => {
    const query = rawInput.trim().toLowerCase();
    if (!query) {
        return true;
    }

    return buildAirportSearchText(candidate.data.airport).includes(query);
};

const toSuggestedRoute = (item: FlightDestination) => ({
    origin: getAirportDisplay(item.origin).code,
    destination: getAirportDisplay(item.destination).code,
    departureDate: item.departureDate,
    returnDate: item.returnDate,
});


const Home: React.FC = () => {
    const {
        state, flights, tripSuggestion, isSearchingFlights, isLoadingSuggestion,
        flightError, noFlightsMessage, suggestionError, flightSource, flightDiagnostics, suggestionDiagnostics, hasSearched,
        setOrigin, setDestination, setDepartureDate, setReturnDate, searchRoute, retrySuggestion, clearResults,
    } = useRouteSearch();
    const [animatedCardKey, setAnimatedCardKey] = useState<string | null>(null);
    const [landingDestinations, setLandingDestinations] = useState<FlightDestination[]>([]);
    const [isLoadingLanding, setIsLoadingLanding] = useState(true);
    const [landingError, setLandingError] = useState<string | null>(null);
    const [landingNotice, setLandingNotice] = useState<string | null>(null);

    const hasResults = flights.length > 0 || tripSuggestion !== null;
    const originAirport = state.origin ? getAirportDisplay(state.origin) : null;
    const destinationAirport = state.destination ? getAirportDisplay(state.destination) : null;
    const originGroups = groupAirportsByCountry(ORIGIN_AIRPORT_OPTIONS);
    const destinationGroups = groupAirportsByCountry(DESTINATION_AIRPORT_OPTIONS);
    const originOptions = mapAirportGroupsToSelect(originGroups);
    const destinationOptions = mapAirportGroupsToSelect(destinationGroups);
    const selectedOriginOption = originOptions.flatMap((group) => group.options).find((option) => option.value === originAirport?.searchCode) ?? null;
    const selectedDestinationOption = destinationOptions.flatMap((group) => group.options).find((option) => option.value === destinationAirport?.searchCode) ?? null;
    const suggestedRoutes = landingDestinations.map((destination) => {
        const suggestedRoute = toSuggestedRoute(destination);
        const matchesSelectedDates = Boolean(
            state.departureDate &&
            state.returnDate &&
            state.departureDate === suggestedRoute.departureDate &&
            state.returnDate === suggestedRoute.returnDate,
        );

        return {
            destination,
            suggestedRoute,
            matchesSelectedDates,
        };
    });
    const handleSuggestedRouteSelect = (route: { origin: string; destination: string; departureDate: string; returnDate: string }) => {
        setOrigin(route.origin);
        setDestination(route.destination);
        setDepartureDate(route.departureDate);
        setReturnDate(route.returnDate);
        setAnimatedCardKey(`${route.origin}-${route.destination}-${route.departureDate}`);
    };

    const selectedSuggestedFare = useMemo(
        () => suggestedRoutes.find(({ suggestedRoute, matchesSelectedDates }) => (
            state.origin === suggestedRoute.origin &&
            state.destination === suggestedRoute.destination &&
            matchesSelectedDates
        )) ?? null,
        [state.destination, state.origin, suggestedRoutes],
    );

    useEffect(() => {
        if (!animatedCardKey) return undefined;

        const timeoutId = window.setTimeout(() => {
            setAnimatedCardKey(null);
        }, 1100);

        return () => window.clearTimeout(timeoutId);
    }, [animatedCardKey]);

    useEffect(() => {
        let isActive = true;

        const loadLandingDestinations = async () => {
            setIsLoadingLanding(true);
            setLandingError(null);

            try {
                const result = await fetchFlightDestinations({
                    origin: LANDING_ORIGIN,
                    maxPrice: LANDING_MAX_PRICE,
                });

                if (!isActive) return;

                setLandingDestinations(result.destinations);
                setLandingNotice(result.notice ?? null);
            } catch (error) {
                if (!isActive) return;

                setLandingDestinations([]);
                setLandingNotice(null);
                setLandingError(error instanceof Error ? error.message : 'Live DUB discovery is unavailable right now.');
            } finally {
                if (isActive) {
                    setIsLoadingLanding(false);
                }
            }
        };

        void loadLandingDestinations();

        return () => {
            isActive = false;
        };
    }, []);

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content" style={{ maxWidth: '100%' }}>
                    <p className="eyebrow eyebrow--light"><FontAwesomeIcon icon={faPlane} style={{ marginRight: '8px' }} />Trip Discovery</p>
                    <h1>Start with the flight. Trust the real route.</h1>
                    <p className="hero-card__lede">Live DUB routes are refreshed on arrival. Flight search stays flight-only now. Neighborhoods, restaurants, and activity combos only load if you explicitly ask for the guide after flights exist.</p>
                    {selectedSuggestedFare && (
                        <div className="selected-fare-pill" role="status">
                            <span className="selected-fare-pill__label">Selected fare</span>
                            <strong>{getDestinationLeadPrice(selectedSuggestedFare.destination)}</strong>
                            <span>
                                {getAirportDisplay(selectedSuggestedFare.suggestedRoute.origin).city} → {getAirportDisplay(selectedSuggestedFare.suggestedRoute.destination).city}
                            </span>
                            <span>{selectedSuggestedFare.suggestedRoute.departureDate} → {selectedSuggestedFare.suggestedRoute.returnDate}</span>
                        </div>
                    )}
                    <div className="search-box" style={{ marginTop: '24px' }}>
                        <div className="search-box__grid">
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />From</label>
                                <Select<AirportOption, false>
                                    inputId="origin-airport"
                                    classNamePrefix="airport-select"
                                    options={originOptions}
                                    value={selectedOriginOption}
                                    onChange={(next) => next && setOrigin(next.value)}
                                    components={{ Option: AirportOptionRow, SingleValue: AirportSingleValue }}
                                    styles={selectStyles}
                                    isSearchable
                                    filterOption={filterAirportOption}
                                    menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                                    menuPosition="fixed"
                                    placeholder="Search departure airport"
                                />
                            </div>
                            <div className="search-box__field">
                                <label className="search-box__label"><FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />To</label>
                                <Select<AirportOption, false>
                                    inputId="destination-airport"
                                    classNamePrefix="airport-select"
                                    options={destinationOptions}
                                    value={selectedDestinationOption}
                                    onChange={(next) => next && setDestination(next.value)}
                                    components={{ Option: AirportOptionRow, SingleValue: AirportSingleValue }}
                                    styles={selectStyles}
                                    isSearchable
                                    filterOption={filterAirportOption}
                                    menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                                    menuPosition="fixed"
                                    placeholder="Search destination airport"
                                />
                            </div>
                            <div className="search-box__field">
                                <label className="search-box__label">Departure</label>
                                <input
                                    type="date"
                                    value={state.departureDate}
                                    className="search-box__input"
                                    min="2026-05-09"
                                    onChange={(event) => setDepartureDate(event.target.value)}
                                />
                            </div>
                            <div className="search-box__field">
                                <label className="search-box__label">Return</label>
                                <input
                                    type="date"
                                    value={state.returnDate}
                                    className="search-box__input"
                                    min={state.departureDate ? addDaysToDateOnly(state.departureDate, 1) : '2026-05-10'}
                                    onChange={(event) => setReturnDate(event.target.value)}
                                />
                            </div>
                            <button type="button" className="button button--large" disabled={isSearchingFlights || isLoadingSuggestion || !state.origin || !state.destination || !state.departureDate || !state.returnDate} onClick={() => void searchRoute({ refreshFlights: true })} style={{ height: '52px' }}>
                                <FontAwesomeIcon icon={faSearch} />{isSearchingFlights || isLoadingSuggestion ? 'Searching...' : 'Find live flights'}
                            </button>
                        </div>
                        <p className="muted-text" style={{ marginTop: '10px', fontSize: '0.82rem' }}>
                            {originAirport && destinationAirport
                                ? <>Route ready: <strong>{originAirport.city}</strong> → <strong>{destinationAirport.city}</strong>, <strong>{state.departureDate || 'choose departure'}</strong> to <strong>{state.returnDate || 'choose return'}</strong>.</>
                                : <>Choose any Ryanair-style airport pair and both trip dates. Suggested fares below can fill the full box in one click.</>}
                        </p>
                    </div>
                </div>
            </section>

            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">❄️ Frozen Summer discovery board</p>
                        <h2>Live DUB fares that populate the search box.</h2>
                        <p className="muted-text">These cards are a lighter live subset so the homepage stays fast. The airport selectors above now cover a much broader Ryanair-style list than the landing board itself.</p>
                    </div>
                </div>
                {isLoadingLanding ? (
                    <div className="card empty-state">
                        <div className="loading-pulse">
                            <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                            <p>Refreshing live Dublin departures and stripping out the fake cheap routes...</p>
                        </div>
                    </div>
                ) : landingError ? (
                    <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{landingError}</div>
                ) : suggestedRoutes.length === 0 ? (
                    <div className="card empty-state">
                        <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                        <h3>{NO_HONEST_ROUTES_FOUND}</h3>
                        <p>{landingNotice ?? 'The backend returned no flight-backed landing fares from Dublin. No flight data, no discover card.'}</p>
                    </div>
                ) : (
                    <div className="info-grid">
                        {suggestedRoutes.map(({ destination, suggestedRoute, matchesSelectedDates }) => (
                            <FlightDestinationCard
                                key={`${destination.origin}-${destination.destination}-${destination.departureDate}`}
                                destination={destination}
                                onSelect={() => handleSuggestedRouteSelect(suggestedRoute)}
                                isSelected={
                                    state.origin === suggestedRoute.origin &&
                                    state.destination === suggestedRoute.destination &&
                                    matchesSelectedDates
                                }
                                showsDateMatch={matchesSelectedDates}
                                shouldAnimate={animatedCardKey === `${suggestedRoute.origin}-${suggestedRoute.destination}-${suggestedRoute.departureDate}`}
                            />
                        ))}
                    </div>
                )}
            </section>

            {(flightSource || hasResults) && (
                <div className="notice-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        <span>{flightSource === 'live' ? <><strong>Live Ryanair fares</strong> — sorted by real-world entry price, not the headline fare</> : <strong>Enter airports to search</strong>}{flightDiagnostics?.ok && <span className="muted-text" style={{ marginLeft: '12px' }}>Response in {flightDiagnostics.durationMs}ms</span>}</span>
                    </div>
                    {hasResults && <button type="button" className="button button--secondary button--small" onClick={clearResults}>Clear results</button>}
                </div>
            )}

            {flightError && <div className="notice-banner notice-banner--error"><FontAwesomeIcon icon={faInfoCircle} />{flightError}</div>}
            {noFlightsMessage && !flightError && <div className="notice-banner"><FontAwesomeIcon icon={faInfoCircle} />{noFlightsMessage}</div>}

            {isLoadingSuggestion && <TripGuideLoading />}

            {suggestionError && !isLoadingSuggestion && (
                <section className="card section-card stack-lg">
                    <div className="section-card__header"><div><p className="eyebrow">✨ AI Trip Brief</p><h2>Destination Guide</h2></div></div>
                    <div className="notice-banner notice-banner--error">{suggestionError}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button type="button" className="button button--secondary button--small" onClick={() => void retrySuggestion()}>
                            🔄 Retry AI suggestion
                        </button>
                    </div>
                    <RequestDiagnostics title="Request details" diagnostics={suggestionDiagnostics} />
                </section>
            )}

            {tripSuggestion && !isLoadingSuggestion && <TripGuide trip={tripSuggestion} diagnostics={suggestionDiagnostics} />}

            {flights.length > 0 && !tripSuggestion && !isLoadingSuggestion && !suggestionError && (
                <section className="card section-card stack-md">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">🧊 Guide on demand</p>
                            <h2>Flights are loaded. The AI guide is optional.</h2>
                            <p className="muted-text">Use this only if you want the extra neighborhood, restaurant, and activity layer after the flight truth is already clear.</p>
                        </div>
                        <button type="button" className="button button--secondary" onClick={() => void retrySuggestion()}>
                            Build honest guide
                        </button>
                    </div>
                </section>
            )}

            {(isSearchingFlights || flights.length > 0 || Boolean(noFlightsMessage)) && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">✈️ Available Flights</p>
                            <h2>{isSearchingFlights ? 'Refreshing live flights...' : `${flights.length} flight${flights.length !== 1 ? 's' : ''} found`}</h2>
                            {!isSearchingFlights && flights.length > 0 && originAirport && destinationAirport && <p className="muted-text">{originAirport.city} ({originAirport.code}) → {destinationAirport.city} ({destinationAirport.code})</p>}
                        </div>
                    </div>
                    {isSearchingFlights ? (
                        <div className="card empty-state"><div className="loading-pulse"><FontAwesomeIcon icon={faPlane} className="empty-state__icon" /><p>Refreshing live Ryanair availability for the cleanest route...</p></div></div>
                    ) : flights.length === 0 ? (
                        <div className="card empty-state">
                            <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                            <h3>{NO_HONEST_ROUTES_FOUND}</h3>
                            <p>We only build the itinerary after a real flight appears. Try a nearby airport or a different date window.</p>
                        </div>
                    ) : (
                        <>
                            <div className="info-grid">{flights.map((flight, index) => (
                                <FlightCard
                                    key={`${flight.flightNumber ?? index}-${flight.departureTime ?? flight.departureDate}`}
                                    flight={flight}
                                    flightSource={flightSource}
                                    flightDiagnosticsOk={Boolean(flightDiagnostics?.ok)}
                                />
                            ))}</div>
                            <RequestDiagnostics title="Flight request details" diagnostics={flightDiagnostics} />
                        </>
                    )}
                </section>
            )}

            {!hasResults && !isSearchingFlights && !isLoadingSuggestion && !noFlightsMessage && !hasSearched && (
                <div className="card empty-state">
                    <FontAwesomeIcon icon={faPlane} className="empty-state__icon" />
                    <h3>Flight-first discovery</h3>
                    <p>Choose a route manually or use one of the live DUB fare cards above to preload the search box with a real airport pair and date.</p>
                    <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '12px' }}>Truth-first rule: if the flight is missing, the trip never appears.</p>
                </div>
            )}
        </div>
    );
};

export default Home;
