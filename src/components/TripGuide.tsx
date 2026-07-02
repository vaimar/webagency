import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useMemo, useState } from 'react';
import TruthCard from './TruthCard';
import { AccommodationOption, Activity, ApiDiagnostics, DayPlan, Neighborhood, PreferredTransport, Restaurant, TripSuggestion } from '../services/api';
import { accommodationUrls, activityUrls, flightUrls, placeUrls } from '../services/affiliates';
import { getAntiCauchemarPricingSummary } from '../services/antiCauchemarPricing';

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

const formatMoney = (value: number, currency: string = 'EUR'): string => {
    if (!Number.isFinite(value)) {
        return `${currency} —`;
    }

    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${Math.round(value)} ${currency}`;
    }
};

const parseMoneyNumber = (text?: string): number | null => {
    if (!text) return null;
    const match = text.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const value = Number.parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
};

const priceRangeToMealEstimate = (value?: string): number => {
    const text = (value ?? '').trim();
    if (!text) return 22;
    if (/free/i.test(text)) return 0;
    if (/€€€€/.test(text)) return 75;
    if (/€€€/.test(text)) return 50;
    if (/€€/.test(text)) return 28;
    if (/€/.test(text)) return 16;

    const parsed = parseMoneyNumber(text);
    return parsed ?? 22;
};

const transportDailyEstimate = (preferredTransport?: PreferredTransport): number => {
    switch (preferredTransport) {
        case 'walking':
            return 6;
        case 'taxi':
            return 34;
        case 'rental_car':
            return 52;
        default:
            return 12;
    }
};

interface PackageEstimate {
    currency: string;
    days: number;
    flight: number;
    stay: number;
    food: number;
    transport: number;
    total: number;
}

const estimatePackage = (trip: TripSuggestion, days: number, dailyBudget?: number, preferredTransport?: PreferredTransport): PackageEstimate | null => {
    const currency = trip.currency ?? trip.cheapestFlight?.antiCauchemar?.currency ?? trip.cheapestFlight?.currency ?? 'EUR';
    const flightPricing = getAntiCauchemarPricingSummary(trip.cheapestFlight?.price, trip.cheapestFlight?.antiCauchemar);
    const flight = flightPricing.estimatedEntryPrice
        ?? (typeof trip.cheapestFlight?.price === 'number' ? trip.cheapestFlight.price : Number.parseFloat(String(trip.cheapestFlight?.price ?? '')));

    if (!Number.isFinite(flight)) {
        return null;
    }

    const nightlyStay = parseMoneyNumber(trip.accommodation?.[0]?.pricePerNight) ?? Math.max(65, Math.round((dailyBudget ?? 100) * 0.7));
    const averageMeal = trip.restaurants && trip.restaurants.length > 0
        ? Math.round(trip.restaurants.slice(0, 5).reduce((sum, item) => sum + priceRangeToMealEstimate(item.priceRange), 0) / Math.min(trip.restaurants.length, 5))
        : Math.max(18, Math.round((dailyBudget ?? 100) * 0.28));
    const food = averageMeal * 2 * days;
    const stay = nightlyStay * days;
    const transport = Math.round(transportDailyEstimate(preferredTransport) * days);
    const total = Math.round(flight + stay + food + transport);

    return {
        currency,
        days,
        flight: Math.round(flight),
        stay,
        food,
        transport,
        total,
    };
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

const MIN_RECOMMENDATION_TARGET = 10;

const TRIP_TABS: { key: TripTab; label: string; emoji: string }[] = [
    { key: 'overview', label: 'Overview', emoji: '✨' },
    { key: 'restaurants', label: 'Restaurants', emoji: '🍽️' },
    { key: 'activities', label: 'Activities', emoji: '🎯' },
    { key: 'stay', label: 'Where to Stay', emoji: '🏨' },
    { key: 'itinerary', label: 'Day-by-Day', emoji: '📋' },
];

const RecommendationCountWarning: React.FC<{ count: number; noun: string }> = ({ count, noun }) => {
    if (count <= 0 || count >= MIN_RECOMMENDATION_TARGET) {
        return null;
    }

    return (
        <div className="notice-banner notice-banner--warning recommendation-count-warning">
            <span>
                Backend returned <strong>{count}</strong> {noun}. The UI is not truncating this list — the current limit is upstream.
            </span>
        </div>
    );
};

const PackageSummary: React.FC<{
    trip: TripSuggestion;
    days: number;
    dailyBudget?: number;
    preferredTransport?: PreferredTransport;
}> = ({ trip, days, dailyBudget, preferredTransport }) => {
    const estimate = useMemo(
        () => estimatePackage(trip, days, dailyBudget, preferredTransport),
        [dailyBudget, days, preferredTransport, trip],
    );

    if (!estimate) {
        return null;
    }

    const leadFlight = trip.cheapestFlight;
    const leadStay = trip.accommodation?.[0];
    const leadRestaurant = trip.restaurants?.[0];
    const leadActivity = trip.activities?.[0];
    const departureDate = (leadFlight?.departureDate ?? leadFlight?.departureTime ?? '').slice(0, 10);
    const flightBookingUrls = leadFlight && departureDate
        ? flightUrls(leadFlight.origin, leadFlight.destination, departureDate)
        : null;
    const stayBookingUrls = leadStay ? accommodationUrls(leadStay.area, trip.destination) : null;
    const restaurantUrls = leadRestaurant ? placeUrls(leadRestaurant.name, trip.destination) : null;
    const activityBookingUrls = leadActivity ? activityUrls(leadActivity.name, trip.destination) : null;

    return (
        <section className="trip-package card">
            <div className="trip-package__header">
                <div>
                    <p className="eyebrow">❄️ Honest package</p>
                    <h3>Your door-to-trip estimate</h3>
                    <p className="muted-text">Flight, where to sleep, food, and local transport for one traveller — then book each part on the right site with explicit provider handoff.</p>
                </div>
                <div className="trip-package__total">
                    <span className="trip-package__total-label">Door-to-trip total</span>
                    <strong>{formatMoney(estimate.total, estimate.currency)}</strong>
                    <span>{estimate.days} day{estimate.days !== 1 ? 's' : ''}</span>
                </div>
            </div>

            <div className="trip-package__grid">
                <div className="trip-package__line-item"><span>Flight</span><strong>{formatMoney(estimate.flight, estimate.currency)}</strong></div>
                <div className="trip-package__line-item"><span>Where to sleep</span><strong>{formatMoney(estimate.stay, estimate.currency)}</strong></div>
                <div className="trip-package__line-item"><span>Food</span><strong>{formatMoney(estimate.food, estimate.currency)}</strong></div>
                <div className="trip-package__line-item"><span>Transport</span><strong>{formatMoney(estimate.transport, estimate.currency)}</strong></div>
            </div>

            <div className="notice-banner trip-package__note">
                <span>This total is an honest estimate, not a fake one-click bundle. It uses the real-world flight price, lead stay pricing, food signals, and transport friction. Any excluded activity or parking costs should stay visible separately.</span>
            </div>

            <div className="trip-package__booking-groups">
                {flightBookingUrls && (
                    <div className="trip-package__booking-card">
                        <h4>Book the flight</h4>
                        <p className="muted-text">Direct Ryanair handoff first, then backup search links.</p>
                        <div className="trip-booking-links">
                            <ExternalLink href={flightBookingUrls.ryanair} label="Ryanair" />
                            <ExternalLink href={flightBookingUrls.googleFlights} label="Google Flights" />
                            <ExternalLink href={flightBookingUrls.skyscanner} label="Skyscanner" />
                        </div>
                    </div>
                )}
                {stayBookingUrls && (
                    <div className="trip-package__booking-card">
                        <h4>Book where to sleep</h4>
                        <p className="muted-text">Lead stay area: {leadStay?.area}</p>
                        <div className="trip-booking-links">
                            {leadStay?.officialWebsiteUrl
                                ? <ExternalLink href={leadStay.officialWebsiteUrl} label="Live hotel provider" />
                                : <ExternalLink href={stayBookingUrls.booking} label="Booking.com" />}
                            <ExternalLink href={stayBookingUrls.airbnb} label="Airbnb" />
                            <ExternalLink href={stayBookingUrls.hostelworld} label="Hostelworld" />
                        </div>
                    </div>
                )}
                {(restaurantUrls || activityBookingUrls) && (
                    <div className="trip-package__booking-card">
                        <h4>Book the rest</h4>
                        <p className="muted-text">Use the recommended places and tours after the package total looks right.</p>
                        <div className="trip-booking-links">
                            {restaurantUrls && <ExternalLink href={restaurantUrls.tripadvisor} label="Restaurants" />}
                            {activityBookingUrls && <ExternalLink href={activityBookingUrls.getYourGuide} label="Activities" />}
                            {restaurantUrls && <ExternalLink href={restaurantUrls.googleMaps} label="Maps" />}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

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
    <div className="trip-tab-content stack-md">
        <RecommendationCountWarning count={restaurants.length} noun="restaurant recommendations" />
        <div className="trip-restaurants">{restaurants.map((r, i) => {
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
    })}</div>
    </div>
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
    <div className="trip-tab-content stack-md">
        <RecommendationCountWarning count={accommodation.length} noun="stay recommendations" />
        <div className="trip-accommodation">{accommodation.map((a, i) => {
        const urls = accommodationUrls(a.area, destination);
        return (
        <article key={i} className="trip-accommodation-card card card--hoverable">
            <div className="trip-accommodation-card__type">{a.type === 'Budget' ? '🏠' : a.type === 'Luxury' ? '🏰' : '🏨'} {a.type}</div>
            <h4>{a.area}</h4>
            <div className="trip-accommodation-card__price">
                <PriceTag price={a.pricePerNight} />
                <span className="muted-text"> / night</span>
            </div>
            <p className="muted-text" style={{ fontSize: '0.78rem' }}>Price may vary for group size.</p>
            {a.tip && <p className="trip-accommodation-card__tip">💡 {a.tip}</p>}
            <div className="trip-booking-links">
                {a.officialWebsiteUrl
                    ? <ExternalLink href={a.officialWebsiteUrl} label="Live hotel provider" />
                    : <ExternalLink href={urls.booking} label="Booking.com" />}
                <ExternalLink href={urls.airbnb} label="Airbnb" />
                <ExternalLink href={urls.hostelworld} label="Hostelworld" />
            </div>
        </article>
        );
    })}</div>
    </div>
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
    days?: number;
    preferredTransport?: PreferredTransport;
}

export const TripGuide: React.FC<TripGuideProps> = ({ trip, diagnostics, heroTitle, dailyBudget, days, preferredTransport }) => {
    const [activeTab, setActiveTab] = useState<TripTab>('overview');
    const hasRestaurants = (trip.restaurants?.length ?? 0) > 0;
    const hasActivities = (trip.activities?.length ?? 0) > 0;
    const hasStay = (trip.accommodation?.length ?? 0) > 0;
    const hasItinerary = (trip.dayItinerary?.length ?? 0) > 0;
    const hasStructured = hasRestaurants || hasActivities || hasStay || hasItinerary;
    const tripDays = days ?? trip.dayItinerary?.length ?? 4;
    const tabLabels: Partial<Record<TripTab, string>> = {
        restaurants: hasRestaurants ? `Restaurants (${trip.restaurants?.length ?? 0})` : 'Restaurants',
        stay: hasStay ? `Where to Stay (${trip.accommodation?.length ?? 0})` : 'Where to Stay',
    };

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
            <div className="trip-guide__body trip-guide__body--package">
                <PackageSummary trip={trip} days={tripDays} dailyBudget={dailyBudget} preferredTransport={preferredTransport} />
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
                                <span>{tab.emoji}</span> {tabLabels[tab.key] ?? tab.label}
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

