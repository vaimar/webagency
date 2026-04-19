import React from 'react';
import { Link } from 'react-router-dom';

const productHighlights = [
    'A proper route-based shell instead of duplicated page rendering.',
    'Curated destination discovery with cache persistence and room for future integrations.',
    'A guided planner that turns travel preferences into a usable brief.',
];

const workingPrinciples = [
    {
        title: 'Plan with confidence',
        text: 'The planner keeps your preferences visible, structured, and easy to evolve as ideas change.',
    },
    {
        title: 'Discover quickly',
        text: 'Fare exploration now has clear filters, meaningful states, and no secret keys hardcoded into the UI.',
    },
    {
        title: 'Stay maintainable',
        text: 'The refactor separates data, models, hooks, and presentational components so the app can keep growing.',
    },
];

const About: React.FC = () => {
    return (
        <div className="stack-xl">
            <section className="hero card hero-card">
                <div className="hero-card__content">
                    <p className="eyebrow">Refreshed foundation</p>
                    <h1>Travel planning that feels modern, not patched together.</h1>
                    <p className="hero-card__lede">
                        This project started as a promising prototype. It now has a cleaner app shell, typed state,
                        safer data access, and a more usable trip planning experience.
                    </p>

                    <div className="hero-card__actions">
                        <Link to="/discover" className="button">
                            Explore fares
                        </Link>
                        <Link to="/planner" className="button button--secondary">
                            Build a travel brief
                        </Link>
                    </div>
                </div>

                <div className="hero-card__panel">
                    <p className="eyebrow">What changed</p>
                    <ul className="feature-list">
                        {productHighlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="info-grid">
                {workingPrinciples.map((item) => (
                    <article key={item.title} className="card info-card">
                        <h2>{item.title}</h2>
                        <p>{item.text}</p>
                    </article>
                ))}
            </section>

            <section className="card section-card">
                <div className="section-card__header">
                    <div>
                        <p className="eyebrow">How to use it</p>
                        <h2>Start from inspiration, then tighten the plan</h2>
                    </div>
                </div>

                <div className="timeline-grid">
                    <article>
                        <span className="timeline-step">01</span>
                        <h3>Open Discover fares</h3>
                        <p>Try origin and price combinations, then save the destinations that fit your rough budget.</p>
                    </article>
                    <article>
                        <span className="timeline-step">02</span>
                        <h3>Move to the planner</h3>
                        <p>Capture pace, stay type, food preferences, and activity notes in one coherent flow.</p>
                    </article>
                    <article>
                        <span className="timeline-step">03</span>
                        <h3>Share the brief</h3>
                        <p>Use the generated summary as your starting point for booking, comparing ideas, or further automation.</p>
                    </article>
                </div>
            </section>
        </div>
    );
};

export default About;
