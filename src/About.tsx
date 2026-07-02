import { faCheckCircle, faGlobe, faHeadset, faPlane, faShieldAlt, faTag, faUserFriends } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { Link } from 'react-router-dom';

const popularDestinations = [
    { city: 'Paris', country: 'France', price: 129, image: '🗼', tag: 'Most Popular' },
    { city: 'Barcelona', country: 'Spain', price: 89, image: '🏖️', tag: 'Beach Getaway' },
    { city: 'Tokyo', country: 'Japan', price: 449, image: '🏯', tag: 'Adventure' },
    { city: 'New York', country: 'USA', price: 299, image: '🗽', tag: 'City Break' },
    { city: 'Rome', country: 'Italy', price: 119, image: '🏛️', tag: 'Culture' },
    { city: 'Bali', country: 'Indonesia', price: 389, image: '🌴', tag: 'Tropical' },
];

const trustFeatures = [
    { icon: faShieldAlt, title: 'Truth-first pricing', desc: 'Base fare, honest total, then door-to-trip' },
    { icon: faTag, title: 'No fake bundle', desc: 'We label estimates and link out clearly' },
    { icon: faHeadset, title: 'Real logistics', desc: 'Airport traps and hidden costs stay visible' },
    { icon: faCheckCircle, title: 'Case-study ready', desc: 'Flights, stays, and local proof in one flow' },
];

const stats = [
    { value: '10M+', label: 'Happy Travelers' },
    { value: '500+', label: 'Airlines' },
    { value: '190+', label: 'Countries' },
    { value: '4.8★', label: 'App Rating' },
];

const howItWorks = [
    {
        step: 1,
        title: 'Start with the route truth',
        description: 'Pick airports, dates, and first-mile context. We verify whether the route is real before anything else appears.',
    },
    {
        step: 2,
        title: 'Add local proof',
        description: 'Layer in practical base areas, stay pricing, and the real caveats that matter after landing.',
    },
    {
        step: 3,
        title: 'Book each part with clear labels',
        description: 'Use provider-labelled links for flight, stay, and activities. No fake one-click checkout.',
    },
];

const testimonials = [
    {
        quote: 'The useful part was seeing the real total, the airport warning, and the base area together — not being sent into another chat box.',
        author: 'Case-study review',
        location: 'Limerick → Nice',
        rating: 5,
    },
    {
        quote: 'Door-to-trip pricing made the route honest. The cheap fare stopped being fake the second the transfer and first mile were visible.',
        author: 'Route audit',
        location: 'Dublin → Beauvais',
        rating: 5,
    },
    {
        quote: 'The best part is that no trip shows up unless the flight is real. That kills a lot of brochure nonsense immediately.',
        author: 'Planner feedback',
        location: 'Flight-first workflow',
        rating: 5,
    },
];

const About: React.FC = () => {
    return (
        <div className="stack-xl">
            {/* Hero Section */}
            <section className="hero-card card">
                <div className="hero-card__grid">
                    <div className="hero-card__content">
                        <p className="eyebrow eyebrow--light">✈️ Door-to-trip proof, not another flight search</p>
                        <h1>See the real route, the real stay, and the real trip total in one place</h1>
                        <p className="hero-card__lede">
                            TravelHub is strongest when it combines live flight truth, hidden-cost auditing, practical base areas, and stay evidence.
                            Start with the route, then add local proof only where it helps.
                        </p>

                        <div className="hero-card__actions">
                            <Link to="/discover" className="button button--white button--large">
                                <FontAwesomeIcon icon={faPlane} />
                                Build a door-to-trip case
                            </Link>
                            <Link to="/planner" className="button button--ghost" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', border: '1px solid' }}>
                                <FontAwesomeIcon icon={faGlobe} />
                                Planner workspace
                            </Link>
                        </div>
                    </div>

                    <div className="hero-card__panel">
                        <p className="eyebrow eyebrow--light">🔥 What works best right now</p>
                        <div className="stack-sm">
                            <p><strong style={{ fontSize: '1.1rem' }}>Case-study style discovery</strong></p>
                            <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                                Best for trips where flight reality, local base choice, and honest totals matter more than marketing price.
                            </p>
                            <Link to="/discover" className="button button--small button--accent" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                                Open discovery →
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

            {/* Popular Destinations */}
            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">Case-study starting points</p>
                        <h2>Good routes to audit honestly</h2>
                    </div>
                    <Link to="/discover" className="button button--secondary button--small">View all →</Link>
                </div>

                <div className="info-grid">
                    {popularDestinations.map((dest) => (
                        <Link to="/discover" key={dest.city} className="card card--hoverable flight-card" style={{ textDecoration: 'none' }}>
                            <div className="flight-card__header">
                                <span style={{ fontSize: '2.5rem' }}>{dest.image}</span>
                                <span className="tag tag--success" style={{ fontSize: '0.7rem' }}>{dest.tag}</span>
                            </div>
                            <h3>{dest.city}</h3>
                            <p className="muted-text">{dest.country}</p>
                            <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
                                <span className="flight-card__price">From €{dest.price}</span>
                                <span className="flight-card__price-label" style={{ marginLeft: '4px' }}>headline fare only</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Stats Section */}
            <section className="card section-card" style={{ background: 'var(--primary-light)', border: 'none' }}>
                <div className="stats-grid">
                    {stats.map((stat) => (
                        <div key={stat.label} className="stat-item">
                            <div className="stat-item__value">{stat.value}</div>
                            <div className="stat-item__label">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works */}
            <section className="card section-card stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">How It Works</p>
                        <h2>Build a trip like a case study, not a brochure</h2>
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
                        <h2>What it does better than a plain flight search</h2>
                    </div>
                </div>

                <div className="info-grid">
                    <article className="card info-card info-card--highlight">
                        <FontAwesomeIcon icon={faPlane} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>Flight truth first</h3>
                            <p>Sort by honest price, keep theCatch visible, and stop the flow entirely when the route is missing.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faGlobe} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>Local proof, not AI filler</h3>
                            <p>Use AI only where it helps: explaining the right base area, rhythm, and neighborhood fit after the route is already proven.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faUserFriends} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                            <h3>Door-to-trip totals</h3>
                            <p>Bring together flight, first mile, stay pricing, and exclusions so the user sees the trip — not just the plane ticket.</p>
                    </article>
                </div>
            </section>

            {/* Testimonials */}
            <section className="stack-lg">
                <div className="section-card__header section-card__header--plain" style={{ textAlign: 'center', display: 'block' }}>
                    <p className="eyebrow">Testimonials</p>
                    <h2>Loved by travelers worldwide</h2>
                </div>

                <div className="info-grid">
                    {testimonials.map((testimonial, index) => (
                        <article key={index} className="card info-card">
                            <div style={{ marginBottom: '12px', color: '#f5a623' }}>
                                {'★'.repeat(testimonial.rating)}
                            </div>
                            <p style={{ fontStyle: 'italic', marginBottom: '16px' }}>"{testimonial.quote}"</p>
                            <div style={{ marginTop: 'auto' }}>
                                <strong>{testimonial.author}</strong>
                                <p className="muted-text" style={{ fontSize: '0.8rem' }}>{testimonial.location}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className="hero-card card" style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <h2 style={{ fontSize: '1.75rem', color: 'white', marginBottom: '12px' }}>
                        Ready to prove the whole trip?
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                        Start with a real route, then add the local proof layer that makes the trip usable in the real world.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/discover" className="button button--white button--large">
                            Open discovery
                        </Link>
                        <Link to="/planner" className="button button--large" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                            Open planner
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default About;
