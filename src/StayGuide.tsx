import { faBed, faBuilding, faCampground, faCar, faHotel, faHouse, faLocationDot, faUmbrellaBeach } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AirportAutocomplete from './components/AirportAutocomplete';
import PlaceImage from './components/PlaceImage';
import { accommodationUrls, placeUrls } from './services/affiliates';
import {
    CATEGORY_LABELS,
    StayCategory,
    StayGuideEntry,
    StayDetails,
    StayGuideResult,
    VerifiedStay,
    fetchStayDetails,
    loadStayGuide,
    sortEntries,
} from './services/stayGuide';
import './StayGuide.css';
import NightlyRateCaveat from './components/NightlyRateCaveat';

// How many directory cards per page — keeps a 200-stay city navigable.
const PAGE_SIZE = 24;
type CategoryFilter = StayCategory | 'all';

type LoadStatus = 'idle' | 'loading' | 'done' | 'error';

// Icon per category, from the same set as the rest of the app. These were emoji,
// which render as clip-art of a different style and size next to every real icon
// on the page — and differ per platform, so the list never looked even.
const CATEGORY_ICON: Record<StayCategory, IconDefinition> = {
    hotel: faHotel,
    resort: faUmbrellaBeach,
    apartment: faBuilding,
    guest_house: faHouse,
    hostel: faBed,
    motel: faCar,
    camp: faCampground,
    other: faLocationDot,
};

const formatDistance = (km: number | null): string | null => {
    if (km == null) return null;
    if (km < 1) return `${Math.round(km * 1000)} m from centre`;
    return `${km.toFixed(km < 10 ? 1 : 0)} km from centre`;
};

// Strip a trailing " (CODE)" so deep-link queries read as a plain city name.
const cityName = (label: string): string => label.replace(/\s*\([A-Z0-9]{3}\)\s*$/, '').trim();

