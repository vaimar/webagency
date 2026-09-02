import { faPlane, faShip, faUmbrellaBeach } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BookingLinks from './components/BookingLinks';
import { accommodationUrls } from './services/affiliates';
import { resolveOriginAirport } from './services/destinationDirectory';
import { formatCurrency, formatMinutes } from './services/tripExploreSelectors';
import {
    fetchIslandHop,
    fetchIslandHopTemplates,
    IslandHopResult,
    IslandHopStopRequest,
    ISLAND_OPTIONS,
    TourTemplate,
} from './services/islandHop';
import './IslandHop.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

const DEFAULT_STOPS: IslandHopStopRequest[] = [
    { island: 'Santorini', nights: 3 },
    { island: 'Paros', nights: 3 },
    { island: 'Athens', nights: 1 },
];

const flightLabel = (from?: string | null, to?: string | null, airline?: string | null): string => {
    const route = [from, to].filter(Boolean).join(' → ');
    return airline ? `${route} · ${airline}` : route;
};

const IslandHop: React.FC = () => {
    const [homeAddress, setHomeAddress] = useState('Limerick, Ireland');
    const [startDate, setStartDate] = useState('2026-07-10');
    const [stops, setStops] = useState<IslandHopStopRequest[]>(DEFAULT_STOPS);
    const [templates, setTemplates] = useState<TourTemplate[]>([]);
    const [tour, setTour] = useState<IslandHopResult | null>(null);
    const [status, setStatus] = useState<Status>('idle');

    const origin = useMemo(() => resolveOriginAirport(homeAddress), [homeAddress]);

    useEffect(() => {
        fetchIslandHopTemplates().then(setTemplates).catch(() => setTemplates([]));
    }, []);

    // Debounced auto-plan whenever the itinerary or trip basics change.
    const plan = useCallback(async (nextStops: IslandHopStopRequest[]) => {
        if (nextStops.length === 0) {
            setTour(null);
            setStatus('idle');
            return;
        }
        setStatus('loading');
        try {
            const result = await fetchIslandHop(origin, startDate, nextStops);
            setTour(result);
            setStatus('done');
        } catch {
            setStatus('error');
        }
    }, [origin, startDate]);

    useEffect(() => {
        const handle = setTimeout(() => { void plan(stops); }, 700);
        return () => clearTimeout(handle);
    }, [stops, plan]);

    const applyTemplate = (template: TourTemplate) => {
        setStops(template.stops.map((s) => ({ island: s.island, nights: s.nights })));
    };

    const setNights = (index: number, delta: number) => {
        setStops((prev) => prev.map((s, i) => (
            i === index ? { ...s, nights: Math.max(1, s.nights + delta) } : s
        )));
    };

    const removeStop = (index: number) => setStops((prev) => prev.filter((_, i) => i !== index));

    const moveStop = (index: number, delta: number) => {
        setStops((prev) => {
            const target = index + delta;
            if (target < 0 || target >= prev.length) {
                return prev;
            }
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const addStop = (island: string) => {
        if (island) {
            setStops((prev) => [...prev, { island, nights: 2 }]);
        }
    };

    const currency = tour?.currency ?? 'EUR';
    const returnDate = useMemo(() => {
        const d = new Date(startDate);
        if (Number.isNaN(d.getTime())) {
            return startDate;
        }
        d.setDate(d.getDate() + (tour?.totalNights ?? 0));
        return d.toISOString().slice(0, 10);
    }, [startDate, tour?.totalNights]);
    const ferryByIndex = (fromIsland: string, toIsland: string) => (tour?.ferries ?? [])
        .find((f) => f.fromIsland === fromIsland && f.toIsland === toIsland);

    return (
        <div className="island-hop">
            <div className="island-hop__intro">
                <p className="island-hop__eyebrow">Multi-stop routing</p>
                <h2 className="island-hop__title">Greek Islands Tour</h2>
                <p className="island-hop__subtitle">
                    Open-jaw island hopping — fly into one island, ferry between the rest, fly home from another.
                    Pick a ready-made route, then add, drop, reorder or restretch the stops.
                </p>
            </div>

            <div className="island-hop__controls">
                <label className="island-hop__field">
                    <span className="island-hop__label">Leaving from</span>
                    <input
                        type="text"
                        value={homeAddress}
                        onChange={(e) => setHomeAddress(e.target.value)}
                        className="island-hop__input"
                        placeholder="Limerick, Ireland"
                    />
                    <span className="island-hop__hint">Departs {origin}</span>
                </label>
                <label className="island-hop__field">
                    <span className="island-hop__label">Start date</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="island-hop__input"
                    />
                </label>
            </div>

            <div className="island-hop__templates">
                <span className="island-hop__label">Ready-made routes</span>
                <div className="island-hop__chip-row">
                    {templates.map((t) => (
                        <button key={t.id} type="button" className="island-hop__chip" onClick={() => applyTemplate(t)} title={t.description}>
                            {t.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="island-hop__editor">
                <span className="island-hop__label">Your itinerary</span>
                {stops.map((stop, index) => (
                    <div key={`${stop.island}-${index}`} className="island-hop__stop-row">
                        <div className="island-hop__stop-order">
                            <button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0} aria-label="Move up">↑</button>
                            <button type="button" onClick={() => moveStop(index, 1)} disabled={index === stops.length - 1} aria-label="Move down">↓</button>
                        </div>
                        <strong className="island-hop__stop-name">{stop.island}</strong>
                        <div className="island-hop__nights">
                            <button type="button" onClick={() => setNights(index, -1)} aria-label="Fewer nights">−</button>
                            <span>{stop.nights} {stop.nights === 1 ? 'night' : 'nights'}</span>
                            <button type="button" onClick={() => setNights(index, 1)} aria-label="More nights">+</button>
                        </div>
                        <button type="button" className="island-hop__remove" onClick={() => removeStop(index)} aria-label="Remove stop">×</button>
                    </div>
                ))}
                <label className="island-hop__add">
                    <span className="island-hop__label">Add an island</span>
                    <select className="island-hop__input" value="" onChange={(e) => { addStop(e.target.value); e.currentTarget.value = ''; }}>
                        <option value="" disabled>Choose…</option>
                        {ISLAND_OPTIONS.map((island) => (
                            <option key={island} value={island}>{island}</option>
                        ))}
                    </select>
                </label>
            </div>

            {status === 'loading' && (
                <div className="island-hop__loading" role="status" aria-live="polite">
                    <span className="island-hop__spinner" /> Costing your tour — searching flights and ferries…
                </div>
            )}

            {status === 'error' && (
                <div className="island-hop__error" role="alert">Could not plan the tour. Adjust the itinerary and try again.</div>
            )}

            {status === 'done' && tour && (tour.stops?.length ?? 0) > 0 && (
                <div className="island-hop__result">
                    <div className="island-hop__summary">
                        <div>
                            <p className="island-hop__label">Tour total</p>
                            <h3 className="island-hop__total">
                                {formatCurrency(tour.totalEur ?? 0, currency)}
                                <span className="island-hop__total-caption"> · {tour.totalNights} nights, 1 traveller</span>
                            </h3>
                        </div>
                        <div className="island-hop__summary-lines">
                            <div><span>Flights</span><strong>{formatCurrency(tour.flightsEur ?? 0, currency)}</strong></div>
                            <div><span>Ferries</span><strong>{formatCurrency(tour.ferriesEur ?? 0, currency)}</strong></div>
                            <div><span>Stays <em>est.</em></span><strong>{formatCurrency(tour.staysEur ?? 0, currency)}</strong></div>
                        </div>
                    </div>

                    {(tour.warnings?.length ?? 0) > 0 && (
                        <div className="island-hop__warnings">
                            {tour.warnings!.map((w, i) => <span key={i} className="island-hop__warn-pill">{w}</span>)}
                        </div>
                    )}

                    <div className="island-hop__timeline">
                        <div className="island-hop__leg island-hop__leg--flight">
                            <span className="island-hop__leg-icon"><FontAwesomeIcon icon={faPlane} /></span>
                            <div>
                                <strong>Fly in · {flightLabel(tour.flyIn?.from, tour.flyIn?.to, tour.flyIn?.airline)}</strong>
                                <span className="island-hop__leg-price">{formatCurrency(tour.flyIn?.priceEur ?? 0, currency)}</span>
                                <BookingLinks origin={tour.flyIn?.from} destination={tour.flyIn?.to} date={startDate} />
                            </div>
                        </div>

                        {tour.stops!.map((stop, index) => {
                            const next = tour.stops![index + 1];
                            const ferry = next ? ferryByIndex(stop.island, next.island) : undefined;
                            return (
                                <React.Fragment key={`${stop.island}-${index}`}>
                                    <div className="island-hop__leg island-hop__leg--stay">
                                        <span className="island-hop__leg-icon"><FontAwesomeIcon icon={faUmbrellaBeach} /></span>
                                        <div>
                                            <strong>{stop.island} · {stop.nights} {stop.nights === 1 ? 'night' : 'nights'}</strong>
                                            <span className="island-hop__leg-sub">
                                                via {stop.airport} · stay {formatCurrency(stop.stayEur, currency)}
                                                {stop.stayPriceLive ? ' (live rate)' : ' (est.)'}
                                            </span>

                                            {(stop.stays?.length ?? 0) > 0 && (
                                                <div className="island-hop__stays">
                                                    <span className="island-hop__stays-label">Where to stay</span>
                                                    {stop.stays!.map((h, hi) => (
                                                        <div key={`${h.name}-${hi}`} className="island-hop__stay">
                                                            <span className="island-hop__stay-name">{h.name}</span>
                                                            <span className="island-hop__stay-meta">
                                                                {h.pricePerNight
                                                                    ? `${formatCurrency(h.pricePerNight, h.priceCurrency ?? 'EUR')}/night`
                                                                    : 'Rate pending'}
                                                                {h.rating ? ` · ${h.rating.toFixed(1)}★` : ''}
                                                            </span>
                                                            <a
                                                                className="island-hop__stay-book"
                                                                href={h.bookingLink || accommodationUrls(h.name ?? stop.island, stop.island).booking}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                Book ↗
                                                            </a>
                                                        </div>
                                                    ))}
                                                    <div className="island-hop__stay-search">
                                                        <span>More in {stop.island}:</span>
                                                        <a href={accommodationUrls(stop.island).booking} target="_blank" rel="noopener noreferrer">Booking.com</a>
                                                        <a href={accommodationUrls(stop.island).airbnb} target="_blank" rel="noopener noreferrer">Airbnb</a>
                                                        <a href={accommodationUrls(stop.island).hostelworld} target="_blank" rel="noopener noreferrer">Hostelworld</a>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {ferry && (
                                        <div className="island-hop__leg island-hop__leg--ferry">
                                            <span className="island-hop__leg-icon"><FontAwesomeIcon icon={faShip} /></span>
                                            <div>
                                                <strong>Ferry {ferry.fromIsland} → {ferry.toIsland}</strong>
                                                <span className="island-hop__leg-sub">{formatMinutes(ferry.durationMinutes)}</span>
                                            </div>
                                            <span className="island-hop__leg-price">{formatCurrency(ferry.priceEur, currency)}</span>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        <div className="island-hop__leg island-hop__leg--flight">
                            <span className="island-hop__leg-icon"><FontAwesomeIcon icon={faPlane} /></span>
                            <div>
                                <strong>Fly home · {flightLabel(tour.flyOut?.from, tour.flyOut?.to, tour.flyOut?.airline)}</strong>
                                <span className="island-hop__leg-price">{formatCurrency(tour.flyOut?.priceEur ?? 0, currency)}</span>
                                <BookingLinks origin={tour.flyOut?.from} destination={tour.flyOut?.to} date={returnDate} />
                            </div>
                        </div>
                    </div>

                    <p className="island-hop__note">
                        Flight prices are live; ferry and stay figures are honest estimates. Open each island in Explore for real hotels.
                    </p>
                </div>
            )}
        </div>
    );
};

export default IslandHop;
