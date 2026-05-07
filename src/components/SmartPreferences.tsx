/**
 * SmartPreferences — 3-step preference wizard.
 * Collects Budget tier → Transport mode → Vibe in a Tinder-style card flow.
 * Designed to complete in < 15 seconds (3 taps).
 */
import React, { useState } from 'react';
import { TravelPace, PreferredTransport, UserProfile } from '../services/api';

// ─── Step definitions ─────────────────────────────────────────────────────────

type BudgetTier = 'budget' | 'balanced' | 'luxury';

interface BudgetOption {
    id: BudgetTier;
    label: string;
    sublabel: string;
    amount: number;
    emoji: string;
    color: string;
}

interface TransportOption {
    id: PreferredTransport;
    label: string;
    sublabel: string;
    emoji: string;
}

interface VibeOption {
    id: TravelPace;
    label: string;
    sublabel: string;
    emoji: string;
    description: string;
}

const BUDGET_OPTIONS: BudgetOption[] = [
    { id: 'budget', label: 'Budget', sublabel: '~€50 / day', amount: 50, emoji: '🎒', color: '#4ade80', description: 'Hostels, street food, free attractions' } as any,
    { id: 'balanced', label: 'Balanced', sublabel: '~€100 / day', amount: 100, emoji: '✈️', color: '#60a5fa', description: 'Mid-range hotels, local restaurants, paid tours' } as any,
    { id: 'luxury', label: 'Luxury', sublabel: '~€250 / day', amount: 250, emoji: '🥂', color: '#f59e0b', description: '4-5 star hotels, fine dining, private guides' } as any,
];

const TRANSPORT_OPTIONS: TransportOption[] = [
    { id: 'walking', label: 'Walking', sublabel: 'Free & healthy', emoji: '🚶' },
    { id: 'public_transport', label: 'Bus / Train', sublabel: 'Fast & affordable', emoji: '🚌' },
    { id: 'taxi', label: 'Taxi / Rideshare', sublabel: 'Convenient', emoji: '🚕' },
    { id: 'rental_car', label: 'Rental Car', sublabel: 'Maximum freedom', emoji: '🚗' },
];

const VIBE_OPTIONS: VibeOption[] = [
    { id: 'relaxed', label: 'Relaxed', sublabel: '2–3 things / day', emoji: '😌', description: 'Long lunches, slow mornings, no rushing' },
    { id: 'balanced', label: 'Balanced', sublabel: '3–4 things / day', emoji: '🧭', description: 'Mix of must-sees and leisure time' },
    { id: 'intense', label: 'Packed', sublabel: '5–6 things / day', emoji: '⚡', description: 'Maximum experiences, early starts, full days' },
];

// ─── Step indicator ─────────────────────────────────────────────────────────

const StepDots: React.FC<{ total: number; current: number }> = ({ total, current }) => (
    <div className="sp-dots">
        {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`sp-dot ${i === current ? 'sp-dot--active' : i < current ? 'sp-dot--done' : ''}`} />
        ))}
    </div>
);

// ─── Main wizard ─────────────────────────────────────────────────────────────

export interface SmartPreferencesResult {
    dailyBudget: number;
    preferredTransport: PreferredTransport;
    pace: TravelPace;
}

interface Props {
    initial?: Partial<UserProfile>;
    onComplete: (result: SmartPreferencesResult) => void;
    onSkip?: () => void;
    compact?: boolean;
}

