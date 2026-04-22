import { faCheck, faSignInAlt, faSignOutAlt, faSlidersH, faUser, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { FormEvent, useState } from 'react';
import { ANONYMOUS_PROFILE, paceLabel, providerLabel, transportLabel, useProfile } from './ProfileContext';
import { AiProviderName, PreferredTransport, TravelPace, UpdateUserProfileRequest } from './services/api';

/* ─── Auth forms ─────────────────────────────────────────────────────────────── */

const AuthSection: React.FC = () => {
    const { login, register, isLoading, error } = useProfile();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setFormError(null);
        try {
            if (mode === 'login') {
                await login({ username, password });
            } else {
                await register({ username, password, email: email || undefined });
            }
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Something went wrong');
        }
    };

    return (
        <section className="card section-card stack-lg">
            <div className="section-card__header section-card__header--plain">
                <div>
                    <p className="eyebrow">
                        <FontAwesomeIcon icon={faUser} style={{ marginRight: '6px' }} />
                        Account
                    </p>
                    <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
                    <p className="muted-text">
                        {mode === 'login'
                            ? 'Sign in to save your travel preferences.'
                            : 'Free account — save your preferences and get personalized suggestions.'}
                    </p>
                </div>
            </div>

            <form className="stack-lg" onSubmit={(e) => void handleSubmit(e)}>
                <label className="field-group">
                    <span className="field-group__label">Username</span>
                    <input
                        className="text-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="traveller01"
                        autoComplete="username"
                        required
                    />
                </label>

                {mode === 'register' && (
                    <label className="field-group">
                        <span className="field-group__label">Email <span className="muted-text">(optional)</span></span>
                        <input
                            className="text-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            autoComplete="email"
                        />
                    </label>
                )}

                <label className="field-group">
                    <span className="field-group__label">Password</span>
                    <input
                        className="text-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                    />
                </label>

                {(formError ?? error) && (
                    <div className="notice-banner notice-banner--error">{formError ?? error}</div>
                )}

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="submit" className="button button--large" disabled={isLoading}>
                        <FontAwesomeIcon icon={mode === 'login' ? faSignInAlt : faUserPlus} />
                        {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
                    </button>
                    <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFormError(null); }}
                    >
                        {mode === 'login' ? 'No account? Register →' : '← Back to sign in'}
                    </button>
                </div>
            </form>
        </section>
    );
};

/* ─── Preferences form ───────────────────────────────────────────────────────── */

