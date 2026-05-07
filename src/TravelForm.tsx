// TravelForm.js
import { faCompass, faMagic } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SmartPreferences, { SmartPreferencesResult } from './components/SmartPreferences';
import { TripGuide, TripGuideLoading, RequestDiagnostics } from './components/TripGuide';
import { ANONYMOUS_PROFILE, paceLabel, transportLabel, useProfile } from './ProfileContext';
import { ApiDiagnostics, ApiRequestError, planTrip, TripSuggestion } from './services/api';

// ─── Main component ────────────────────────────────────────────────────────────

type FormPhase = 'destination' | 'preferences' | 'generating' | 'result';

const TravelForm: React.FC = () => {
    const { profile, isAuthenticated, savePreferences, showToast } = useProfile();
    const [destination, setDestination] = useState('');
    const [days, setDays] = useState(5);
    const [phase, setPhase] = useState<FormPhase>('destination');
    const [effectivePrefs, setEffectivePrefs] = useState<SmartPreferencesResult | null>(null);
    const [tripResult, setTripResult] = useState<TripSuggestion | null>(null);
    const [resultDiagnostics, setResultDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    const baseProfile = { ...ANONYMOUS_PROFILE, ...profile };

    const handleDestinationSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!destination.trim()) return;
        if (isAuthenticated) {
            void generate(null);
        } else {
            setPhase('preferences');
        }
    };

    const handlePreferencesComplete = (result: SmartPreferencesResult) => {
        setEffectivePrefs(result);
        void generate(result);
    };

    const handlePreferencesSkip = () => {
        void generate(null);
    };

    const generate = async (overrides: SmartPreferencesResult | null) => {
        setPhase('generating');
        setError(null);
        setTripResult(null);
        setResultDiagnostics(null);

        const prefs = overrides ?? {
            dailyBudget: baseProfile.dailyBudget ?? 100,
            preferredTransport: baseProfile.preferredTransport ?? 'public_transport',
            pace: baseProfile.pace ?? 'balanced',
        };

        try {
            const result = await planTrip({
                destination: destination.trim(),
                duration: days,
                budget: prefs.dailyBudget * days,
                pace: prefs.pace,
                preferredTransport: prefs.preferredTransport,
                foodPreferences: baseProfile.foodPreferences,
                provider: baseProfile.preferredAiProvider ?? undefined,
            });
            setTripResult(result.suggestion);
            setResultDiagnostics(result.diagnostics);
            setPhase('result');
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

            if (overrides && !isAuthenticated) {
                savePreferences(overrides).catch(() => {/* ignore */});
            }
        } catch (err) {
            if (err instanceof ApiRequestError) {
                setError(err.message);
                setResultDiagnostics(err.diagnostics);
                showToast({ type: 'error', source: 'planner', title: 'Planner error', message: err.message }, 'planner-generate-error');
            } else {
                const message = err instanceof Error ? err.message : 'Failed to generate trip plan';
                setError(message);
                showToast({ type: 'error', source: 'planner', title: 'Planner error', message }, 'planner-generate-error-generic');
            }
            setPhase('destination');
        }
    };

    const reset = () => {
        setPhase('destination');
        setTripResult(null);
        setError(null);
        setEffectivePrefs(null);
    };

    const activePrefs = effectivePrefs ?? {
        dailyBudget: baseProfile.dailyBudget ?? 100,
        preferredTransport: baseProfile.preferredTransport ?? 'public_transport',
        pace: baseProfile.pace ?? 'balanced',
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
                        Tell us your destination and we'll build a complete, logistically sound itinerary — in under 60 seconds.
                    </p>
                </div>
            </section>

            {/* Phase: Destination input + Preferences wizard */}
            {(phase === 'destination' || phase === 'preferences') && (
                <section className="card section-card stack-lg">
                    <form className="stack-lg" onSubmit={handleDestinationSubmit}>
                        <div className="filter-grid">
                            <label className="field-group">
                                <span className="field-group__label">Destination</span>
                                <input
                                    className="text-input text-input--large"
                                    placeholder="e.g. Lisbon, Tokyo, Barcelona…"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    required
                                    disabled={phase === 'preferences'}
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
                                    disabled={phase === 'preferences'}
                                />
                            </label>
                        </div>

                        {phase === 'destination' && (
                            <>
                                {isAuthenticated && (
                                    <div className="notice-banner" style={{ gap: '12px', flexWrap: 'wrap' }}>
                                        <span>
                                            Using your saved profile —{' '}
                                            <strong>€{baseProfile.dailyBudget}/day</strong>,{' '}
                                            <strong>{paceLabel(baseProfile.pace)} pace</strong>,{' '}
                                            <strong>{transportLabel(baseProfile.preferredTransport)}</strong>
                                        </span>
                                        <Link to="/profile" className="button button--secondary button--small">Edit profile</Link>
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    className="button button--large"
                                    disabled={!destination.trim()}
                                >
                                    <FontAwesomeIcon icon={faMagic} />
                                    {isAuthenticated ? 'Plan my trip' : 'Next: Quick setup →'}
                                </button>
                            </>
                        )}
                    </form>

                    {phase === 'preferences' && (
                        <SmartPreferences
                            initial={baseProfile}
                            onComplete={handlePreferencesComplete}
                            onSkip={handlePreferencesSkip}
                            compact
                        />
                    )}
                </section>
            )}

            {/* Phase: Generating */}
            {phase === 'generating' && (
                <TripGuideLoading
                    title={`Planning your ${days}-day trip to ${destination}…`}
                    budget={activePrefs.dailyBudget}
                    transport={activePrefs.preferredTransport}
                    destination={destination}
                />
            )}

            {/* Error state */}
            {error && phase === 'destination' && (
                <section className="card section-card stack-lg">
                    <div className="section-card__header">
                        <div><p className="eyebrow">✨ AI Trip Plan</p><h2>Something went wrong</h2></div>
                    </div>
                    <div className="notice-banner notice-banner--error">{error}</div>
                    <button type="button" className="button button--secondary button--small" onClick={reset}>
                        🔄 Try again
                    </button>
                    <RequestDiagnostics title="Request details" diagnostics={resultDiagnostics} />
                </section>
            )}

            {/* Phase: Result */}
            <div ref={resultRef}>
                {tripResult && phase === 'result' && (
                    <>
                        <TripGuide
                            trip={tripResult}
                            diagnostics={resultDiagnostics}
                            heroTitle={`Your ${days}-Day ${destination} Trip`}
                            dailyBudget={activePrefs.dailyBudget}
                        />
                        <div style={{ textAlign: 'center', marginTop: '32px' }}>
                            <button type="button" className="button button--secondary" onClick={reset}>
                                ← Plan another trip
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TravelForm;