const SmartPreferences: React.FC<Props> = ({ initial, onComplete, onSkip, compact = false }) => {
    const [step, setStep] = useState(0);
    const [budget, setBudget] = useState<BudgetTier>(
        initial?.dailyBudget && initial.dailyBudget >= 200 ? 'luxury'
        : initial?.dailyBudget && initial.dailyBudget >= 80 ? 'balanced'
        : initial?.dailyBudget ? 'budget'
        : 'balanced',
    );
    const [transport, setTransport] = useState<PreferredTransport>(initial?.preferredTransport ?? 'public_transport');
    const [pace, setPace] = useState<TravelPace>(initial?.pace ?? 'balanced');

    const [animDir, setAnimDir] = useState<'in' | 'out'>('in');

    const advance = () => {
        setAnimDir('out');
        setTimeout(() => {
            setStep((s) => s + 1);
            setAnimDir('in');
        }, 160);
    };

    const handleBudgetSelect = (id: BudgetTier) => {
        setBudget(id);
        advance();
    };

    const handleTransportSelect = (id: PreferredTransport) => {
        setTransport(id);
        advance();
    };

    const handleVibeSelect = (id: TravelPace) => {
        setPace(id);
        const selected = BUDGET_OPTIONS.find((b) => b.id === budget)!;
        onComplete({ dailyBudget: selected.amount, preferredTransport: transport, pace: id });
    };

    const stepClass = `sp-step sp-step--${animDir}`;

    const steps = [
        /* Step 0 — Budget */
        <div key="budget" className={stepClass}>
            <div className="sp-step__header">
                <span className="sp-step__question">What's your daily budget?</span>
                <span className="sp-step__hint">Sets your restaurants, hotels &amp; activities tier</span>
            </div>
            <div className="sp-option-grid sp-option-grid--3">
                {BUDGET_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        className={`sp-card ${budget === opt.id ? 'sp-card--selected' : ''}`}
                        onClick={() => handleBudgetSelect(opt.id)}
                        style={{ '--sp-accent': opt.color } as React.CSSProperties}
                    >
                        <span className="sp-card__emoji">{opt.emoji}</span>
                        <span className="sp-card__label">{opt.label}</span>
                        <span className="sp-card__sub">{opt.sublabel}</span>
                    </button>
                ))}
            </div>
        </div>,

        /* Step 1 — Transport */
        <div key="transport" className={stepClass}>
            <div className="sp-step__header">
                <span className="sp-step__question">How do you get around?</span>
                <span className="sp-step__hint">We'll route your itinerary accordingly</span>
            </div>
            <div className="sp-option-grid sp-option-grid--4">
                {TRANSPORT_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        className={`sp-card ${transport === opt.id ? 'sp-card--selected' : ''}`}
                        onClick={() => handleTransportSelect(opt.id)}
                    >
                        <span className="sp-card__emoji">{opt.emoji}</span>
                        <span className="sp-card__label">{opt.label}</span>
                        <span className="sp-card__sub">{opt.sublabel}</span>
                    </button>
                ))}
            </div>
        </div>,

        /* Step 2 — Vibe */
        <div key="vibe" className={stepClass}>
            <div className="sp-step__header">
                <span className="sp-step__question">What's your travel vibe?</span>
                <span className="sp-step__hint">Sets how much we pack into each day</span>
            </div>
            <div className="sp-option-grid sp-option-grid--3">
                {VIBE_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        className={`sp-card sp-card--wide ${pace === opt.id ? 'sp-card--selected' : ''}`}
                        onClick={() => handleVibeSelect(opt.id)}
                    >
                        <span className="sp-card__emoji">{opt.emoji}</span>
                        <span className="sp-card__label">{opt.label}</span>
                        <span className="sp-card__sub">{opt.sublabel}</span>
                        <span className="sp-card__desc">{opt.description}</span>
                    </button>
                ))}
            </div>
        </div>,
    ];

    const LABELS = ['Budget', 'Transport', 'Vibe'];

    return (
        <div className={`smart-preferences ${compact ? 'smart-preferences--compact' : ''}`}>
            {!compact && (
                <div className="sp-header">
                    <p className="eyebrow">Quick Setup</p>
                    <h3>Personalise your trip in 3 taps</h3>
                </div>
            )}

            <div className="sp-progress">
                <StepDots total={3} current={step} />
                <span className="sp-progress__label">{LABELS[step]}</span>
            </div>

            <div className="sp-stage">
                {steps[step]}
            </div>

            {onSkip && step === 0 && (
                <button type="button" className="sp-skip" onClick={onSkip}>
                    Skip — use defaults
                </button>
            )}
        </div>
    );
};

export default SmartPreferences;

