import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import TruthCard from './TruthCard';
import { AccommodationOption, Activity, ApiDiagnostics, DayPlan, Neighborhood, Restaurant, TripSuggestion } from '../services/api';
import { accommodationUrls, activityUrls, placeUrls } from '../services/affiliates';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const categoryEmoji: Record<string, string> = {
    culture: '🏛️', adventure: '🧗', food: '🍽️', nightlife: '🌙', nature: '🌿', shopping: '🛍️',
};


const ExternalLink: React.FC<{ href: string; label: string; className?: string }> = ({ href, label, className }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? 'trip-external-link'}>
        {label} <FontAwesomeIcon icon={faExternalLinkAlt} style={{ fontSize: '0.65rem', marginLeft: '4px' }} />
    </a>
);

const formatDiagnosticsTime = (value?: string): string => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(value));
};

/** Parse transport hint from freeform text (e.g. "10 min walk", "Bus 12", "metro") */
const extractTransportBadge = (text: string): { label: string; emoji: string } | null => {
    const t = text.toLowerCase();
    if (/\d+\s*min\s*(walk|on foot)/.test(t)) {
        const m = t.match(/(\d+)\s*min\s*(walk|on foot)/);
        return { label: `${m?.[1] ?? '~10'} min walk`, emoji: '🚶' };
    }
    if (/\btaxi\b|\bubер\b|\brideshare\b/.test(t)) return { label: 'Taxi / rideshare', emoji: '🚕' };
    if (/\bmetro\b|\bsubway\b|\bunderground\b/.test(t)) return { label: 'Metro', emoji: '🚇' };
    if (/\btram\b/.test(t)) return { label: 'Tram', emoji: '🚊' };
    if (/\bbus\b/.test(t)) {
        const m = t.match(/bus\s*(\w+)/);
        return { label: m?.[1] ? `Bus ${m[1]}` : 'Bus', emoji: '🚌' };
    }
    if (/\btrain\b|\brail\b/.test(t)) return { label: 'Train', emoji: '🚆' };
    if (/\bwalk\b|\bon foot\b/.test(t)) return { label: 'Walk', emoji: '🚶' };
    return null;
};

/** Parse price from freeform text (e.g. "€12", "free", "$20", "£8") */
const extractPrice = (text: string): string | null => {
    if (/\bfree\b/i.test(text)) return 'Free';
    const m = text.match(/[€$£¥][\d,.]+|\d+[\d,.]*\s*(?:€|EUR|USD|\$|£)/i);
    return m ? m[0] : null;
};

/* ─── Transport Badge ──────────────────────────────────────────────────────── */

const TransportBadge: React.FC<{ label: string; emoji: string }> = ({ label, emoji }) => (
    <div className="transport-badge">
        <div className="transport-badge__line" />
        <span className="transport-badge__pill">
            <span>{emoji}</span>
            <span>{label}</span>
        </span>
        <div className="transport-badge__line" />
    </div>
);

/* ─── Price Tag ────────────────────────────────────────────────────────────── */

const PriceTag: React.FC<{ price: string }> = ({ price }) => (
    <span className={`price-tag ${price === 'Free' ? 'price-tag--free' : ''}`}>{price}</span>
);

/* ─── Daily Budget Bar ─────────────────────────────────────────────────────── */

