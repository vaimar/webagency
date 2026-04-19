// TravelForm.js
import React, { useMemo, useState } from 'react';
import AccommodationInput from './components/AccommodationInput';
import ActivitiesInput from './components/ActivitiesInput';
import BudgetInput from './components/BudgetInput';
import CountryInput from './components/CountryInput';
import FavoriteActivitiesInput from './components/FavoriteActivitiesInput';
import FoodPreferencesInput from './components/FoodPreferencesInput';
import RestaurantTipsInput from './components/RestaurantTipsInput';
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
            <section className="hero card hero-card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow">Travel planner</p>
                    <h1>Turn scattered preferences into a usable trip brief.</h1>
                    <p className="hero-card__lede">
                        This planner is now organized around the actual decisions you make: destination, budget,
                        accommodation, food priorities, and the experiences you do not want to miss.
                    </p>
                </div>
            </section>

            <div className="planner-layout">
                <form className="card section-card stack-xl" onSubmit={handleSubmit}>
                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">Trip setup</p>
                                <h2>Core choices</h2>
                            </div>
                        </div>

                        <CountryInput value={plan.destination} onChange={(value) => updatePlan('destination', value)} />

                        <div className="filter-grid">
                            <label className="field-group">
                                <span className="field-group__label">Trip duration</span>
                                <input
                                    type="number"
                                    min={2}
                                    max={30}
                                    className="text-input"
                                    value={plan.duration}
                                    onChange={(event) => updatePlan('duration', Number(event.target.value) || 2)}
                                />
                                <span className="field-group__hint">Set the number of days you want the plan to optimize for.</span>
                            </label>

                            <label className="field-group">
                                <span className="field-group__label">Preferred season</span>
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
                            <span className="field-group__label">Travel pace</span>
                            <div className="option-grid option-grid--compact">
                                {PACE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={plan.pace === option.value ? 'choice-card choice-card--selected' : 'choice-card'}
                                        onClick={() => updatePlan('pace', option.value)}
                                    >
                                        <span className="choice-card__title">{option.label}</span>
                                        <span className="choice-card__description">{option.description}</span>
                                    </button>
                                ))}
                            </div>
                        </label>

                        <BudgetInput value={plan.budget} onChange={(value) => updatePlan('budget', value)} />
                    </section>

                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">Stay and taste</p>
                                <h2>Where you sleep and how you eat</h2>
                            </div>
                        </div>

                        <AccommodationInput value={plan.accommodation} onChange={(value) => updatePlan('accommodation', value)} />
                        <FoodPreferencesInput value={plan.foodPreferences} onChange={(value) => updatePlan('foodPreferences', value)} />
                        <RestaurantTipsInput value={plan.restaurantTips} onChange={(value) => updatePlan('restaurantTips', value)} />
                    </section>

                    <section className="stack-lg">
                        <div className="section-card__header section-card__header--plain">
                            <div>
                                <p className="eyebrow">Experience notes</p>
                                <h2>What the trip should feel like</h2>
                            </div>
                        </div>

                        <ActivitiesInput value={plan.activities} onChange={(value) => updatePlan('activities', value)} />
                        <FavoriteActivitiesInput value={plan.favoriteActivities} onChange={(value) => updatePlan('favoriteActivities', value)} />

                        <label className="field-group">
                            <span className="field-group__label">Extra notes</span>
                            <textarea
                                className="text-area"
                                value={plan.notes}
                                onChange={(event) => updatePlan('notes', event.target.value)}
                                placeholder="Add logistics, energy level, who you're traveling with, or anything else that matters."
                            />
                        </label>
                    </section>

                    <div className="button-row">
                        <button type="submit" className="button">
                            Save travel brief
                        </button>
                        <button type="button" className="button button--secondary" onClick={handleReset}>
                            Reset
                        </button>
                    </div>
                </form>

                <aside className="card planner-summary stack-lg">
                    <div>
                        <p className="eyebrow">Live brief</p>
                        <h2>{destinationLabel}</h2>
                        <p className="muted-text">
                            {submittedAt ? 'Saved brief ready to share.' : 'Draft updates as you change the form.'}
                        </p>
                    </div>

                    <div className="summary-stat">
                        <span>Budget</span>
                        <strong>{formatBudget(plan.budget)}</strong>
                    </div>
                    <div className="summary-stat">
                        <span>Daily target</span>
                        <strong>{formatBudget(budgetPerDay)}</strong>
                    </div>
                    <div className="summary-stat">
                        <span>Season</span>
                        <strong>{seasonLabel}</strong>
                    </div>

                    <div className="stack-sm">
                        <h3>Suggested focus</h3>
                        <div className="tag-list">
                            {highlights.map((highlight) => (
                                <span key={highlight} className="tag">
                                    {highlight}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="stack-sm">
                        <h3>Trip summary</h3>
                        <ul className="summary-list">
                            {summaryItems.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="stack-sm">
                        <h3>Notes to carry forward</h3>
                        <p>{plan.activities}</p>
                        <p>{plan.favoriteActivities}</p>
                        {plan.restaurantTips ? <p>{plan.restaurantTips}</p> : null}
                        <p>{plan.notes}</p>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default TravelForm;