const PreferencesSection: React.FC = () => {
    const { profile, isAuthenticated, isLoading, savePreferences } = useProfile();
    const [form, setForm] = useState<UpdateUserProfileRequest>({
        dailyBudget:        profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget,
        pace:               profile.pace        ?? ANONYMOUS_PROFILE.pace,
        preferredTransport: profile.preferredTransport ?? ANONYMOUS_PROFILE.preferredTransport,
        foodPreferences:    [...(profile.foodPreferences ?? [])],
        preferredAiProvider: profile.preferredAiProvider ?? null,
    });
    const [saved, setSaved] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const toggle = (pref: string) =>
        setForm((prev) => {
            const current = prev.foodPreferences ?? [];
            return {
                ...prev,
                foodPreferences: current.includes(pref)
                    ? current.filter((f) => f !== pref)
                    : [...current, pref],
            };
        });

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSaved(false);
        try {
            await savePreferences(form);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not save preferences');
        }
    };

    const foodOptions = [
        { value: 'local-specialties', label: '🍝 Local cuisine' },
        { value: 'street-food',       label: '🌮 Street food' },
        { value: 'seafood',           label: '🦐 Seafood' },
        { value: 'vegetarian',        label: '🥗 Vegetarian' },
        { value: 'vegan',             label: '🌱 Vegan' },
        { value: 'fine-dining',       label: '🍷 Fine dining' },
    ];

    return (
        <section className="card section-card stack-lg">
            <div className="section-card__header section-card__header--plain">
                <div>
                    <p className="eyebrow">
                        <FontAwesomeIcon icon={faSlidersH} style={{ marginRight: '6px' }} />
                        Travel Preferences
                    </p>
                    <h2>Your travel style</h2>
                    {!isAuthenticated && (
                        <p className="muted-text" style={{ marginTop: '4px' }}>
                            These are the defaults we use for anonymous trips.{' '}
                            <strong>Sign in to save your own.</strong>
                        </p>
                    )}
                </div>
            </div>

            <form className="stack-lg" onSubmit={(e) => void handleSave(e)}>
                {/* Daily budget */}
                <label className="field-group budget-input-container">
                    <div className="budget-input__header">
                        <span className="field-group__label">Daily budget</span>
                        <strong className="budget-input__value">€{form.dailyBudget ?? 100}/day</strong>
                    </div>
                    <input
                        type="range"
                        min={20}
                        max={500}
                        step={10}
                        value={form.dailyBudget ?? 100}
                        onChange={(e) => setForm((prev) => ({ ...prev, dailyBudget: Number(e.target.value) }))}
                        disabled={!isAuthenticated}
                    />
                    <div className="budget-input__scale"><span>€20</span><span>€500</span></div>
                    <span className="field-group__hint">Used as the default when planning a trip without specifying a budget.</span>
                </label>

                {/* Pace */}
                <fieldset className="field-group option-grid-fieldset">
                    <legend className="field-group__label">Travel pace</legend>
                    <div className="option-grid option-grid--compact">
                        {(['relaxed', 'balanced', 'intense'] as TravelPace[]).map((p) => (
                            <button
                                key={p}
                                type="button"
                                disabled={!isAuthenticated}
                                className={form.pace === p ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, pace: p }))}
                            >
                                <span className="choice-card__title">
                                    {form.pace === p && <FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px', color: 'var(--primary)' }} />}
                                    {paceLabel(p)}
                                </span>
                                <span className="choice-card__description">
                                    {p === 'relaxed' && 'Max 2 activities/day, leisurely starts'}
                                    {p === 'balanced' && '3 activities/day, comfortable breaks'}
                                    {p === 'intense' && 'Full days, optimized routing'}
                                </span>
                            </button>
                        ))}
                    </div>
                </fieldset>

                {/* Transport */}
                <fieldset className="field-group option-grid-fieldset">
                    <legend className="field-group__label">Preferred transport</legend>
                    <div className="option-grid option-grid--compact">
                        {([
                            { v: 'public_transport', emoji: '🚇', desc: 'Metro, bus, tram' },
                            { v: 'walking',          emoji: '🚶', desc: 'Walkable distances only' },
                            { v: 'taxi',             emoji: '🚕', desc: 'Taxis and ride-shares' },
                            { v: 'rental_car',       emoji: '🚗', desc: 'Self-drive flexibility' },
                        ] as { v: PreferredTransport; emoji: string; desc: string }[]).map(({ v, emoji, desc }) => (
                            <button
                                key={v}
                                type="button"
                                disabled={!isAuthenticated}
                                className={form.preferredTransport === v ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, preferredTransport: v }))}
                            >
                                <span className="choice-card__title">
                                    {form.preferredTransport === v && <FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px', color: 'var(--primary)' }} />}
                                    {emoji} {transportLabel(v)}
                                </span>
                                <span className="choice-card__description">{desc}</span>
                            </button>
                        ))}
                    </div>
                </fieldset>

                {/* Food */}
                <fieldset className="field-group option-grid-fieldset">
                    <legend className="field-group__label">Food preferences</legend>
                    <div className="checkbox-grid">
                        {foodOptions.map((opt) => {
                            const checked = (form.foodPreferences ?? []).includes(opt.value);
                            return (
                                <label
                                    key={opt.value}
                                    className={checked ? 'checkbox-chip checkbox-chip--checked' : 'checkbox-chip'}
                                    style={{ opacity: isAuthenticated ? 1 : 0.6 }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!isAuthenticated}
                                        onChange={() => toggle(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                {/* AI provider */}
                <label className="field-group">
                    <span className="field-group__label">Preferred AI provider</span>
                    <select
                        className="text-input"
                        disabled={!isAuthenticated}
                        value={form.preferredAiProvider ?? ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, preferredAiProvider: (e.target.value as AiProviderName) || null }))}
                    >
                        <option value="">Auto (system picks best available)</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                        <option value="grok">Grok</option>
                    </select>
                    <span className="field-group__hint">
                        {!isAuthenticated
                            ? providerLabel(ANONYMOUS_PROFILE.preferredAiProvider)
                            : `Currently: ${providerLabel(form.preferredAiProvider)}`}
                    </span>
                </label>

                {formError && <div className="notice-banner notice-banner--error">{formError}</div>}

                {isAuthenticated && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button type="submit" className="button button--large" disabled={isLoading}>
                            <FontAwesomeIcon icon={faCheck} />
                            {isLoading ? 'Saving...' : 'Save preferences'}
                        </button>
                        {saved && <span className="tag tag--success">✓ Saved</span>}
                    </div>
                )}
            </form>
        </section>
    );
};

/* ─── Profile page ────────────────────────────────────────────────────────────── */

const Profile: React.FC = () => {
    const { account, isAuthenticated, logout } = useProfile();

    return (
        <div className="stack-xl">
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow eyebrow--light">
                        <FontAwesomeIcon icon={faUser} style={{ marginRight: '8px' }} />
                        {isAuthenticated ? account?.username : 'Travelling anonymously'}
                    </p>
                    <h1>{isAuthenticated ? 'Your profile' : 'Your travel profile'}</h1>
                    <p className="hero-card__lede">
                        {isAuthenticated
                            ? 'Your preferences are saved and applied to every trip you plan.'
                            : 'You\'re using sensible defaults. Sign in to personalise your experience and save your preferences.'}
                    </p>
                    {isAuthenticated && (
                        <button
                            type="button"
                            className="button button--ghost"
                            style={{ marginTop: '16px', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
                            onClick={logout}
                        >
                            <FontAwesomeIcon icon={faSignOutAlt} />
                            Sign out
                        </button>
                    )}
                </div>
            </section>

            <PreferencesSection />

            {!isAuthenticated && <AuthSection />}
        </div>
    );
};

export default Profile;