const DailyBudgetBar: React.FC<{ estimatedCost: number; dailyBudget: number }> = ({ estimatedCost, dailyBudget }) => {
    const pct = Math.min(100, Math.round((estimatedCost / dailyBudget) * 100));
    const over = estimatedCost > dailyBudget;
    const saving = dailyBudget - estimatedCost;

    return (
        <div className="budget-bar">
            <div className="budget-bar__header">
                <span className="budget-bar__label">Daily spend estimate</span>
                <span className={`budget-bar__amount ${over ? 'budget-bar__amount--over' : ''}`}>
                    ~€{estimatedCost} / €{dailyBudget}
                </span>
            </div>
            <div className="budget-bar__track">
                <div
                    className={`budget-bar__fill ${over ? 'budget-bar__fill--over' : 'budget-bar__fill--ok'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            {!over && saving > 0 && (
                <p className="budget-bar__savings">✅ ~€{saving} saved today vs your budget</p>
            )}
            {over && (
                <p className="budget-bar__savings budget-bar__savings--over">⚠️ ~€{Math.abs(saving)} over your daily budget</p>
            )}
        </div>
    );
};

/* ─── Request Diagnostics ──────────────────────────────────────────────────── */

export const RequestDiagnostics = ({ title, diagnostics }: { title: string; diagnostics: ApiDiagnostics | null }) => {
    if (!diagnostics) return null;
    return (
        <details className="debug-panel">
            <summary>{title}</summary>
            <dl className="debug-panel__grid">
                <div><dt>URL</dt><dd>{diagnostics.url}</dd></div>
                <div><dt>Status</dt><dd>{diagnostics.status ?? 'network error'} {diagnostics.statusText}</dd></div>
                <div><dt>Duration</dt><dd>{diagnostics.durationMs} ms</dd></div>
                <div><dt>When</dt><dd>{formatDiagnosticsTime(diagnostics.timestamp)}</dd></div>
                {diagnostics.error ? <div className="debug-panel__full"><dt>Error</dt><dd>{diagnostics.error}</dd></div> : null}
            </dl>
        </details>
    );
};

/* ─── Tab Types ────────────────────────────────────────────────────────────── */

type TripTab = 'overview' | 'restaurants' | 'activities' | 'stay' | 'itinerary';

const TRIP_TABS: { key: TripTab; label: string; emoji: string }[] = [
    { key: 'overview', label: 'Overview', emoji: '✨' },
    { key: 'restaurants', label: 'Restaurants', emoji: '🍽️' },
    { key: 'activities', label: 'Activities', emoji: '🎯' },
    { key: 'stay', label: 'Where to Stay', emoji: '🏨' },
    { key: 'itinerary', label: 'Day-by-Day', emoji: '📋' },
];

/* ─── Tab Content Components ───────────────────────────────────────────────── */

const OverviewTab: React.FC<{ trip: TripSuggestion }> = ({ trip }) => {
    const truth = trip.antiCauchemar ?? trip.cheapestFlight?.antiCauchemar;

    return (
        <div className="trip-tab-content stack-lg">
            {trip.summary && <p className="trip-summary">{trip.summary}</p>}
            <div className="trip-quickfacts">
                {trip.bestTimeToVisit && <div className="trip-quickfact"><span className="trip-quickfact__icon">📅</span><div><strong>Best Time</strong><p>{trip.bestTimeToVisit}</p></div></div>}
                {trip.estimatedBudget && <div className="trip-quickfact"><span className="trip-quickfact__icon">💰</span><div><strong>Budget</strong><p>{trip.estimatedBudget}</p></div></div>}
                {trip.weather && <div className="trip-quickfact"><span className="trip-quickfact__icon">🌤️</span><div><strong>Weather</strong><p>{trip.weather}</p></div></div>}
                {trip.language && <div className="trip-quickfact"><span className="trip-quickfact__icon">🗣️</span><div><strong>Language</strong><p>{trip.language}</p></div></div>}
                {trip.currency && <div className="trip-quickfact"><span className="trip-quickfact__icon">💱</span><div><strong>Currency</strong><p>{trip.currency}</p></div></div>}
            </div>
            <TruthCard truth={truth} />
            {trip.neighborhoods && trip.neighborhoods.length > 0 && (
                <div className="stack-md">
                    <h3>🏘️ Neighborhoods to Explore</h3>
                    <div className="trip-neighborhoods">{trip.neighborhoods.map((n: Neighborhood) => (
                        <div key={n.name} className="trip-neighborhood card">
                            <h4>{n.name}</h4><p className="trip-neighborhood__vibe">{n.vibe}</p><span className="tag">{n.bestFor}</span>
                            <div className="trip-booking-links" style={{ marginTop: '8px' }}>
                                <ExternalLink href={placeUrls(n.name, trip.destination).googleMaps} label="Explore on Maps" />
                            </div>
                        </div>
                    ))}</div>
                </div>
            )}
            {trip.localTips && trip.localTips.length > 0 && (
                <div className="stack-md">
                    <h3>💡 Local Tips</h3>
                    <div className="trip-tips">{trip.localTips.map((tip, i) => (
                        <div key={i} className="trip-tip"><span className="trip-tip__number">{i + 1}</span><p>{tip}</p></div>
                    ))}</div>
                </div>
            )}
            {trip.packingTips && trip.packingTips.length > 0 && (
                <div className="stack-md">
                    <h3>🎒 Packing List</h3>
                    <div className="trip-packing">{trip.packingTips.map((item, i) => (
                        <span key={i} className="trip-packing__item">✓ {item}</span>
                    ))}</div>
                </div>
            )}
        </div>
    );
};

const RestaurantsTab: React.FC<{ restaurants: Restaurant[]; destination?: string }> = ({ restaurants, destination }) => (
    <div className="trip-tab-content"><div className="trip-restaurants">{restaurants.map((r, i) => {
        const urls = placeUrls(r.name, destination);
        const price = extractPrice(r.priceRange) ?? r.priceRange;
        return (
        <article key={i} className="trip-restaurant card card--hoverable">
            <div className="trip-restaurant__header">
                <h4>{r.name}</h4>
                <PriceTag price={price} />
            </div>
            <span className="tag">{r.cuisine}</span>
            <div className="trip-restaurant__musttry"><strong>Must try:</strong> {r.mustTry}</div>
            {r.tip && <p className="trip-restaurant__tip">💡 {r.tip}</p>}
            <div className="trip-booking-links">
                <ExternalLink href={urls.googleMaps} label="View on Maps" />
                <ExternalLink href={urls.tripadvisor} label="Tripadvisor" />
                <ExternalLink href={urls.googleSearch('reservation')} label="Reserve" />
            </div>
        </article>
        );
    })}</div></div>
);

const ActivitiesTab: React.FC<{ activities: Activity[]; destination?: string }> = ({ activities, destination }) => (
    <div className="trip-tab-content"><div className="trip-activities">{activities.map((a, i) => {
        const urls = activityUrls(a.name, destination);
        const price = extractPrice(a.cost) ?? a.cost;
        const transport = extractTransportBadge(a.description);
        return (
        <article key={i} className="trip-activity card card--hoverable">
            <div className="trip-activity__header">
                <span className="trip-activity__emoji">{categoryEmoji[a.category] ?? '🎯'}</span>
                <div>
                    <h4>{a.name}</h4>
                    <div className="trip-activity__meta">
                        <span>⏱ {a.duration}</span>
                        <PriceTag price={price} />
                    </div>
                </div>
            </div>
            <p>{a.description}</p>
            <span className="tag">{a.category}</span>
            {transport && <TransportBadge label={transport.label} emoji={transport.emoji} />}
            <div className="trip-booking-links">
                <ExternalLink href={urls.googleMaps} label="View on Maps" />
                <ExternalLink href={urls.getYourGuide} label="GetYourGuide" />
                <ExternalLink href={urls.viator} label="Viator" />
                <ExternalLink href={urls.tripadvisor} label="Reviews" />
            </div>
        </article>
        );
    })}</div></div>
);

const StayTab: React.FC<{ accommodation: AccommodationOption[]; destination?: string }> = ({ accommodation, destination }) => (
    <div className="trip-tab-content"><div className="trip-accommodation">{accommodation.map((a, i) => {
        const urls = accommodationUrls(a.area, destination);
        return (
        <article key={i} className="trip-accommodation-card card card--hoverable">
            <div className="trip-accommodation-card__type">{a.type === 'Budget' ? '🏠' : a.type === 'Luxury' ? '🏰' : '🏨'} {a.type}</div>
            <h4>{a.area}</h4>
            <div className="trip-accommodation-card__price">
                <PriceTag price={a.pricePerNight} />
                <span className="muted-text"> / night</span>
            </div>
            {a.tip && <p className="trip-accommodation-card__tip">💡 {a.tip}</p>}
            <div className="trip-booking-links">
                <ExternalLink href={urls.booking} label="Booking.com" />
                <ExternalLink href={urls.airbnb} label="Airbnb" />
                <ExternalLink href={urls.hostelworld} label="Hostelworld" />
            </div>
        </article>
        );
    })}</div></div>
);

/* ─── Logistics Itinerary Tab ──────────────────────────────────────────────── */

interface LogisticsSlot {
    time: string;
    emoji: string;
    text: string;
}

const parseSlots = (d: DayPlan): LogisticsSlot[] => [
    { time: 'Morning', emoji: '☀️', text: d.morning },
    { time: 'Afternoon', emoji: '🌤️', text: d.afternoon },
    { time: 'Evening', emoji: '🌙', text: d.evening },
];

const ItineraryTab: React.FC<{ days: DayPlan[]; dailyBudget?: number }> = ({ days, dailyBudget }) => (
    <div className="trip-tab-content">
        <div className="trip-itinerary">
            {days.map((d) => {
                const slots = parseSlots(d);
                // Estimate cost from text prices in all slots combined
                const allText = `${d.morning} ${d.afternoon} ${d.evening}`;
                const priceMatches = [...allText.matchAll(/[€$£]\s?(\d+(?:[.,]\d+)?)/g)];
                const totalCost = priceMatches.reduce((sum, m) => sum + parseFloat(m[1].replace(',', '.')), 0);

                return (
                    <article key={d.day} className="trip-day card">
                        <div className="trip-day__header">
                            <span className="trip-day__badge">Day {d.day}</span>
                            <h4>{d.title}</h4>
                        </div>

                        {/* Budget bar if we have prices in the text */}
                        {dailyBudget && totalCost > 0 && (
                            <DailyBudgetBar estimatedCost={Math.round(totalCost)} dailyBudget={dailyBudget} />
                        )}

                        {/* Logistics timeline */}
                        <div className="logistics-timeline">
                            {slots.map((slot, si) => {
                                const transport = extractTransportBadge(slot.text);
                                const price = extractPrice(slot.text);
                                return (
                                    <React.Fragment key={slot.time}>
                                        <div className="logistics-slot">
                                            <div className="logistics-slot__time">
                                                <span className="logistics-slot__emoji">{slot.emoji}</span>
                                                <span className="logistics-slot__label">{slot.time}</span>
                                            </div>
                                            <div className="logistics-slot__body">
                                                <p>{slot.text}</p>
                                                <div className="logistics-slot__tags">
                                                    {price && <PriceTag price={price} />}
                                                </div>
                                            </div>
                                        </div>
                                        {transport && si < slots.length - 1 && (
                                            <TransportBadge label={transport.label} emoji={transport.emoji} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </article>
                );
            })}
        </div>
    </div>
);

/* ─── Loading Skeleton with rotating smart messages ────────────────────────── */

const SMART_MESSAGES = (destination: string, budget: number, transport: string): string[] => {
    const t = transport === 'walking' ? 'walking routes'
        : transport === 'taxi' ? 'taxi options'
        : transport === 'rental_car' ? 'driving routes'
        : 'bus & metro routes';
    return [
        `Researching ${destination || 'your destination'}…`,
        `Calculating the cheapest ${t} for you…`,
        `Finding restaurants that fit your €${budget}/day budget…`,
        `Scouting neighbourhoods locals actually go to…`,
        `Building your day-by-day logistics…`,
        `Almost there — polishing your itinerary…`,
    ];
};

const RotatingMessage: React.FC<{ messages: string[] }> = ({ messages }) => {
    const [idx, setIdx] = useState(0);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const t = setInterval(() => {
            setVisible(false);
            setTimeout(() => { setIdx((i) => (i + 1) % messages.length); setVisible(true); }, 300);
        }, 2800);
        return () => clearInterval(t);
    }, [messages.length]);

    return (
        <p className={`loading-message ${visible ? 'loading-message--in' : 'loading-message--out'}`}>
            {messages[idx]}
        </p>
    );
};

export const TripGuideLoading: React.FC<{
    title?: string;
    destination?: string;
    budget?: number;
    transport?: string;
}> = ({ title, destination = '', budget = 100, transport = 'public_transport' }) => {
    const messages = SMART_MESSAGES(destination, budget, transport);
    return (
        <section className="trip-guide trip-guide--loading">
            <div className="trip-guide__hero">
                <div className="trip-guide__hero-content">
                    <p className="eyebrow eyebrow--light">✨ AI-Powered Trip Guide</p>
                    <h2>{title ?? 'Building your travel guide...'}</h2>
                </div>
            </div>
            <div className="trip-loading">
                <div className="trip-loading__spinner">
                    <div className="trip-loading__orbit" />
                </div>
                <RotatingMessage messages={messages} />
                <div className="trip-loading__grid">
                    {['Restaurants', 'Activities', 'Neighbourhoods', 'Logistics'].map((text) => (
                        <div key={text} className="trip-loading__item loading-pulse">
                            <div className="trip-loading__bar" />
                            <p className="muted-text">{text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ─── Main TripGuide Component ─────────────────────────────────────────────── */

interface TripGuideProps {
    trip: TripSuggestion;
    diagnostics?: ApiDiagnostics | null;
    heroTitle?: string;
    dailyBudget?: number;
}

export const TripGuide: React.FC<TripGuideProps> = ({ trip, diagnostics, heroTitle, dailyBudget }) => {
    const [activeTab, setActiveTab] = useState<TripTab>('overview');
    const hasRestaurants = (trip.restaurants?.length ?? 0) > 0;
    const hasActivities = (trip.activities?.length ?? 0) > 0;
    const hasStay = (trip.accommodation?.length ?? 0) > 0;
    const hasItinerary = (trip.dayItinerary?.length ?? 0) > 0;
    const hasStructured = hasRestaurants || hasActivities || hasStay || hasItinerary;

    // Auto-select itinerary tab when available (most valuable)
    useEffect(() => {
        if (hasItinerary) setActiveTab('itinerary');
    }, [hasItinerary]);

    if (!hasStructured && !trip.summary) {
        return (
            <section className="card section-card stack-lg">
                <div className="section-card__header"><div><p className="eyebrow">✨ AI Trip Brief</p><h2>{heroTitle ?? `${trip.origin} → ${trip.destination}`}</h2></div></div>
                <p className="ai-suggestion-text">{trip.suggestion ?? trip.rawText ?? ''}</p>
                {diagnostics && <RequestDiagnostics title="AI request details" diagnostics={diagnostics} />}
            </section>
        );
    }

    return (
        <section className="trip-guide">
            <div className="trip-guide__hero">
                <div className="trip-guide__hero-content">
                    <p className="eyebrow eyebrow--light">✨ AI-Powered Trip Guide</p>
                    <h2>{heroTitle ?? `${trip.origin} → ${trip.destination}`}</h2>
                    {trip.summary && <p className="trip-guide__summary">{trip.summary}</p>}
                    {dailyBudget && (
                        <div className="trip-guide__budget-chip">
                            💰 €{dailyBudget}/day budget
                        </div>
                    )}
                </div>
            </div>
            {hasStructured && (
                <nav className="trip-tabs">
                    {TRIP_TABS.map((tab) => {
                        if (tab.key === 'restaurants' && !hasRestaurants) return null;
                        if (tab.key === 'activities' && !hasActivities) return null;
                        if (tab.key === 'stay' && !hasStay) return null;
                        if (tab.key === 'itinerary' && !hasItinerary) return null;
                        return (
                            <button key={tab.key} type="button" className={`trip-tab ${activeTab === tab.key ? 'trip-tab--active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                                <span>{tab.emoji}</span> {tab.label}
                            </button>
                        );
                    })}
                </nav>
            )}
            <div className="trip-guide__body">
                {activeTab === 'overview' && <OverviewTab trip={trip} />}
                {activeTab === 'restaurants' && hasRestaurants && <RestaurantsTab restaurants={trip.restaurants!} destination={trip.destination} />}
                {activeTab === 'activities' && hasActivities && <ActivitiesTab activities={trip.activities!} destination={trip.destination} />}
                {activeTab === 'stay' && hasStay && <StayTab accommodation={trip.accommodation!} destination={trip.destination} />}
                {activeTab === 'itinerary' && hasItinerary && <ItineraryTab days={trip.dayItinerary!} dailyBudget={dailyBudget} />}
            </div>
            {diagnostics && <RequestDiagnostics title="AI request details" diagnostics={diagnostics} />}
        </section>
    );
};

