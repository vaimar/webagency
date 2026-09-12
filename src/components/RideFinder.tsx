// Ride Finder — the chip-based search surface.
//
// This renders the state machine in hooks/useRideFinder.ts and nothing else:
// no fetching, no planning, no scoring. Every number shown comes from a
// backend payload via the shared selectors.

import React, { FormEvent, useState } from 'react';
import { RideFinderState, useRideFinder, UseRideFinderOptions } from '../hooks/useRideFinder';
import { ResolvedIntent, TripIntent, WeightProfile, WEIGHT_PROFILES } from '../services/tripIntent';
import { TripOption } from '../services/tripSearch';
import { RouteCard, RouteCardLeg, TrustRow } from '../services/routeCard';
import { formatCurrency, formatKm } from '../services/tripExploreSelectors';
import './RideFinder.css';

/** Seeded from the catalogue, so every example actually resolves. */
const EXAMPLE_INTENTS = [
    'cable park road trip, a few spots, somewhere warm',
    '4 of us, 2 nights, cable parks only',
    'least driving, even if it costs a bit more',
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

const ChipRow: React.FC<{ intent: ResolvedIntent; onChip: (field: keyof TripIntent) => void }> = ({
    intent, onChip,
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
                    onClick={() => onChip(chip.field)}
                    title={isRank
                        ? 'Click to change how options are ranked'
                        : assumed ? 'We assumed this — click to clear' : 'Click to clear'}
                >
                    {chip.text}
                    {assumed && !isRank ? ' · assumed' : ''}
                    <span className="ride-finder__chip-edit" aria-hidden="true">{isRank ? '⇄' : '✕'}</span>
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


const fmtDuration = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}m`;
};

const BOARD_TONE: Record<string, string> = {
    FINE: 'EXACT',
    FEE_APPLIES: 'ESTIMATED',
    MUST_BOOK: 'ESTIMATED',
    OVER_LIMIT: 'MANUAL_CHECK_REQUIRED',
    NOT_ALLOWED: 'MANUAL_CHECK_REQUIRED',
    UNKNOWN: 'MANUAL_CHECK_REQUIRED',
};

const LegRow: React.FC<{ leg: RouteCardLeg }> = ({ leg }) => (
    <div className="ride-finder__leg">
        <span className="ride-finder__leg-path">{leg.from} → {leg.to}</span>
        <span className="ride-finder__leg-meta">
            {Math.round(leg.distanceKm)} km · {fmtDuration(leg.durationMinutes)} · {leg.mode}
        </span>
        <span className="ride-finder__leg-cost">
            {leg.travelCostEur === null ? '—' : formatCurrency(leg.travelCostEur)}
        </span>
        <span
            className={`ride-finder__badge ride-finder__badge--${BOARD_TONE[leg.board.verdict] ?? 'ESTIMATED'}`}
            title={leg.board.message}
        >
            board: {leg.board.verdict === 'FINE' ? 'in the car'
                : leg.board.costEur !== null ? formatCurrency(leg.board.costEur)
                    : leg.board.verdict === 'OVER_LIMIT' ? 'too long' : 'unknown'}
        </span>
    </div>
);

/** Never hide uncertainty — show where every fact came from. */
const TrustPanel: React.FC<{ route: RouteCard }> = ({ route }) => {
    const shown: TrustRow[] = route.trust.rows.filter((r) => r.state !== 'UNVERIFIED');
    return (
        <details className="ride-finder__trust">
            <summary>
                Where these facts come from — {route.trust.verified} of {route.trust.total} checked
            </summary>
            <div className="ride-finder__trust-body">
                {shown.map((row) => (
                    <div className="ride-finder__trust-row" key={`${row.spot}-${row.field}`}>
                        <span className={`ride-finder__badge ride-finder__badge--trust-${row.state}`}>{row.state}</span>
                        <span>{row.spot} · {row.field}</span>
                        <span className="ride-finder__trust-src">
                            {row.checkedOn ?? '—'}
                            {row.sourceUrl ? (
                                <> · <a href={row.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>
                            ) : null}
                        </span>
                    </div>
                ))}
                {route.trust.excluded.length > 0 ? (
                    <p className="ride-finder__confidence">
                        Left out: {route.trust.excluded.map((e) => `${e.spot} (${e.reason})`).join('; ')}
                    </p>
                ) : null}
            </div>
        </details>
    );
};

const RouteResult: React.FC<{ route: RouteCard }> = ({ route }) => (
    <article className="ride-finder__route">
        <header className="ride-finder__route-head">
            <span className="ride-finder__option-spot">
                {route.origin.label} → {route.stops.join(' → ')}
            </span>
            <span className="ride-finder__option-meta">
                {route.stops.length} spots · {route.nights} nights · {route.partySize} riding
                {route.orderProven ? ' · shortest order' : ' · good order, not proven shortest'}
            </span>
        </header>

        <div className="ride-finder__legs">
            {route.legs.map((leg, i) => <LegRow key={`${leg.from}-${leg.to}-${i}`} leg={leg} />)}
        </div>

        <div className="ride-finder__totals">
            <div><span>Getting there</span><span>{formatCurrency(route.totals.baseTravelEur)}</span></div>
            <div>
                <span>Board</span>
                <span>{route.totals.boardSurchargeEur > 0
                    ? formatCurrency(route.totals.boardSurchargeEur)
                    : 'in the car'}</span>
            </div>
            <div><span>Sleeping</span><span>{formatCurrency(route.totals.staysEur)}</span></div>
            <div><span>Eating</span><span>{formatCurrency(route.totals.foodEur)}</span></div>
            <div><span>Riding</span><span>{formatCurrency(route.totals.sessionsEur)}</span></div>
            <div className="ride-finder__totals-sum">
                <span>{route.totals.unknownComponents.length > 0 ? 'Known so far' : 'Total'}</span>
                <span>{formatCurrency(route.totals.knownSubtotalEur, route.totals.currency)}</span>
            </div>
            <div className="ride-finder__totals-per">
                <span>Per rider</span>
                <span>{formatCurrency(route.totals.perPersonEur, route.totals.currency)}</span>
            </div>
        </div>

        {route.totals.unknownComponents.length > 0 ? (
            <p className="ride-finder__notice ride-finder__notice--warn">
                Not costed yet: {route.totals.unknownComponents.join(', ')}. The total above is
                short by exactly these — it is not the final price.
            </p>
        ) : null}

        <TrustPanel route={route} />
    </article>
);

const Body: React.FC<{
    state: RideFinderState;
    onChip: (field: keyof TripIntent) => void;
    onAnswer: (value: unknown) => void;
    onRelax: () => void;
}> = ({ state, onChip, onAnswer, onRelax }) => {
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
                    <ChipRow intent={state.intent} onChip={onChip} />
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
                    <ChipRow intent={state.intent} onChip={onChip} />
                    <div className="ride-finder__notice ride-finder__notice--warn">
                        <p><strong>{state.plan.blocked?.message ?? 'No route we can build with real data yet.'}</strong></p>
                        {relaxation ? (
                            <p>
                                {relaxation.message}.{' '}
                                <button type="button" className="ride-finder__chip" onClick={onRelax}>
                                    Search that instead
                                </button>
                            </p>
                        ) : (
                            <p className="ride-finder__confidence">
                                No nearby alternative we can verify. Change a chip above, or add a spot.
                            </p>
                        )}
                    </div>
                </>
            );
        }

        case 'results':
            return (
                <>
                    <ChipRow intent={state.intent} onChip={onChip} />
                    {state.quality !== 'full' ? (
                        <p className={`ride-finder__notice ride-finder__notice--${state.quality === 'degraded' ? 'critical' : 'warn'}`}>
                            {state.quality === 'degraded'
                                ? 'The backend was degraded for this search — treat prices as estimates.'
                                : 'Some spots could not be routed. Showing the route we can back.'}
                        </p>
                    ) : null}

                    {state.route ? <RouteResult route={state.route} /> : null}

                    {state.result ? (
                        <div className="ride-finder__options">
                            {state.result.options.map((option) => <OptionCard key={option.id} option={option} />)}
                        </div>
                    ) : null}

                    {(() => {
                        // Planner warnings (assumptions, hidden spots, truncated
                        // fan-out, unchecked season) are uncertainty the user
                        // must see. They were being computed and dropped.
                        const planNotices = state.plan.warnings.map((w) => ({
                            kind: w.kind,
                            severity: (w.kind === 'HIDDEN_FOR_MISSING_DATA' || w.kind === 'SEASON_UNCHECKED'
                                ? 'warn' : 'info') as 'info' | 'warn' | 'critical',
                            message: w.message,
                        }));
                        const resultNotices = state.route?.warnings ?? state.result?.warnings ?? [];
                        const all = [...planNotices, ...resultNotices];

                        return all.length > 0 ? (
                            <div className="ride-finder__warnings">
                                {all.map((warning, index) => (
                                    <p
                                        key={`${warning.kind}-${index}`}
                                        className={`ride-finder__notice ride-finder__notice--${warning.severity}`}
                                    >
                                        {warning.message}
                                    </p>
                                ))}
                            </div>
                        ) : null;
                    })()}

                    <p className="ride-finder__confidence">
                        Confidence: {state.route?.confidence ?? state.result?.confidence.level}
                        {state.result && state.result.confidence.drivers.length > 0
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

/**
 * Clearing a chip is not one operation. weightProfile always has a value, so
 * its chip cycles; budget and destinationHints clear to their empty shapes;
 * everything else is nullable and clears to null.
 */
const nextWeightProfile = (current: WeightProfile): WeightProfile => {
    const index = WEIGHT_PROFILES.indexOf(current);
    return WEIGHT_PROFILES[(index + 1) % WEIGHT_PROFILES.length];
};

export const RideFinder: React.FC<UseRideFinderOptions> = (options) => {
    const { state, intent, submitText, updateChip, answerFollowUp, applyRelaxation } = useRideFinder(options);
    const [text, setText] = useState('');

    const handleChip = (field: keyof TripIntent) => {
        if (!intent) return;

        if (field === 'weightProfile') {
            updateChip('weightProfile', nextWeightProfile(intent.weightProfile));
            return;
        }
        if (field === 'budget') {
            updateChip('budget', { totalEur: null, band: null, perPerson: false });
            return;
        }
        if (field === 'destinationHints') {
            updateChip('destinationHints', []);
            return;
        }
        // Every remaining field on TripIntent is nullable.
        updateChip(field as 'origin', null);
    };

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
                    Describe the wake route you want
                </label>
                <input
                    id="ride-finder-input"
                    className="ride-finder__input"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Where do you want to ride? Add a few spots."
                    disabled={busy}
                />
                <button id="ride-finder-submit" type="submit" className="ride-finder__submit" disabled={busy}>
                    {busy ? 'Building…' : 'Build my route'}
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
                onChip={handleChip}
                onAnswer={answerFollowUp}
                onRelax={applyRelaxation}
            />
        </section>
    );
};

export default RideFinder;
