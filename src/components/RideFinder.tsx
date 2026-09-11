// Ride Finder — the chip-based search surface.
//
// This renders the state machine in hooks/useRideFinder.ts and nothing else:
// no fetching, no planning, no scoring. Every number shown comes from a
// backend payload via the shared selectors.

import React, { FormEvent, useState } from 'react';
import { RideFinderState, useRideFinder, UseRideFinderOptions } from '../hooks/useRideFinder';
import { ResolvedIntent, TripIntent } from '../services/tripIntent';
import { TripOption } from '../services/tripSearch';
import { formatCurrency, formatKm } from '../services/tripExploreSelectors';
import './RideFinder.css';

/** Seeded from the catalogue, so every example actually resolves. */
const EXAMPLE_INTENTS = [
    'cable park, beginner friendly, somewhere warm',
    '4 of us from Dublin for 2 days, cable park only',
    'the least stressful trip, even if it costs more',
];

const chipLabel = (intent: ResolvedIntent): Array<{ field: keyof TripIntent; text: string }> => {
    const chips: Array<{ field: keyof TripIntent; text: string }> = [];
    if (intent.origin) chips.push({ field: 'origin', text: `From ${intent.origin}` });
    if (intent.nights) chips.push({ field: 'nights', text: `${intent.nights} nights` });
    if (intent.partySize) chips.push({ field: 'partySize', text: `${intent.partySize} people` });
    if (intent.rideSurface) chips.push({ field: 'rideSurface', text: `${intent.rideSurface} only` });
    if (intent.skillLevel === 'none') chips.push({ field: 'skillLevel', text: 'Beginner friendly' });
    if (intent.climate) chips.push({ field: 'climate', text: intent.climate });
    if (intent.budget.totalEur) chips.push({ field: 'budget', text: `Under ${formatCurrency(intent.budget.totalEur)}` });
    if (intent.dateWindow) chips.push({ field: 'dateWindow', text: `From ${intent.dateWindow.earliest}` });
    chips.push({ field: 'weightProfile', text: `Ranked: ${intent.weightProfile.replace(/_/g, ' ')}` });
    return chips;
};

