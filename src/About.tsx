import {
    faCableCar, faCar, faCheckCircle, faPlane, faShieldAlt, faShip, faTag, faTrain, faWater,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SpotTile from './components/SpotTile';
import { API_BASE } from './services/api';
import { trackedFetch } from './services/serviceStatus';

/**
 * The landing page is two halves, because the product is: a catalogue of cable
 * parks, and an engine that prices the way in. It used to be neither — a grid of
 * six city photographs linking to /explore, a "See all routes" link to /explore,
 * and a closing row of three buttons pointing at /explore, /trip-ledger and one
 * hardcoded ski resort. Nine outbound links to five modules, none of which is
 * what a first visitor is here for, and several of which are half-finished.
 *
 * What is left goes to exactly two places — the map of parks and the flight
 * pricer — which is the same pair primary navigation carries. Everything else is
 * still reachable from the footer, which is where a link to an unfinished module
 * belongs.
 */

/** One row of /api/destinations/spots. Only the fields this page actually reads. */
interface SpotSummary {
    slug: string | null;
    destinationLabel: string;
    country: string | null;
    towType: string | null;
    imageUrl: string | null;
    curationLevel: string | null;
}

interface Coverage {
    parks: number;
    countries: number;
    verified: number;
}

/**
 * How many parks the grid shows. Six fills the row on a laptop without turning
 * the front page into the finder — the map is the place to browse all of them.
 */
const FEATURED_COUNT = 6;

/** Best-curated first. Anything unrecognised sorts last rather than crashing. */
const CURATION_RANK: Record<string, number> = {
    VENUE_READY: 0, CURATED: 1, ENRICHED: 2, DISCOVERED: 3,
};

const TRACTION_BADGE: Record<string, string> = {
    CABLE: 'Cable', FULL_CABLE: 'Full cable', CABLE_UNSPECIFIED: 'Cable',
    SYSTEM_2_0: 'System 2.0', MIXED: 'Cable + S2', BOAT: 'Boat', WINCH: 'Winch',
};

const TRACTION_NOTE: Record<string, string> = {
    CABLE: 'Cable tow — a full lap under the towers.',
    FULL_CABLE: 'Full-size cable — a full lap under the towers.',
    CABLE_UNSPECIFIED: 'Cable tow.',
    SYSTEM_2_0: 'System 2.0 — two towers, short laps, forgiving to learn on.',
    MIXED: 'Full cable for laps, plus a System 2.0 line.',
    BOAT: 'Boat-towed, so sessions go by the hour.',
    WINCH: 'Winch tow — short, straight pulls.',
};

/**
 * Country names from the platform rather than a fourth hardcoded table — this
 * page needs ten of them and two other files already carry their own map. Falls
 * back to the ISO code, which is still a fact, if the runtime has no such data.
 */
const countryLabel = (code: string | null): string => {
    if (!code) return '';
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
    } catch {
        return code;
    }
};

/**
 * The catalogue, read once and used for both the park grid and the figures
 * strip. The strip they replace read "10M+ Happy Travelers / 500+ Airlines /
 * 4.8* App Rating" — none of which was true, and all of which would have stayed
 * untrue as the product grew. A number on a marketing page should either be
 * measured or not be there; measuring it also means it can never go stale.
 *
 * Wakeboarding only. The other activity with rows behind it is skiing, which has
 * exactly one, and folding it in bought a bigger number at the cost of the
 * sentence being true.
 */
