// TravelForm.js
import { faCompass, faMagic } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TripGuide, TripGuideLoading, RequestDiagnostics } from './components/TripGuide';
import { ANONYMOUS_PROFILE, paceLabel, transportLabel, useProfile } from './ProfileContext';
import { ApiDiagnostics, ApiRequestError, planTrip, TripSuggestion } from './services/api';

const TravelForm: React.FC = () => {
    const { profile, isAuthenticated } = useProfile();
    const [destination, setDestination] = useState('');
    const [days, setDays] = useState(5);
    const [isGenerating, setIsGenerating] = useState(false);
    const [tripResult, setTripResult] = useState<TripSuggestion | null>(null);
    const [resultDiagnostics, setResultDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    const effectiveProfile = { ...ANONYMOUS_PROFILE, ...profile };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!destination.trim()) return;

        setIsGenerating(true);
        setError(null);
        setTripResult(null);
        setResultDiagnostics(null);

        try {
            const result = await planTrip({
                destination: destination.trim(),
                duration: days,
                budget: (effectiveProfile.dailyBudget ?? 100) * days,
                pace: effectiveProfile.pace,
                preferredTransport: effectiveProfile.preferredTransport,
                foodPreferences: effectiveProfile.foodPreferences,
                provider: effectiveProfile.preferredAiProvider ?? undefined,
            });
            setTripResult(result.suggestion);
            setResultDiagnostics(result.diagnostics);
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        } catch (err) {
            if (err instanceof ApiRequestError) {
                setError(err.message);
                setResultDiagnostics(err.diagnostics);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to generate trip plan');
            }
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="stack-xl">
            {/* Hero */}
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow eyebrow--light">
                        <FontAwesomeIcon icon={faCompass} style={{ marginRight: '8px' }} />
                        AI Trip Planner
                    </p>
                    <h1>Where do you want to go?</h1>
                    <p className="hero-card__lede">
                        Tell us your destination and how many days you have. We'll build a complete personalised itinerary using your travel profile.
                    </p>
                </div>
            </section>

            {/* Search form */}
            <section className="card section-card stack-lg">
                <form className="stack-lg" onSubmit={(e) => void handleGenerate(e)}>
                    <div className="filter-grid">
                        <label className="field-group">
                            <span className="field-group__label">Destination</span>
                            <input
                                className="text-input text-input--large"
                                placeholder="e.g. Lisbon, Tokyo, Barcelona…"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                required
                            />
                        </label>

                        <label className="field-group">
                            <span className="field-group__label">Days</span>
                            <input
                                type="number"
                                min={1}
                                max={30}
                                className="text-input text-input--large"
                                value={days}
                                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                            />
                        </label>
                    </div>

                    {/* Active profile summary */}
                    <div className="notice-banner" style={{ gap: '12px', flexWrap: 'wrap' }}>
                        <span>
                            Using your{' '}
                            {isAuthenticated ? <strong>saved</strong> : 'default'}{' '}
                            profile —{' '}
                            <strong>€{effectiveProfile.dailyBudget}/day</strong>,{' '}
                            <strong>{paceLabel(effectiveProfile.pace)} pace</strong>,{' '}
                            <strong>{transportLabel(effectiveProfile.preferredTransport)}</strong>
                        </span>
                        <Link to="/profile" className="button button--secondary button--small">
                            {isAuthenticated ? 'Edit profile' : 'Personalise →'}
                        </Link>
                    </div>

                    <button
                        type="submit"
                        className="button button--large"
                        disabled={isGenerating || !destination.trim()}
                    >
                        <FontAwesomeIcon icon={faMagic} />
                        {isGenerating ? 'Building your itinerary…' : 'Plan my trip'}
                    </button>
                </form>
            </section>

            {/* Results */}
            <div ref={resultRef}>
                {isGenerating && (
                    <TripGuideLoading title={`Planning your ${days}-day trip to ${destination}…`} />
                )}

                {error && !isGenerating && (
                    <section className="card section-card stack-lg">
                        <div className="section-card__header">
                            <div><p className="eyebrow">✨ AI Trip Plan</p><h2>Something went wrong</h2></div>
                        </div>
                        <div className="notice-banner notice-banner--error">{error}</div>
                        <button
                            type="button"
                            className="button button--secondary button--small"
                            onClick={(e) => void handleGenerate(e as unknown as React.FormEvent)}
                        >
                            🔄 Try again
                        </button>
                        <RequestDiagnostics title="Request details" diagnostics={resultDiagnostics} />
                    </section>
                )}

                {tripResult && !isGenerating && (
                    <TripGuide
                        trip={tripResult}
                        diagnostics={resultDiagnostics}
                        heroTitle={`Your ${days}-Day ${destination} Trip`}
                    />
                )}
            </div>
        </div>
    );
};

export default TravelForm;
