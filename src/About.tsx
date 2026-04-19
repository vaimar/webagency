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
    { icon: faShieldAlt, title: 'Secure Booking', desc: 'Your payment is protected' },
    { icon: faTag, title: 'Best Price Guarantee', desc: 'Found it cheaper? We\'ll match it' },
    { icon: faHeadset, title: '24/7 Support', desc: 'Here when you need us' },
    { icon: faCheckCircle, title: 'Free Cancellation', desc: 'On most bookings' },
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
        title: 'Search your destination',
        description: 'Enter where you want to go and when. Our smart search finds you the best options.',
    },
    {
        step: 2,
        title: 'Compare & customize',
        description: 'Filter by price, time, airline, or stops. Build your perfect itinerary with our planner.',
    },
    {
        step: 3,
        title: 'Book with confidence',
        description: 'Secure checkout with instant confirmation. Your adventure starts here.',
    },
];

const testimonials = [
    {
        quote: "TravelHub made planning our honeymoon so easy. The AI assistant suggested amazing restaurants we would never have found!",
        author: "Sarah & James",
        location: "New York, USA",
        rating: 5,
    },
    {
        quote: "Best flight prices I've found anywhere. Plus the trip planner helped me organize everything in one place.",
        author: "Marco Rossi",
        location: "Milan, Italy",
        rating: 5,
    },
    {
        quote: "The 24/7 support team helped me rebook when my flight was cancelled. Incredibly responsive!",
        author: "Emily Chen",
        location: "Singapore",
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
                        <p className="eyebrow eyebrow--light">✈️ Explore the world with confidence</p>
                        <h1>Find flights, plan trips, and discover your next adventure</h1>
                        <p className="hero-card__lede">
                            Search hundreds of airlines and booking sites to find the best deals. 
                            Let our AI assistant help you plan the perfect trip, personalized just for you.
                        </p>

                        <div className="hero-card__actions">
                            <Link to="/discover" className="button button--white button--large">
                                <FontAwesomeIcon icon={faPlane} />
                                Search Flights
                            </Link>
                            <Link to="/planner" className="button button--ghost" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', border: '1px solid' }}>
                                <FontAwesomeIcon icon={faGlobe} />
                                Plan a Trip
                            </Link>
                        </div>
                    </div>

                    <div className="hero-card__panel">
                        <p className="eyebrow eyebrow--light">🔥 Trending Now</p>
                        <div className="stack-sm">
                            <p><strong style={{ fontSize: '1.1rem' }}>Spring Sale: Up to 40% Off</strong></p>
                            <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                                Book by April 30 for travel through June. Limited availability.
                            </p>
                            <Link to="/discover" className="button button--small button--accent" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                                View Deals →
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
                        <p className="eyebrow">Popular Destinations</p>
                        <h2>Where travelers are heading</h2>
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
                                <span className="flight-card__price-label" style={{ marginLeft: '4px' }}>round trip</span>
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
                        <h2>Book your trip in 3 simple steps</h2>
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
                        <h2>Everything you need for the perfect trip</h2>
                    </div>
                </div>

                <div className="info-grid">
                    <article className="card info-card info-card--highlight">
                        <FontAwesomeIcon icon={faPlane} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                        <h3>Smart Flight Search</h3>
                        <p>Compare prices across 500+ airlines instantly. Price alerts notify you when fares drop.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faGlobe} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                        <h3>AI Trip Planner</h3>
                        <p>Get personalized recommendations for hotels, restaurants, and activities based on your preferences.</p>
                    </article>

                    <article className="card info-card">
                        <FontAwesomeIcon icon={faUserFriends} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '8px' }} />
                        <h3>AI Travel Assistant</h3>
                        <p>Ask anything about your destination - visa requirements, best neighborhoods, local tips.</p>
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
                        Ready to start your journey?
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                        Join millions of travelers who trust TravelHub to find the best deals and plan unforgettable trips.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/discover" className="button button--white button--large">
                            Search Flights
                        </Link>
                        <Link to="/assistant" className="button button--large" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                            Try AI Assistant
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default About;