const useWakeSpots = (): { spots: SpotSummary[]; coverage: Coverage | null } => {
    const [spots, setSpots] = useState<SpotSummary[]>([]);

    useEffect(() => {
        let cancelled = false;
        trackedFetch(`${API_BASE}/api/destinations/spots?activity=wakeboarding`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data: SpotSummary[]) => {
                if (!cancelled && Array.isArray(data)) setSpots(data);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const coverage = useMemo<Coverage | null>(() => {
        if (spots.length === 0) return null;
        return {
            parks: spots.length,
            countries: new Set(spots.map((s) => s.country).filter(Boolean)).size,
            verified: spots.filter((s) => s.curationLevel === 'VENUE_READY').length,
        };
    }, [spots]);

    return { spots, coverage };
};

/**
 * Which parks the front page shows.
 *
 * Only parks with a slug, because those are the ones with a page to open — a
 * tile that goes nowhere is worse than one fewer tile. Photographed parks come
 * first (about a quarter of the catalogue has one), then parks whose tow type
 * somebody has actually recorded (a third have none), then best-curated, then
 * alphabetical — so the same six appear on every visit rather than shuffling.
 *
 * The second pass spreads the row across countries before it doubles up on one.
 * Three quarters of the catalogue is French, so ranking alone returns a grid
 * that reads as "cable parks in France" when the honest answer is Europe.
 */
const pickFeatured = (spots: SpotSummary[]): SpotSummary[] => {
    const ranked = spots
        .filter((spot) => spot.slug)
        .sort((left, right) => {
            const photo = Number(Boolean(right.imageUrl)) - Number(Boolean(left.imageUrl));
            if (photo !== 0) return photo;
            const traction = Number(Boolean(right.towType)) - Number(Boolean(left.towType));
            if (traction !== 0) return traction;
            const curation = (CURATION_RANK[left.curationLevel ?? ''] ?? 9)
                - (CURATION_RANK[right.curationLevel ?? ''] ?? 9);
            if (curation !== 0) return curation;
            return left.destinationLabel.localeCompare(right.destinationLabel);
        });

    const seen = new Set<string>();
    const spread = ranked.filter((spot) => {
        const key = spot.country ?? '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const featured = [...spread];
    for (const spot of ranked) {
        if (featured.length >= FEATURED_COUNT) break;
        if (!featured.includes(spot)) featured.push(spot);
    }
    return featured.slice(0, FEATURED_COUNT);
};

const trustFeatures = [
    { icon: faShieldAlt, title: 'The total, not the teaser', desc: 'Fare, bags, transfer and first mile in one number' },
    { icon: faTag, title: 'Every cost labelled', desc: 'You always know what is confirmed and what is estimated' },
    { icon: faCableCar, title: 'Unchecked parks say so', desc: 'Most of the catalogue comes off the open map, and admits it' },
    { icon: faCheckCircle, title: 'You book with the operator', desc: 'We link out to the airline or hotel — we never take payment' },
];

const howItWorks = [
    {
        step: 1,
        title: 'Pick the park',
        description: 'Every cable park we can find in Europe, on one map. Tow type, obstacles and season where we have them — and a plain "not checked yet" where we do not.',
    },
    {
        step: 2,
        title: 'See the real ways in',
        description: 'The airports, ferries and trains that actually reach it, and the drive at the end. A park an hour from the runway is a different trip to one on the ring road.',
    },
    {
        step: 3,
        title: 'Price the whole way there',
        description: 'Fare, cabin bag, airport transfer and the run to your own airport, in one audited total. Then book each part at the source — no bundled checkout, no booking fee.',
    },
];

/**
 * How the app labels money, stated plainly. This section replaced three
 * testimonials that were written in-house and presented as user reviews —
 * fabricated social proof on a page whose entire argument is that travel sites
 * are not straight with you. These labels are real: they are the CostLine
 * statuses the pricing engine actually emits.
 */
const costLabels = [
    {
        badge: 'Confirmed',
        tone: 'badge--success',
        title: 'A price we can stand behind',
        description: 'Taken from a live fare or a rate you entered yourself. It is what you will pay.',
    },
    {
        badge: 'Estimated',
        tone: 'badge--warning',
        title: 'A calculated figure',
        description: 'Transfers, fuel and similar, worked out from distance and local rates. Close, but not a quote.',
    },
    {
        badge: 'Needs checking',
        tone: 'badge--danger',
        title: 'We could not verify it',
        description: 'Shown rather than hidden, because a total that quietly omits a cost is worse than one that admits a gap.',
    },
];

const About: React.FC = () => {
    const { spots, coverage } = useWakeSpots();
    const featured = useMemo(() => pickFeatured(spots), [spots]);

    return (
        <div className="stack-xl">
            {/* Hero Section */}
            <section className="hero-card card">
                <div className="hero-card__grid">
                    <div className="hero-card__content">
                        <p className="eyebrow eyebrow--light">Cable parks across Europe, checked against the operator</p>
                        <h1>Find the park. Know what riding it actually costs.</h1>
                        <p className="hero-card__lede">
                            Every cable park we can find in Europe, on one map, with the thing a map never tells you:
                            the setup you are actually paying for — a two-tower system is not an hour on a full
                            cable — and the operator's own tariff, with the date we last checked it and a link to
                            where it came from. Where we have not verified something, we say so rather than guess.
                        </p>
                        {/* The flight-to-park total is deliberately absent from this
                            promise. The fare provider cannot state which dates its
                            prices apply to, so nothing here can honestly claim a
                            current door-to-door cost. Saying it anyway would be the
                            exact trick this product exists to expose. */}
                        <p className="hero-card__lede hero-card__lede--caveat">
                            Pricing the flight to the park is still in development: our fare source cannot yet tell
                            us which dates its prices apply to, so we do not show a trip total we cannot stand behind.
                        </p>

                        {/* Two actions, in the order the product reads: find a
                            spot, then price the way in. It briefly had three
                            equally-weighted CTAs pointing at three different
                            half-finished modules, which asked a first-time
                            visitor to pick which unfinished thing to try. */}
                        <div className="hero-card__actions">
                            <Link to="/spots" className="btn btn--lg btn--on-brand">
                                <FontAwesomeIcon icon={faWater} />
                                Find a park
                            </Link>
                            <Link to="/hack-flights" className="btn btn--lg btn--on-brand-outline">
                                <FontAwesomeIcon icon={faPlane} />
                                Explore routes
                            </Link>
                        </div>
                    </div>

                    <div className="hero-card__panel">
                        <p className="eyebrow eyebrow--light">In development</p>
                        <div className="stack-sm">
                            <p><strong style={{ fontSize: '1.1rem' }}>Route explorer — experimental</strong></p>
                            {/* This panel used to promise "the fare, the cabin bag, the
                                airport transfer and a single audited total". That is the
                                door-to-door claim under another name, and the fare source
                                cannot support it: it will not say which dates its prices
                                apply to. The tool is still useful for seeing which routes
                                exist; it just must not be sold as a price. */}
                            <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                                A rough look at which routes exist between two airports, and where the hidden costs
                                usually sit. Prices shown are cached and undated — our fare source will not say which
                                dates they apply to, so check the airline before trusting any figure.
                            </p>
                            <Link to="/hack-flights" className="btn btn--sm btn--on-brand" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                                Explore routes →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Section */}
            <section className="trust-section">
                {trustFeatures.map((feature) => (
                    <div key={feature.title} className="trust-item">
                        <FontAwesomeIcon icon={feature.icon} className="trust-item__icon" />
                        <div>
                            <div className="trust-item__text">{feature.title}</div>
                            <div className="muted-text" style={{ fontSize: '0.75rem' }}>{feature.desc}</div>
                        </div>
                    </div>
                ))}
            </section>

            {/* The catalogue itself, straight off the live endpoint rather than a
                hand-written list of six places. If it cannot be reached the whole
                section goes, the same way the figures strip does — the hero
                already carries a link to the map. */}
            {featured.length > 0 && (
                <section className="stack-lg">
                    <div className="section-card__header section-card__header--plain">
                        <div>
                            <p className="eyebrow">Where to ride</p>
                            <h2>Cable parks on the map right now</h2>
                        </div>
                        <Link to="/spots" className="btn btn--secondary btn--sm">
                            {coverage ? `See all ${coverage.parks} parks →` : 'See every park →'}
                        </Link>
                    </div>

                    <div className="dest-grid">
                        {featured.map((spot) => {
                            const verified = spot.curationLevel === 'VENUE_READY';
                            const traction = spot.towType ? TRACTION_BADGE[spot.towType] ?? spot.towType : null;
                            return (
                                <Link to={`/spots/${spot.slug}`} key={spot.slug} className="dest-card">
                                    <div className="dest-card__media">
                                        <SpotTile
                                            className="dest-card__tile"
                                            slug={spot.slug}
                                            label={spot.destinationLabel}
                                            photoUrl={spot.imageUrl}
                                            towType={spot.towType}
                                        />
                                        <div className="dest-card__scrim" />
                                        <div className="dest-card__caption">
                                            <span className="dest-card__city">{spot.destinationLabel}</span>
                                            <span className="dest-card__country">{countryLabel(spot.country)}</span>
                                        </div>
                                        {traction && <span className="dest-card__code">{traction}</span>}
                                    </div>
                                    <div className="dest-card__body">
                                        <span className={`badge ${verified ? 'badge--success' : 'badge--neutral'}`} style={{ alignSelf: 'flex-start' }}>
                                            {verified ? 'Checked on the ground' : 'Not checked yet'}
                                        </span>
                                        <p className="dest-card__note">
                                            {spot.towType
                                                ? TRACTION_NOTE[spot.towType] ?? 'Cable park.'
                                                : 'Nobody has recorded the tow type here yet.'}
                                        </p>
                                        <span className="dest-card__cta">See the ways in →</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Coverage — measured at run time, or hidden entirely if the
                catalogue cannot be reached. Better no number than a wrong one. */}
            {coverage && (
                <section className="card section-card" style={{ background: 'var(--primary-light)', border: 'none' }}>
                    <div className="stats-grid">
                        <div className="stat-item">
                            <div className="stat-item__value">{coverage.parks}</div>
                            <div className="stat-item__label">Cable parks mapped</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__value">{coverage.countries}</div>
                            <div className="stat-item__label">Countries covered</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__value">{coverage.verified}</div>
                            <div className="stat-item__label">Checked on the ground</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__value">€0</div>
                            <div className="stat-item__label">Booking fees — we take no payment</div>
                        </div>
                    </div>
                </section>
            )}

            {/* How It Works */}
            <section className="card section-card stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">How it works</p>
                        <h2>Three steps, in the order that actually matters</h2>
                    </div>
                </div>

                <div className="timeline-grid">
                    {howItWorks.map((item) => (
                        <article key={item.step}>
                            <span className="timeline-step">{item.step}</span>
                            <h3>{item.title}</h3>
                            <p>{item.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* Features Grid */}
            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">Why TravelHub</p>
                        <h2>What a map pin leaves out</h2>
                    </div>
                </div>

                <div className="info-grid">
                    <article className="card info-card info-card--highlight">
                        <FontAwesomeIcon icon={faCableCar} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>The park picks the airport</h3>
                            <p>Cable parks sit on lakes and gravel pits, not in city centres. We start from the water and work backwards to the runways that reach it, instead of asking you to guess which airport is the right one.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faPlane} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>The session, not just the venue</h3>
                            <p>A 15-minute two-tower session is a different product from an hour on a full cable, and the price rarely says which you are buying. We record the setup, the tow type and what the tariff actually covers.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faCar} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>Priced by the operator, dated by us</h3>
                            <p>Tariffs come from the park's own page, with a link to the source and the date we last checked it. A price we have not re-checked recently is marked as such rather than presented as current.</p>
                    </article>
                </div>
            </section>

            {/* How costs are labelled */}
            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">Reading a total</p>
                        <h2>Every line says how much we trust it</h2>
                    </div>
                </div>

                <div className="info-grid">
                    {costLabels.map((label) => (
                        <article key={label.badge} className="card info-card">
                            <span className={`badge ${label.tone}`} style={{ alignSelf: 'flex-start', marginBottom: '10px' }}>
                                {label.badge}
                            </span>
                            <h3>{label.title}</h3>
                            <p>{label.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className="hero-card card" style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <h2 style={{ fontSize: '1.75rem', color: 'white', marginBottom: '12px' }}>
                        Ride somewhere new this season
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                        Start from the water: pick a park, see how you would actually get there, then price the flight,
                        the transfer and the drive as one number.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/spots" className="btn btn--lg btn--on-brand">
                            <FontAwesomeIcon icon={faWater} />
                            Open the map of parks
                        </Link>
                        <Link to="/hack-flights" className="btn btn--lg btn--on-brand-outline">
                            <FontAwesomeIcon icon={faPlane} />
                            Explore routes
                        </Link>
                    </div>
                    {/* The ways in, named. These are the modes the access layer
                        actually models — not a promise of a booking flow for
                        each, which we do not have. */}
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginTop: '20px' }}>
                        <FontAwesomeIcon icon={faPlane} style={{ marginRight: '6px' }} />Fly
                        <FontAwesomeIcon icon={faShip} style={{ margin: '0 6px 0 16px' }} />Ferry
                        <FontAwesomeIcon icon={faTrain} style={{ margin: '0 6px 0 16px' }} />Train
                        <FontAwesomeIcon icon={faCar} style={{ margin: '0 6px 0 16px' }} />and the drive at the end
                    </p>
                </div>
            </section>
        </div>
    );
};

export default About;