const ChipRow: React.FC<{ intent: ResolvedIntent; onClear: (field: keyof TripIntent) => void }> = ({
    intent, onClear,
}) => (
    <div className="ride-finder__chips">
        {chipLabel(intent).map((chip) => {
            const source = intent.sources[chip.field];
            const assumed = source === 'assumed' || source === 'profile' || source === undefined;
            const isRank = chip.field === 'weightProfile';
            return (
                <button
                    key={String(chip.field)}
                    type="button"
                    id={`ride-finder-chip-${String(chip.field)}`}
                    className={[
                        'ride-finder__chip',
                        assumed && !isRank ? 'ride-finder__chip--assumed' : '',
                        isRank ? 'ride-finder__chip--rank' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onClear(chip.field)}
                    title={assumed ? 'We assumed this — click to clear' : 'Click to clear'}
                >
                    {chip.text}
                    {assumed && !isRank ? ' · assumed' : ''}
                    <span className="ride-finder__chip-edit" aria-hidden="true">✕</span>
                </button>
            );
        })}
    </div>
);

const OptionCard: React.FC<{ option: TripOption }> = ({ option }) => (
    <article className="ride-finder__option">
        <span className="ride-finder__option-spot">{option.spotLabel}</span>
        <span className="ride-finder__option-total">
            {formatCurrency(option.total.amount, option.total.currency)}
        </span>
        <span className={`ride-finder__badge ride-finder__badge--${option.total.status}`}>
            {option.total.status === 'EXACT' ? '✓ exact'
                : option.total.status === 'MANUAL_CHECK_REQUIRED' ? '⚠ check required'
                    : '~ estimated'}
        </span>
        <span className="ride-finder__option-meta">
            {option.originAirport} → {option.arrivalAirport} · {option.travelDate}
            {option.rideDistanceKm !== null ? ` · ${formatKm(option.rideDistanceKm)} to the water` : ''}
        </span>
        {option.flight.antiCauchemar?.theCatch ? (
            <span className="ride-finder__notice ride-finder__notice--warn">
                {option.flight.antiCauchemar.theCatch}
            </span>
        ) : null}
    </article>
);

const Body: React.FC<{
    state: RideFinderState;
    onClear: (field: keyof TripIntent) => void;
    onAnswer: (value: unknown) => void;
    onRelax: () => void;
}> = ({ state, onClear, onAnswer, onRelax }) => {
    switch (state.status) {
        case 'idle':
            return null;

        case 'parsing':
            return <p className="ride-finder__confidence">Reading “{state.text}”…</p>;

        case 'needs_answer':
            return (
                <div className="ride-finder__notice ride-finder__notice--info">
                    <p><strong>{state.followUp.question}</strong></p>
                    <p className="ride-finder__confidence">{state.followUp.reason}</p>
                    <div className="ride-finder__chips">
                        {state.followUp.options.map((option) => (
                            <button
                                key={String(option.label)}
                                type="button"
                                className="ride-finder__chip"
                                onClick={() => onAnswer(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            );

        case 'searching':
            return (
                <>
                    <ChipRow intent={state.intent} onClear={onClear} />
                    <div className="ride-finder__progress">
                        {Object.entries(state.progress).map(([label, status]) => (
                            <span key={label} className={`ride-finder__progress-item ride-finder__progress-item--${status}`}>
                                {status === 'done' ? '✓' : status === 'failed' ? '✕' : '…'} {label}
                            </span>
                        ))}
                    </div>
                </>
            );

        case 'no_backing': {
            const relaxation = state.plan.blocked?.relaxation;
            return (
                <>
                    <ChipRow intent={state.intent} onClear={onClear} />
                    <div className="ride-finder__notice ride-finder__notice--warn">
                        <p><strong>{state.plan.blocked?.message ?? 'Nothing we can back with real data.'}</strong></p>
                        {relaxation ? (
                            <p>
                                {relaxation.message}.{' '}
                                <button type="button" className="ride-finder__chip" onClick={onRelax}>
                                    Search that instead
                                </button>
                            </p>
                        ) : (
                            <p className="ride-finder__confidence">
                                No nearby alternative we can verify. Try changing a chip above.
                            </p>
                        )}
                    </div>
                </>
            );
        }

        case 'results':
            return (
                <>
                    <ChipRow intent={state.intent} onClear={onClear} />
                    {state.quality !== 'full' ? (
                        <p className={`ride-finder__notice ride-finder__notice--${state.quality === 'degraded' ? 'critical' : 'warn'}`}>
                            {state.quality === 'degraded'
                                ? 'The backend was degraded for this search — treat prices as estimates.'
                                : 'Some searches returned nothing usable. Showing what we could back.'}
                        </p>
                    ) : null}

                    <div className="ride-finder__options">
                        {state.result.options.map((option) => <OptionCard key={option.id} option={option} />)}
                    </div>

                    {state.result.warnings.length > 0 ? (
                        <div className="ride-finder__warnings">
                            {state.result.warnings.map((warning, index) => (
                                <p
                                    key={`${warning.kind}-${index}`}
                                    className={`ride-finder__notice ride-finder__notice--${warning.severity}`}
                                >
                                    {warning.message}
                                </p>
                            ))}
                        </div>
                    ) : null}

                    <p className="ride-finder__confidence">
                        Confidence: {state.result.confidence.level}
                        {state.result.confidence.drivers.length > 0
                            ? ` — ${state.result.confidence.drivers.join(' ')}`
                            : ''}
                    </p>
                </>
            );

        case 'error':
            return (
                <p className="ride-finder__notice ride-finder__notice--critical">
                    {state.message} Try again, or adjust a chip.
                </p>
            );

        default:
            return null;
    }
};

export const RideFinder: React.FC<UseRideFinderOptions> = (options) => {
    const { state, submitText, updateChip, answerFollowUp, applyRelaxation } = useRideFinder(options);
    const [text, setText] = useState('');

    const busy = state.status === 'parsing' || state.status === 'searching';

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        void submitText(text);
    };

    return (
        <section className="ride-finder">
            <form className="ride-finder__form" onSubmit={handleSubmit}>
                <label htmlFor="ride-finder-input" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
                    Describe the trip you want
                </label>
                <input
                    id="ride-finder-input"
                    className="ride-finder__input"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Where do you want to ride?"
                    disabled={busy}
                />
                <button id="ride-finder-submit" type="submit" className="ride-finder__submit" disabled={busy}>
                    {busy ? 'Searching…' : 'Find trips'}
                </button>
            </form>

            {state.status === 'idle' ? (
                <div className="ride-finder__examples">
                    {EXAMPLE_INTENTS.map((example) => (
                        <button
                            key={example}
                            type="button"
                            className="ride-finder__chip"
                            onClick={() => { setText(example); void submitText(example); }}
                        >
                            {example}
                        </button>
                    ))}
                </div>
            ) : null}

            <Body
                state={state}
                onClear={(field) => updateChip(field, null as never)}
                onAnswer={answerFollowUp}
                onRelax={applyRelaxation}
            />
        </section>
    );
};

export default RideFinder;
