// TravelForm.js
import { faCalendar, faCheck, faCompass, faHotel, faMapMarkerAlt, faSave, faUndo, faUtensils, faWallet } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo, useState } from 'react';
import { COUNTRY_OPTIONS, DESTINATION_HIGHLIGHTS, PACE_OPTIONS, SEASON_OPTIONS } from './data/travelOptions';
import { TravelPlan } from './model/TravelPlan';

const initialPlan: TravelPlan = {
    destination: 'portugal',
    budget: 1600,
    duration: 7,
    accommodation: 'boutique',
    foodPreferences: ['local-specialties', 'street-food'],
    restaurantTips: '',
    activities: 'Walking tours, ocean views, and one guided local experience.',
    favoriteActivities: 'A scenic breakfast spot and one memorable dinner.',
    notes: 'Prefer neighborhoods with cafés, easy transit, and a calm evening vibe.',
    pace: 'balanced',
    season: 'spring',
};

const getLabel = (value: string, options: Array<{ value: string; label: string }>): string => {
    return options.find((option) => option.value === value)?.label ?? value;
};

const formatBudget = (value: number): string => {
    return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    }).format(value);
};

const TravelForm: React.FC = () => {
    const [plan, setPlan] = useState<TravelPlan>(initialPlan);
    const [submittedAt, setSubmittedAt] = useState<string>('');

    const updatePlan = <Key extends keyof TravelPlan>(key: Key, value: TravelPlan[Key]) => {
        setPlan((currentPlan) => ({
            ...currentPlan,
            [key]: value,
        }));
    };

    const destinationLabel = getLabel(plan.destination, COUNTRY_OPTIONS);
    const paceLabel = getLabel(plan.pace, PACE_OPTIONS);
    const seasonLabel = getLabel(plan.season, SEASON_OPTIONS);
    const budgetPerDay = Math.round(plan.budget / Math.max(plan.duration, 1));
    const highlights = useMemo(
        () => DESTINATION_HIGHLIGHTS[plan.destination] ?? ['great local food', 'balanced daily pacing', 'walkable exploration'],
        [plan.destination],
    );

    const summaryItems = [
        `${destinationLabel} with a ${paceLabel.toLowerCase()} pace`,
        `${plan.duration} days with about ${formatBudget(budgetPerDay)} per day`,
        `${plan.accommodation} stay style`,
        `${plan.foodPreferences.length > 0 ? plan.foodPreferences.length : 'No'} food priorities captured`,
    ];

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmittedAt(new Date().toISOString());
    };

    const handleReset = () => {
        setPlan(initialPlan);
        setSubmittedAt('');
    };

    return (
        <div className="stack-xl">
            {/* Hero Section */}
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow eyebrow--light">
                        <FontAwesomeIcon icon={faCompass} style={{ marginRight: '8px' }} />
                        Trip Planner
                    </p>
                    <h1>Create your perfect trip itinerary</h1>
                    <p className="hero-card__lede">
                        Tell us your preferences and we'll help you build a personalized travel brief. 
                        Perfect for planning solo trips, romantic getaways, or family vacations.
                    </p>
                </div>
            </section>

            <div className="planner-layout">
                <form className="card section-card stack-xl" onSubmit={handleSubmit}>
                    {/* Destination & Dates Section */}
                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">
                                    <FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '6px' }} />
                                    Destination & Timing
                                </p>
                                <h2>Where and when?</h2>
                            </div>
                        </div>

                        <label className="field-group">
                            <span className="field-group__label">Where do you want to go?</span>
                            <select
                                className="text-input text-input--large"
                                value={plan.destination}
                                onChange={(event) => updatePlan('destination', event.target.value)}
                            >
                                {COUNTRY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <span className="field-group__hint">
                                {COUNTRY_OPTIONS.find((option) => option.value === plan.destination)?.description}
                            </span>
                        </label>

                        <div className="filter-grid">
                            <label className="field-group">
                                <span className="field-group__label">
                                    <FontAwesomeIcon icon={faCalendar} style={{ marginRight: '6px' }} />
                                    Trip Duration
                                </span>
                                <input
                                    type="number"
                                    min={2}
                                    max={30}
                                    className="text-input"
                                    value={plan.duration}
                                    onChange={(event) => updatePlan('duration', Number(event.target.value) || 2)}
                                />
                                <span className="field-group__hint">Number of days (2-30)</span>
                            </label>

                            <label className="field-group">
                                <span className="field-group__label">Preferred Season</span>
                                <select
                                    className="text-input"
                                    value={plan.season}
                                    onChange={(event) => updatePlan('season', event.target.value as TravelPlan['season'])}
                                >
                                    {SEASON_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="field-group">
                            <span className="field-group__label">Travel Pace</span>
                            <div className="option-grid option-grid--compact">
                                {PACE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={plan.pace === option.value ? 'choice-card choice-card--selected' : 'choice-card'}
                                        onClick={() => updatePlan('pace', option.value)}
                                    >
                                        <span className="choice-card__title">
                                            {plan.pace === option.value && <FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px', color: 'var(--primary)' }} />}
                                            {option.label}
                                        </span>
                                        <span className="choice-card__description">{option.description}</span>
                                    </button>
                                ))}
                            </div>
                        </label>

                        <label className="field-group budget-input-container">
                            <div className="budget-input__header">
                                <span className="field-group__label">
                                    <FontAwesomeIcon icon={faWallet} style={{ marginRight: '6px' }} />
                                    Total Budget
                                </span>
                                <strong className="budget-input__value">{formatBudget(plan.budget)}</strong>
                            </div>
                            <input
                                type="range"
                                min={200}
                                max={5000}
                                step={25}
                                value={plan.budget}
                                onChange={(event) => updatePlan('budget', Number(event.target.value))}
                            />
                            <div className="budget-input__scale">
                                <span>€200</span>
                                <span>€5,000</span>
                            </div>
                            <span className="field-group__hint">This is your full-trip budget ceiling.</span>
                        </label>
                    </section>

                    {/* Accommodation & Food Section */}
                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">
                                    <FontAwesomeIcon icon={faHotel} style={{ marginRight: '6px' }} />
                                    Stay & Dining
                                </p>
                                <h2>Where you'll sleep and eat</h2>
                            </div>
                        </div>

                        <fieldset className="field-group option-grid-fieldset">
                            <legend className="field-group__label">Accommodation Style</legend>
                            <div className="option-grid">
                                {[
                                    { value: 'hotel', label: 'Hotel', description: 'Reliable comfort and central amenities.', emoji: '🏨' },
                                    { value: 'boutique', label: 'Boutique', description: 'Design-led spaces with local character.', emoji: '✨' },
                                    { value: 'apartment', label: 'Apartment', description: 'Great for longer stays and neighborhood living.', emoji: '🏠' },
                                    { value: 'hostel', label: 'Hostel', description: 'Budget-friendly and social.', emoji: '🎒' },
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={plan.accommodation === option.value ? 'choice-card choice-card--selected' : 'choice-card'}
                                        onClick={() => updatePlan('accommodation', option.value as TravelPlan['accommodation'])}
                                    >
                                        <span className="choice-card__title">
                                            <span style={{ marginRight: '6px' }}>{option.emoji}</span>
                                            {option.label}
                                        </span>
                                        <span className="choice-card__description">{option.description}</span>
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className="field-group option-grid-fieldset">
                            <legend className="field-group__label">
                                <FontAwesomeIcon icon={faUtensils} style={{ marginRight: '6px' }} />
                                Food Preferences
                            </legend>
                            <div className="checkbox-grid">
                                {[
                                    { value: 'vegetarian', label: '🥗 Vegetarian' },
                                    { value: 'vegan', label: '🌱 Vegan' },
                                    { value: 'seafood', label: '🦐 Seafood' },
                                    { value: 'street-food', label: '🍜 Street Food' },
                                    { value: 'fine-dining', label: '🍷 Fine Dining' },
                                    { value: 'local-specialties', label: '🍝 Local Specialties' },
                                ].map((option) => {
                                    const checked = plan.foodPreferences.includes(option.value);
                                    return (
                                        <label key={option.value} className={checked ? 'checkbox-chip checkbox-chip--checked' : 'checkbox-chip'}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() =>
                                                    updatePlan(
                                                        'foodPreferences',
                                                        checked
                                                            ? plan.foodPreferences.filter((item) => item !== option.value)
                                                            : [...plan.foodPreferences, option.value],
                                                    )
                                                }
                                            />
                                            <span>{option.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <label className="field-group">
                            <span className="field-group__label">Dining Notes</span>
                            <textarea
                                className="text-area"
                                value={plan.restaurantTips}
                                onChange={(event) => updatePlan('restaurantTips', event.target.value)}
                                placeholder="Any specific requirements? Need reservations, late-night spots, kid-friendly options..."
                            />
                        </label>
                    </section>

                    {/* Experience Section */}
                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">🎯 Experience</p>
                                <h2>What should this trip feel like?</h2>
                            </div>
                        </div>

                        <label className="field-group">
                            <span className="field-group__label">Activities & Interests</span>
                            <textarea
                                className="text-area"
                                value={plan.activities}
                                onChange={(event) => updatePlan('activities', event.target.value)}
                                placeholder="Museums, food tours, surf lessons, hiking, coworking days, shopping..."
                            />
                            <span className="field-group__hint">What would you like to do during your trip?</span>
                        </label>

                        <label className="field-group">
                            <span className="field-group__label">Must-Have Moments ⭐</span>
                            <textarea
                                className="text-area"
                                value={plan.favoriteActivities}
                                onChange={(event) => updatePlan('favoriteActivities', event.target.value)}
                                placeholder="Golden-hour walk, scenic breakfast, one special dinner, sunset views..."
                            />
                            <span className="field-group__hint">What experiences are non-negotiable for you?</span>
                        </label>

                        <label className="field-group">
                            <span className="field-group__label">Additional Notes</span>
                            <textarea
                                className="text-area"
                                value={plan.notes}
                                onChange={(event) => updatePlan('notes', event.target.value)}
                                placeholder="Add logistics, energy level, who you're traveling with, mobility needs, or anything else..."
                            />
                        </label>
                    </section>

                    <div className="button-row">
                        <button type="submit" className="button button--large">
                            <FontAwesomeIcon icon={faSave} />
                            Save Trip Brief
                        </button>
                        <button type="button" className="button button--secondary button--large" onClick={handleReset}>
                            <FontAwesomeIcon icon={faUndo} />
                            Reset
                        </button>
                    </div>
                </form>

                {/* Summary Sidebar */}
                <aside className="card planner-summary stack-lg">
                    <div>
                        <p className="eyebrow">
                            {submittedAt ? '✅ Saved Brief' : '📋 Live Preview'}
                        </p>
                        <h2>{destinationLabel}</h2>
                        <p className="muted-text">
                            {submittedAt ? 'Your trip brief is ready to share!' : 'Updates as you edit the form.'}
                        </p>
                    </div>

                    <div className="stack-sm">
                        <div className="summary-stat">
                            <span>💰 Total Budget</span>
                            <strong>{formatBudget(plan.budget)}</strong>
                        </div>
                        <div className="summary-stat">
                            <span>📅 Daily Budget</span>
                            <strong>{formatBudget(budgetPerDay)}</strong>
                        </div>
                        <div className="summary-stat">
                            <span>🗓️ Duration</span>
                            <strong>{plan.duration} days</strong>
                        </div>
                        <div className="summary-stat">
                            <span>🌤️ Season</span>
                            <strong>{seasonLabel}</strong>
                        </div>
                    </div>

                    <div className="stack-sm">
                        <h3 style={{ fontSize: '0.9rem' }}>Suggested Focus</h3>
                        <div className="tag-list">
                            {highlights.map((highlight) => (
                                <span key={highlight} className="tag">
                                    {highlight}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="stack-sm">
                        <h3 style={{ fontSize: '0.9rem' }}>Trip Summary</h3>
                        <ul className="summary-list" style={{ listStyleType: 'disc' }}>
                            {summaryItems.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>

                    {(plan.activities || plan.favoriteActivities || plan.notes) && (
                        <div className="stack-sm">
                            <h3 style={{ fontSize: '0.9rem' }}>Your Notes</h3>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {plan.activities && <p style={{ marginBottom: '8px' }}>📍 {plan.activities}</p>}
                                {plan.favoriteActivities && <p style={{ marginBottom: '8px' }}>⭐ {plan.favoriteActivities}</p>}
                                {plan.restaurantTips && <p style={{ marginBottom: '8px' }}>🍽️ {plan.restaurantTips}</p>}
                                {plan.notes && <p>📝 {plan.notes}</p>}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default TravelForm;