const formatPrice = (value: number, currency?: string): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency || 'EUR',
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${Math.round(value)} ${currency || 'EUR'}`;
    }
};

type DetailsState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; details: StayDetails }
    | { status: 'error' };

const StayCard: React.FC<{ entry: StayGuideEntry; city: string }> = ({ entry, city }) => {
    // Lazily loaded on click only. The lookup is free (OpenTripMap's free endpoint,
    // DB-cached server-side) — but doing it for all 200 cards eagerly would still
    // trip OTM's rate limit, so it stays strictly user-initiated.
    const [details, setDetails] = useState<DetailsState>({ status: 'idle' });

    const loadDetails = useCallback(async () => {
        setDetails({ status: 'loading' });
        try {
            setDetails({ status: 'loaded', details: await fetchStayDetails(entry.xid) });
        } catch {
            setDetails({ status: 'error' });
        }
    }, [entry.xid]);

    const distance = formatDistance(entry.distanceKm);
    const { pricePerNight, priceCurrency, rating, reviewsCount, reviewSummary, curated } = entry.enrichment;
    const hasPrice = entry.enrichment.status === 'loaded' && pricePerNight != null;
    // Prefer the backend's matched booking link; fall back to a plain Booking search.
    const booking = entry.enrichment.bookingLink || accommodationUrls(entry.name, city).booking;
    const maps = placeUrls(entry.name, city).googleMaps;

    return (
        <li className={`stay-guide__card${curated ? ' stay-guide__card--curated' : ''}`}>
            <PlaceImage
                className="stay-guide__card-photo"
                src={entry.enrichment.thumbnailUrl}
                alt={`${entry.name} — property photo`}
                label={entry.name}
            />
            <div className="stay-guide__card-head">
                <span className="stay-guide__card-emoji" aria-hidden="true"><FontAwesomeIcon icon={CATEGORY_ICON[entry.category]} /></span>
                <div className="stay-guide__card-titles">
                    <h4 className="stay-guide__card-name">{entry.name}</h4>
                    <div className="stay-guide__card-meta">
                        {rating != null && (
                            <span className="stay-guide__card-rating">
                                ★ {rating.toFixed(1)}{reviewsCount != null ? ` (${reviewsCount})` : ''}
                            </span>
                        )}
                        {distance && <span className="stay-guide__card-distance">{distance}</span>}
                    </div>
                </div>
                {hasPrice ? (
                    <span className="stay-guide__card-price" title="Live TripAdvisor rate via Xotelo">
                        <strong>{formatPrice(pricePerNight as number, priceCurrency)}</strong>
                        <span className="stay-guide__card-price-unit">/night</span>
                    </span>
                ) : (
                    // No live rate: still always an action.
                    <span className="stay-guide__card-noprice" title="No live rate matched — check directly">
                        Check rate
                    </span>
                )}
            </div>
            {reviewSummary && <p className="stay-guide__card-note">“{reviewSummary}”</p>}

            {details.status === 'loaded' && (
                <div className="stay-guide__card-details">
                    {details.details.addressLine && (
                        <span className="stay-guide__card-address">{details.details.addressLine}</span>
                    )}
                    {!details.details.websiteUrl && !details.details.addressLine && (
                        <span className="stay-guide__card-address">No further details listed.</span>
                    )}
                </div>
            )}
            {details.status === 'error' && (
                <div className="stay-guide__card-details">
                    <span className="stay-guide__card-address">Couldn’t load details — try again.</span>
                </div>
            )}

            <div className="stay-guide__card-actions">
                <a className="stay-guide__link stay-guide__link--primary" href={booking} target="_blank" rel="noopener noreferrer">
                    {hasPrice ? 'Book ↗' : 'Check on Booking ↗'}
                </a>
                <a className="stay-guide__link" href={maps} target="_blank" rel="noopener noreferrer">
                    Map ↗
                </a>
                {/* The property's own site is only known after the free details
                    lookup, so the button becomes that link once it resolves. */}
                {details.status === 'loaded' && details.details.websiteUrl ? (
                    <a
                        className="stay-guide__link stay-guide__link--site"
                        href={details.details.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Hotel site ↗
                    </a>
                ) : details.status === 'idle' ? (
                    <button type="button" className="stay-guide__link stay-guide__link--button" onClick={loadDetails}>
                        Details ↗
                    </button>
                ) : details.status === 'loading' ? (
                    <span className="stay-guide__link stay-guide__link--muted" role="status">Loading…</span>
                ) : null}
            </div>
        </li>
    );
};

const VerifiedCard: React.FC<{ stay: VerifiedStay; city: string }> = ({ stay, city }) => {
    const distance = formatDistance(stay.distanceKm);
    const hasPrice = stay.pricePerNight != null;
    const booking = accommodationUrls(stay.name, city).booking;

    return (
        <li className="stay-guide__card stay-guide__card--verified">
            <PlaceImage
                className="stay-guide__card-photo"
                src={stay.photoUrl}
                alt={`${stay.name} — exterior`}
                label={stay.name}
            />
            <div className="stay-guide__card-head">
                <span className="stay-guide__card-emoji" aria-hidden="true">✅</span>
                <div className="stay-guide__card-titles">
                    <h4 className="stay-guide__card-name">{stay.name}</h4>
                    <div className="stay-guide__card-meta">
                        {stay.rating != null && (
                            <span className="stay-guide__card-rating">
                                ★ {stay.rating.toFixed(1)}{stay.reviewsCount != null ? ` (${stay.reviewsCount})` : ''}
                            </span>
                        )}
                        {distance && <span className="stay-guide__card-distance">{distance}</span>}
                    </div>
                </div>
                {hasPrice ? (
                    <span className="stay-guide__card-price" title="Live TripAdvisor rate via Xotelo">
                        <strong>{formatPrice(stay.pricePerNight as number, stay.priceCurrency)}</strong>
                        <span className="stay-guide__card-price-unit">/night</span>
                    </span>
                ) : (
                    <span className="stay-guide__card-noprice" title="No live rate quoted for the sample dates">
                        No rate now
                    </span>
                )}
            </div>
            {stay.reviewNote && <p className="stay-guide__card-note">“{stay.reviewNote}”</p>}
            <div className="stay-guide__card-actions">
                <a className="stay-guide__link stay-guide__link--primary" href={booking} target="_blank" rel="noopener noreferrer">
                    Book ↗
                </a>
            </div>
        </li>
    );
};

const StayGuide: React.FC = () => {
    const [iata, setIata] = useState('');
    const [status, setStatus] = useState<LoadStatus>('idle');
    const [result, setResult] = useState<StayGuideResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runSearch = useCallback(async (code: string) => {
        if (!code) return;
        setStatus('loading');
        setError(null);
        try {
            const guide = await loadStayGuide(code);
            setResult(guide);
            setStatus('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load the accommodation guide.');
            setResult(null);
            setStatus('error');
        }
    }, []);

    const handlePick = useCallback((code: string) => {
        setIata(code);
        void runSearch(code);
    }, [runSearch]);

    const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
    const [page, setPage] = useState(1);

    // A fresh search resets the filter; switching category resets to page 1.
    useEffect(() => { setActiveCategory('all'); setPage(1); }, [result]);
    useEffect(() => { setPage(1); }, [activeCategory]);

    const directoryEntries = useMemo(() => {
        if (!result) return [];
        const base = activeCategory === 'all'
            ? result.entries
            : result.entries.filter((entry) => entry.category === activeCategory);
        return sortEntries(base);
    }, [result, activeCategory]);

    const totalPages = Math.max(1, Math.ceil(directoryEntries.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageEntries = directoryEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const city = result ? cityName(result.place.label) : '';

    return (
        <div className="stay-guide">
            <header className="stay-guide__header">
                <div className="stay-guide__header-copy">
                    <p className="stay-guide__eyebrow">Accommodation directory</p>
                    <h1 className="stay-guide__title">Stay Guide</h1>
                    <p className="stay-guide__subtitle">
                        Every place to stay in a destination — hotels, hostels, apartments and more.
                        Where we have a live nightly rate, it is shown. Everything else links straight
                        to the property so you can check the price at the source.
                    </p>
                    <NightlyRateCaveat variant="block" />
                </div>
            </header>

            <div className="stay-guide__search">
                <AirportAutocomplete
                    label="Destination"
                    value={iata}
                    onChange={handlePick}
                    placeholder="Search a city or airport…"
                />
                {status === 'done' && result && (
                    <button
                        type="button"
                        className="stay-guide__refresh"
                        onClick={() => runSearch(iata)}
                    >
                        Refresh
                    </button>
                )}
            </div>

            {status === 'loading' && (
                <p className="stay-guide__status" role="status">Gathering every stay near {iata || 'the destination'}…</p>
            )}

            {status === 'error' && (
                <p className="stay-guide__status stay-guide__status--error" role="alert">{error}</p>
            )}

            {status === 'done' && result && (
                result.total === 0 ? (
                    <p className="stay-guide__status" role="status">
                        No accommodations found near {result.place.label}. Try a nearby larger city.
                    </p>
                ) : (
                    <section className="stay-guide__results" aria-label="Accommodation directory">
                        <div className="stay-guide__summary">
                            <span className="stay-guide__summary-count">{result.total} stays</span>
                            <span className="stay-guide__summary-place">near {result.place.label}</span>
                            {result.pricedCount > 0 && (
                                <span className="stay-guide__summary-priced" title="Live TripAdvisor rates via Xotelo">
                                    {result.pricedCount} with live rates
                                </span>
                            )}
                            {result.place.source === 'airport' && (
                                <span className="stay-guide__summary-note" title="No curated city centre — centred on the airport">
                                    centred on airport
                                </span>
                            )}
                        </div>

                        {result.verified.length > 0 && (
                            <div className="stay-guide__group stay-guide__group--verified">
                                <h3 className="stay-guide__group-title">
                                    <span className="stay-guide__group-emoji" aria-hidden="true">✅</span>
                                    Verified stays — live rates
                                    <span className="stay-guide__group-count">{result.verified.length}</span>
                                </h3>
                                <p className="stay-guide__group-sub">
                                    Curated TripAdvisor hotels priced live via Xotelo — separate from the OpenTripMap directory below.
                                </p>
                                <ul className="stay-guide__list">
                                    {result.verified.map((stay) => (
                                        <VerifiedCard key={stay.hotelKey} stay={stay} city={city} />
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="stay-guide__group">
                            <div className="stay-guide__tabs" role="tablist" aria-label="Filter by category">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeCategory === 'all'}
                                    className={`stay-guide__tab${activeCategory === 'all' ? ' stay-guide__tab--active' : ''}`}
                                    onClick={() => setActiveCategory('all')}
                                >
                                    All <span className="stay-guide__tab-count">{result.total}</span>
                                </button>
                                {/* One tab per category actually present in the data (from OTM `kinds`). */}
                                {result.groups.map((group) => (
                                    <button
                                        key={group.category}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeCategory === group.category}
                                        className={`stay-guide__tab${activeCategory === group.category ? ' stay-guide__tab--active' : ''}`}
                                        onClick={() => setActiveCategory(group.category)}
                                    >
                                        <FontAwesomeIcon icon={CATEGORY_ICON[group.category]} aria-hidden="true" /> {CATEGORY_LABELS[group.category]}
                                        <span className="stay-guide__tab-count">{group.entries.length}</span>
                                    </button>
                                ))}
                            </div>

                            <ul className="stay-guide__list">
                                {pageEntries.map((entry) => (
                                    <StayCard key={entry.xid} entry={entry} city={city} />
                                ))}
                            </ul>

                            {totalPages > 1 && (
                                <div className="stay-guide__pagination" role="navigation" aria-label="Pagination">
                                    <button
                                        type="button"
                                        className="stay-guide__page-btn"
                                        disabled={safePage <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        ← Prev
                                    </button>
                                    <span className="stay-guide__page-status" role="status">
                                        Page {safePage} of {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className="stay-guide__page-btn"
                                        disabled={safePage >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        Next →
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>
                )
            )}

            {status === 'idle' && (
                <p className="stay-guide__status stay-guide__status--muted">
                    Pick a destination to see every accommodation that exists there.
                </p>
            )}
        </div>
    );
};

export default StayGuide;
