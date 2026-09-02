import {
    faArrowLeft,
    faArrowRight,
    faCar,
    faCheck,
    faDatabase,
    faPersonWalking,
    faShieldAlt,
    faSignInAlt,
    faSignOutAlt,
    faSlidersH,
    faTaxi,
    faTrainSubway,
    faUser,
    faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ANONYMOUS_PROFILE, paceLabel, providerLabel, transportLabel, useProfile } from './ProfileContext';
import { AiProviderName, PreferredTransport, TravelPace, UpdateUserProfileRequest } from './services/api';

type AuthMode = 'login' | 'register';

const AuthProgress: React.FC<{ mode: AuthMode }> = ({ mode }) => {
    const { flow, statusMessage, successMessage, error, isBootstrapping, refreshSession, isAuthenticated } = useProfile();

    const steps = useMemo(() => [
        mode === 'login' ? 'Credential validation' : 'Account creation',
        'Secure session verification',
        'Profile loading from the database',
    ], [mode]);

    const currentStep = (() => {
        switch (flow) {
            case 'registering':
            case 'signing-in':
                return 0;
            case 'checking-session':
                return 1;
            case 'loading-profile':
                return 2;
            case 'authenticated':
                return 3;
            default:
                return -1;
        }
    })();

    return (
        <div className="auth-status-panel stack-md">
            <div className="auth-status-panel__header">
                <div>
                    <strong>{isBootstrapping ? 'Connecting to the backend' : 'Account linked to the database'}</strong>
                    <p className="muted-text">
                        {statusMessage ?? (isAuthenticated
                            ? 'Session verified. The preferences shown here come from the database.'
                            : 'This flow follows the real steps: authentication, session verification, then profile loading.')}
                    </p>
                </div>
                {(flow === 'error' || (!isAuthenticated && !isBootstrapping)) && (
                    <button type="button" className="button button--secondary button--small" onClick={() => void refreshSession()}>
                        Check session
                    </button>
                )}
            </div>

            <ol className="auth-step-list">
                {steps.map((step, index) => {
                    const completed = currentStep > index;
                    const active = currentStep === index;
                    return (
                        <li key={step} className={`auth-step-item ${completed ? 'auth-step-item--done' : active ? 'auth-step-item--active' : ''}`}>
                            <span className="auth-step-item__index">{completed ? '✓' : index + 1}</span>
                            <div>
                                <strong>{step}</strong>
                                <p className="muted-text">{completed ? 'Done' : active ? 'In progress' : 'Pending'}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            {successMessage && <div className="notice-banner"><strong>OK:</strong> {successMessage}</div>}
            {error && <div className="notice-banner notice-banner--error">{error}</div>}
        </div>
    );
};

const AuthWizardSection: React.FC = () => {
    const { login, register, isLoading, error, flow, sessionNotice, clearSessionNotice } = useProfile();
    const [mode, setMode] = useState<AuthMode>('login');
    const [wizardStep, setWizardStep] = useState(1);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    const totalSteps = mode === 'register' ? 3 : 2;

    useEffect(() => {
        setWizardStep(1);
        setFormError(null);
        clearSessionNotice();
    }, [clearSessionNotice, mode]);

    const validateCurrentStep = (): boolean => {
        if (wizardStep === 1) {
            if (!username.trim()) {
                setFormError('Please enter your username.');
                return false;
            }
            if (mode === 'register' && email && !/^\S+@\S+\.\S+$/.test(email)) {
                setFormError('Please enter a valid email address.');
                return false;
            }
        }

        if (wizardStep === 2 && password.trim().length < 4) {
            setFormError('Your password must contain at least 4 characters.');
            return false;
        }

        setFormError(null);
        return true;
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        setWizardStep((prev) => Math.min(totalSteps, prev + 1));
    };

    const handleBack = () => {
        setFormError(null);
        setWizardStep((prev) => Math.max(1, prev - 1));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateCurrentStep()) return;
        clearSessionNotice();

        try {
            if (mode === 'login') {
                await login({ username: username.trim(), password });
            } else {
                await register({ username: username.trim(), password, email: email.trim() || undefined });
            }
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Something went wrong.');
        }
    };

    return (
        <section className="auth-wizard card">
            <div className="auth-wizard__hero">
                <div className="auth-wizard__copy stack-md">
                    <span className="auth-wizard__eyebrow">Create an account</span>
                    <h2>{mode === 'login' ? 'Smooth, verified sign-in' : 'Create your account in under a minute'}</h2>
                    <p>
                        {mode === 'login'
                            ? 'We verify your credentials, confirm the secure session, then reload your real profile from the database.'
                            : 'Sign-up, automatic sign-in, account sync, then a guided 3-step onboarding flow.'}
                    </p>

                    <div className="auth-wizard__benefits">
                        <div className="auth-benefit-card">
                            <FontAwesomeIcon icon={faDatabase} />
                            <div>
                                <strong>Real database</strong>
                                <p>Your preferences are reloaded from the server, not just kept locally.</p>
                            </div>
                        </div>
                        <div className="auth-benefit-card">
                            <FontAwesomeIcon icon={faShieldAlt} />
                            <div>
                                <strong>Verified session</strong>
                                <p>The system confirms the user and session before showing the profile.</p>
                            </div>
                        </div>
                        <div className="auth-benefit-card">
                            <FontAwesomeIcon icon={faCheck} />
                            <div>
                                <strong>Fast onboarding</strong>
                                <p>After sign-up, 3 short steps prepare a travel profile that is ready to use.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="auth-wizard__panel stack-lg">
                    <div className="auth-mode-toggle" role="tablist" aria-label="Choose sign in or sign up">
                        <button
                            type="button"
                            className={mode === 'login' ? 'auth-mode-toggle__button auth-mode-toggle__button--active' : 'auth-mode-toggle__button'}
                            onClick={() => setMode('login')}
                        >
                            <FontAwesomeIcon icon={faSignInAlt} /> Sign in
                        </button>
                        <button
                            type="button"
                            className={mode === 'register' ? 'auth-mode-toggle__button auth-mode-toggle__button--active' : 'auth-mode-toggle__button'}
                            onClick={() => setMode('register')}
                        >
                            <FontAwesomeIcon icon={faUserPlus} /> Sign up
                        </button>
                    </div>

                    <div className="auth-wizard__stepper">
                        {Array.from({ length: totalSteps }).map((_, index) => {
                            const step = index + 1;
                            return (
                                <div key={step} className={step === wizardStep ? 'auth-wizard__dot auth-wizard__dot--active' : step < wizardStep ? 'auth-wizard__dot auth-wizard__dot--done' : 'auth-wizard__dot'}>
                                    <span>{step < wizardStep ? '✓' : step}</span>
                                    <small>
                                        {step === 1 && 'Profile'}
                                        {step === 2 && 'Security'}
                                        {step === 3 && 'Finish'}
                                    </small>
                                </div>
                            );
                        })}
                    </div>

                    <form className="stack-lg" onSubmit={(e) => void handleSubmit(e)}>
                        {wizardStep === 1 && (
                            <div className="auth-step-panel stack-md">
                                <div>
                                    <p className="eyebrow">Step 1</p>
                                    <h3>{mode === 'login' ? 'Who is signing in?' : 'Let’s create your account identity'}</h3>
                                </div>

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
                            </div>
                        )}

                        {wizardStep === 2 && (
                            <div className="auth-step-panel stack-md">
                                <div>
                                    <p className="eyebrow">Step 2</p>
                                    <h3>{mode === 'login' ? 'Secure your sign-in' : 'Set your secure access'}</h3>
                                </div>

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

                                <div className="auth-inline-note">
                                    <FontAwesomeIcon icon={faShieldAlt} />
                                    <span>{mode === 'login' ? 'We will verify the server session next.' : 'After account creation, sign-in will happen automatically.'}</span>
                                </div>
                            </div>
                        )}

                        {mode === 'register' && wizardStep === 3 && (
                            <div className="auth-step-panel stack-md">
                                <div>
                                    <p className="eyebrow">Step 3</p>
                                    <h3>Ready for onboarding</h3>
                                    <p className="muted-text">Right after sign-up, we guide you through 3 short steps to configure budget, pace, and transport.</p>
                                </div>

                                <div className="auth-review-card">
                                    <div><strong>Account</strong><p className="muted-text">{username || '—'}</p></div>
                                    <div><strong>Email</strong><p className="muted-text">{email || 'Not provided'}</p></div>
                                    <div><strong>Next</strong><p className="muted-text">Sign-in → database sync → 3-step onboarding</p></div>
                                </div>
                            </div>
                        )}

                        {sessionNotice && <div className="notice-banner notice-banner--warning">{sessionNotice}</div>}
                        {(formError ?? error) && <div className="notice-banner notice-banner--error">{formError ?? error}</div>}

                        <div className="auth-wizard__actions">
                            <button type="button" className="button button--secondary" onClick={handleBack} disabled={wizardStep === 1 || isLoading}>
                                <FontAwesomeIcon icon={faArrowLeft} /> Back
                            </button>

                            {wizardStep < totalSteps ? (
                                <button type="button" className="button button--large" onClick={handleNext}>
                                    Continue <FontAwesomeIcon icon={faArrowRight} />
                                </button>
                            ) : (
                                <button type="submit" className="button button--large" disabled={isLoading}>
                                    <FontAwesomeIcon icon={mode === 'login' ? faSignInAlt : faUserPlus} />
                                    {isLoading
                                        ? flow === 'registering' || flow === 'signing-in' || flow === 'loading-profile'
                                            ? 'Connecting to the server...'
                                            : 'Please wait...'
                                        : mode === 'login'
                                            ? 'Sign in'
                                            : 'Create my account'}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>

            <AuthProgress mode={mode} />
        </section>
    );
};

const OnboardingFlow: React.FC = () => {
    const navigate = useNavigate();
    const {
        profile,
        onboardingStep,
        setOnboardingStep,
        completeOnboarding,
        skipOnboarding,
        savePreferences,
        isSavingPreferences,
    } = useProfile();
    const [form, setForm] = useState<UpdateUserProfileRequest>({
        dailyBudget: profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget,
        pace: profile.pace ?? ANONYMOUS_PROFILE.pace,
        preferredTransport: profile.preferredTransport ?? ANONYMOUS_PROFILE.preferredTransport,
        foodPreferences: [...(profile.foodPreferences ?? [])],
        preferredAiProvider: profile.preferredAiProvider ?? null,
    });
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        setForm({
            dailyBudget: profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget,
            pace: profile.pace ?? ANONYMOUS_PROFILE.pace,
            preferredTransport: profile.preferredTransport ?? ANONYMOUS_PROFILE.preferredTransport,
            foodPreferences: [...(profile.foodPreferences ?? [])],
            preferredAiProvider: profile.preferredAiProvider ?? null,
        });
    }, [profile]);

    const budgetPresets = [
        { label: 'Budget', value: 60, helper: 'Smart city break, simple meals, optimized transport.' },
        { label: 'Balanced', value: 120, helper: 'Comfort plus a few extras without blowing the budget.' },
        { label: 'Luxury', value: 220, helper: 'More flexibility, taxis, and standout places included.' },
    ];

    const transportOptions: { value: PreferredTransport; label: string; icon: IconDefinition; helper: string }[] = [
        { value: 'walking', label: 'Walking', icon: faPersonWalking, helper: 'Everything within walking distance.' },
        { value: 'public_transport', label: 'Public transport', icon: faTrainSubway, helper: 'Metro, bus and tram.' },
        { value: 'taxi', label: 'Taxi', icon: faTaxi, helper: 'Door to door, at a price.' },
        { value: 'rental_car', label: 'Rental car', icon: faCar, helper: 'For spread-out areas and road trips.' },
    ];

    const foodOptions = [
        { value: 'local-specialties', label: 'Local cuisine' },
        { value: 'street-food', label: 'Street food' },
        { value: 'seafood', label: 'Seafood' },
        { value: 'vegetarian', label: 'Vegetarian' },
        { value: 'vegan', label: 'Vegan' },
        { value: 'fine-dining', label: 'Fine dining' },
    ];

    const toggleFood = (pref: string) => {
        setForm((prev) => {
            const current = prev.foodPreferences ?? [];
            return {
                ...prev,
                foodPreferences: current.includes(pref)
                    ? current.filter((item) => item !== pref)
                    : [...current, pref],
            };
        });
    };

    const handleFinish = async () => {
        setFormError(null);
        try {
            await savePreferences(form);
            completeOnboarding();
            navigate('/planner');
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not finish onboarding.');
        }
    };

    return (
        <section className="card section-card onboarding-panel stack-lg">
            <div className="section-card__header section-card__header--plain">
                <div>
                    <p className="eyebrow"><FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px' }} />Onboarding</p>
                    <h2>Welcome — let’s configure your profile in 3 steps</h2>
                    <p className="muted-text">Each step improves future itineraries and saves your preferences directly to the database.</p>
                </div>
                <button type="button" className="button button--secondary button--small" onClick={skipOnboarding}>Skip</button>
            </div>

            <div className="onboarding-progress">
                {[1, 2, 3].map((step) => (
                    <button
                        key={step}
                        type="button"
                        className={step === onboardingStep ? 'onboarding-progress__step onboarding-progress__step--active' : step < onboardingStep ? 'onboarding-progress__step onboarding-progress__step--done' : 'onboarding-progress__step'}
                        onClick={() => setOnboardingStep(step)}
                    >
                        <span>{step < onboardingStep ? '✓' : step}</span>
                        <small>
                            {step === 1 && 'Budget'}
                            {step === 2 && 'Pace'}
                            {step === 3 && 'Taste'}
                        </small>
                    </button>
                ))}
            </div>

            {onboardingStep === 1 && (
                <div className="stack-lg">
                    <div>
                        <h3>1. What default budget level do you want?</h3>
                        <p className="muted-text">This amount becomes the base for all itineraries when you do not specify a budget.</p>
                    </div>
                    <div className="option-grid option-grid--compact">
                        {budgetPresets.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                className={form.dailyBudget === preset.value ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, dailyBudget: preset.value }))}
                            >
                                <span className="choice-card__title">{preset.label} · €{preset.value}/day</span>
                                <span className="choice-card__description">{preset.helper}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {onboardingStep === 2 && (
                <div className="stack-lg">
                    <div>
                        <h3>2. What pace and transport fit you best?</h3>
                        <p className="muted-text">We use this to avoid overloaded schedules or unrealistic transfers.</p>
                    </div>

                    <div className="option-grid option-grid--compact">
                        {(['relaxed', 'balanced', 'intense'] as TravelPace[]).map((pace) => (
                            <button
                                key={pace}
                                type="button"
                                className={form.pace === pace ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, pace }))}
                            >
                                <span className="choice-card__title">{paceLabel(pace)}</span>
                                <span className="choice-card__description">
                                    {pace === 'relaxed' && 'Fewer activities, more breathing room.'}
                                    {pace === 'balanced' && 'Good density without the stress.'}
                                    {pace === 'intense' && 'Full, optimized days.'}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="option-grid option-grid--compact">
                        {transportOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={form.preferredTransport === option.value ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, preferredTransport: option.value }))}
                            >
                                <span className="choice-card__title"><FontAwesomeIcon icon={option.icon} /> {option.label}</span>
                                <span className="choice-card__description">{option.helper}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {onboardingStep === 3 && (
                <div className="stack-lg">
                    <div>
                        <h3>3. Let’s refine your preferences</h3>
                        <p className="muted-text">The final step before making the profile fully ready to use.</p>
                    </div>

                    <div className="checkbox-grid">
                        {foodOptions.map((option) => {
                            const checked = (form.foodPreferences ?? []).includes(option.value);
                            return (
                                <label key={option.value} className={checked ? 'checkbox-chip checkbox-chip--checked' : 'checkbox-chip'}>
                                    <input type="checkbox" checked={checked} onChange={() => toggleFood(option.value)} />
                                    <span>{option.label}</span>
                                </label>
                            );
                        })}
                    </div>

                    <label className="field-group">
                        <span className="field-group__label">Favorite AI</span>
                        <select
                            className="text-input"
                            value={form.preferredAiProvider ?? ''}
                            onChange={(e) => setForm((prev) => ({ ...prev, preferredAiProvider: (e.target.value as AiProviderName) || null }))}
                        >
                            <option value="">Auto (best available option)</option>
                            <option value="openai">OpenAI</option>
                            <option value="gemini">Gemini</option>
                            <option value="grok">Grok</option>
                        </select>
                    </label>
                </div>
            )}

            {formError && <div className="notice-banner notice-banner--error">{formError}</div>}

            <div className="onboarding-actions">
                <button type="button" className="button button--secondary" onClick={() => setOnboardingStep(onboardingStep - 1)} disabled={onboardingStep === 1 || isSavingPreferences}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                {onboardingStep < 3 ? (
                    <button type="button" className="button button--large" onClick={() => setOnboardingStep(onboardingStep + 1)}>
                        Continue <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                ) : (
                    <button type="button" className="button button--large" onClick={() => void handleFinish()} disabled={isSavingPreferences}>
                        <FontAwesomeIcon icon={faCheck} />
                        {isSavingPreferences ? 'Syncing...' : 'Finish and sync'}
                    </button>
                )}
            </div>
        </section>
    );
};

const PreferencesSection: React.FC = () => {
    const { account, profile, isAuthenticated, isLoading, isSavingPreferences, savePreferences, successMessage } = useProfile();
    const [form, setForm] = useState<UpdateUserProfileRequest>({
        dailyBudget: profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget,
        pace: profile.pace ?? ANONYMOUS_PROFILE.pace,
        preferredTransport: profile.preferredTransport ?? ANONYMOUS_PROFILE.preferredTransport,
        foodPreferences: [...(profile.foodPreferences ?? [])],
        preferredAiProvider: profile.preferredAiProvider ?? null,
    });
    const [saved, setSaved] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        setForm({
            dailyBudget: profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget,
            pace: profile.pace ?? ANONYMOUS_PROFILE.pace,
            preferredTransport: profile.preferredTransport ?? ANONYMOUS_PROFILE.preferredTransport,
            foodPreferences: [...(profile.foodPreferences ?? [])],
            preferredAiProvider: profile.preferredAiProvider ?? null,
        });
    }, [profile]);

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
        { value: 'local-specialties', label: 'Local cuisine' },
        { value: 'street-food', label: 'Street food' },
        { value: 'seafood', label: 'Seafood' },
        { value: 'vegetarian', label: 'Vegetarian' },
        { value: 'vegan', label: 'Vegan' },
        { value: 'fine-dining', label: 'Fine dining' },
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
                            These are the defaults we use for anonymous trips. <strong>Sign in to save your own.</strong>
                        </p>
                    )}
                </div>
            </div>

            <div className="notice-banner" style={{ alignItems: 'flex-start', gap: '12px' }}>
                <div>
                    <strong>{isAuthenticated ? 'Profile synced with the database' : 'Anonymous mode'}</strong>
                    <p className="muted-text" style={{ margin: '6px 0 0' }}>
                        {isAuthenticated
                            ? `Signed in as ${account?.username ?? 'user'}. Every change is saved on the server and reused for your itineraries.`
                            : 'You are seeing realistic defaults. Sign in to load and save your real preferences.'}
                    </p>
                </div>
            </div>

            <form className="stack-lg" onSubmit={(e) => void handleSave(e)}>
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

                <fieldset className="field-group option-grid-fieldset">
                    <legend className="field-group__label">Preferred transport</legend>
                    <div className="option-grid option-grid--compact">
                        {([
                            { v: 'public_transport', icon: faTrainSubway, desc: 'Metro, bus, tram' },
                            { v: 'walking', icon: faPersonWalking, desc: 'Walkable distances only' },
                            { v: 'taxi', icon: faTaxi, desc: 'Taxis and ride-shares' },
                            { v: 'rental_car', icon: faCar, desc: 'Self-drive flexibility' },
                        ] as { v: PreferredTransport; icon: IconDefinition; desc: string }[]).map(({ v, icon, desc }) => (
                            <button
                                key={v}
                                type="button"
                                disabled={!isAuthenticated}
                                className={form.preferredTransport === v ? 'choice-card choice-card--selected' : 'choice-card'}
                                onClick={() => setForm((prev) => ({ ...prev, preferredTransport: v }))}
                            >
                                <span className="choice-card__title">
                                    {form.preferredTransport === v && <FontAwesomeIcon icon={faCheck} style={{ marginRight: '6px', color: 'var(--primary)' }} />}
                                    <FontAwesomeIcon icon={icon} /> {transportLabel(v)}
                                </span>
                                <span className="choice-card__description">{desc}</span>
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="field-group option-grid-fieldset">
                    <legend className="field-group__label">Food preferences</legend>
                    <div className="checkbox-grid">
                        {foodOptions.map((opt) => {
                            const checked = (form.foodPreferences ?? []).includes(opt.value);
                            return (
                                <label key={opt.value} className={checked ? 'checkbox-chip checkbox-chip--checked' : 'checkbox-chip'} style={{ opacity: isAuthenticated ? 1 : 0.6 }}>
                                    <input type="checkbox" checked={checked} disabled={!isAuthenticated} onChange={() => toggle(opt.value)} />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

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
                {!formError && saved && successMessage && <div className="notice-banner">{successMessage}</div>}

                {isAuthenticated && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button type="submit" className="button button--large" disabled={isLoading}>
                            <FontAwesomeIcon icon={faCheck} />
                            {isSavingPreferences ? 'Saving to the database...' : 'Save preferences'}
                        </button>
                        {saved && <span className="tag tag--success">✓ Saved</span>}
                    </div>
                )}
            </form>
        </section>
    );
};

const Profile: React.FC = () => {
    const {
        account,
        profile,
        isAuthenticated,
        logout,
        isBootstrapping,
        statusMessage,
        syncState,
        isOnboardingActive,
        sessionNotice,
    } = useProfile();

    const syncLabel = syncState === 'synced'
        ? 'Account synced with the database'
        : syncState === 'syncing'
            ? 'Sync in progress'
            : syncState === 'error'
                ? 'Sync error'
                : 'Anonymous mode';

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
                            ? 'Your account is linked to the database and your preferences power every trip plan.'
                            : 'You are using smart defaults. Create an account to load and save your real travel profile.'}
                    </p>
                    <div className="hero-card__actions" style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span className={`account-sync-pill account-sync-pill--${syncState}`}>{syncLabel}</span>
                        {isAuthenticated && (
                            <button
                                type="button"
                                className="button button--ghost"
                                style={{ color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
                                onClick={() => void logout()}
                            >
                                <FontAwesomeIcon icon={faSignOutAlt} />
                                Sign out
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="card section-card stack-lg">
                <div className="section-card__header section-card__header--plain">
                    <div>
                        <p className="eyebrow">Account status</p>
                        <h2>{isAuthenticated ? 'Connected to your saved profile' : 'Anonymous profile in use'}</h2>
                        <p className="muted-text">
                            {isBootstrapping
                                ? (statusMessage ?? 'Checking your existing session...')
                                : isAuthenticated
                                    ? 'Your account and preferences were reloaded from the backend.'
                                    : 'No active session. You can continue anonymously or sign in to load your data.'}
                        </p>
                    </div>
                </div>

                {!isAuthenticated && sessionNotice && (
                    <div className="notice-banner notice-banner--warning">{sessionNotice}</div>
                )}

                <div className="info-grid">
                    <div className="card" style={{ padding: '16px' }}>
                        <strong>Account</strong>
                        <p className="muted-text" style={{ marginTop: '8px' }}>{isAuthenticated ? account?.username : 'Anonymous traveller'}</p>
                    </div>
                    <div className="card" style={{ padding: '16px' }}>
                        <strong>Budget</strong>
                        <p className="muted-text" style={{ marginTop: '8px' }}>€{profile.dailyBudget ?? ANONYMOUS_PROFILE.dailyBudget}/day</p>
                    </div>
                    <div className="card" style={{ padding: '16px' }}>
                        <strong>Pace</strong>
                        <p className="muted-text" style={{ marginTop: '8px' }}>{paceLabel(profile.pace)}</p>
                    </div>
                    <div className="card" style={{ padding: '16px' }}>
                        <strong>Transport</strong>
                        <p className="muted-text" style={{ marginTop: '8px' }}>{transportLabel(profile.preferredTransport)}</p>
                    </div>
                </div>
            </section>

            {isAuthenticated && isOnboardingActive && <OnboardingFlow />}
            {(!isAuthenticated || !isOnboardingActive) && <PreferencesSection />}
            {!isAuthenticated && <AuthWizardSection />}
        </div>
    );
};

export default Profile;

