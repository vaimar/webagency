import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LowCrowdWindowResponse,
    ResortMatch,
    SkiWindow,
    TravellerPolicy,
    WindowPreset,
    getLowCrowdWindows,
} from '../services/api';
import {
    PRESETS,
    confidenceLabel,
    crowdBand,
    crowdLabel,
    eligibleWindows,
    excludedWindows,
    formatWindowRange,
    formatYear,
    headlineReason,
    isSoft,
    priceIsIndicativeOnly,
    priceTierLabel,
    significantOverlaps,
} from '../services/skiWindows';
import ResortSearchBox from './ResortSearchBox';
import './LowCrowdWindows.css';

const POLICIES: { id: TravellerPolicy; label: string; blurb: string }[] = [
    {
        id: 'AVOID_SCHOOL_HOLIDAY',
        label: 'Avoid school holidays',
        blurb: 'No school-age constraint — dodge peak fares and crowded airports',
    },
    {
        id: 'REQUIRE_SCHOOL_HOLIDAY',
        label: 'Must be school holidays',
        blurb: 'Travelling with school-age children, so only breaks work',
    },
    {
        id: 'INDIFFERENT',
        label: 'Fully flexible',
        blurb: 'Ignore the home calendar entirely',
    },
];

interface Props {
    resort?: string;
    from: string;
    to: string;
    homeCalendar?: string;
    /** ISO start date of the week actually being planned, marked in the list. */
    highlightWeekStart?: string;
    /**
     * Called when a resort is picked. Provided by the route so the choice lands
     * in the URL and stays shareable and back-button friendly; omit it and the
     * search box is hidden rather than being a control that does nothing.
     */
    onResortChange?: (match: ResortMatch) => void;
}

/** The API returns day names as enum constants ("SATURDAY"); prose needs "Saturday". */
const titleCase = (value: string): string =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Horizontal bar for one scoring component. */
const ComponentBar: React.FC<{ label: string; value: number | null | undefined; muted?: boolean }> = ({
    label,
    value,
    muted,
}) => (
    <div className={`lcw-bar ${muted ? 'lcw-bar--muted' : ''}`.trim()}>
        <span className="lcw-bar__label">{label}</span>
        <span className="lcw-bar__track">
            <span className="lcw-bar__fill" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
        </span>
        <span className="lcw-bar__value">{value == null ? 'n/a' : value.toFixed(0)}</span>
    </div>
);

const WindowCard: React.FC<{ window: SkiWindow; priceIndicative: boolean; chosen?: boolean }> = ({
    window,
    priceIndicative,
    chosen,
}) => {
    const [open, setOpen] = useState(false);
    const overlaps = significantOverlaps(window);
    const band = crowdBand(window.metrics.crowdIndex);

    return (
        <article className={`lcw-card ${window.eligible ? '' : 'lcw-card--excluded'} ${chosen ? 'lcw-card--chosen' : ''}`.trim()}>
            {chosen && <span className="lcw-card__chosen-tag">Your week</span>}
            <header className="lcw-card__head">
                <div className="lcw-card__rank">{window.rank != null ? `#${window.rank}` : '—'}</div>
                <div className="lcw-card__dates">
                    <strong>{formatWindowRange(window)}</strong>
                    <span className="lcw-card__year">
                        {formatYear(window)} · {window.nights} nights
                    </span>
                </div>
                <div className="lcw-card__score">
                    {window.totalScore != null ? (
                        <>
                            <strong>{window.totalScore.toFixed(1)}</strong>
                            <span>score</span>
                        </>
                    ) : (
                        <span className="badge badge--danger">Not available</span>
                    )}
                </div>
            </header>

            <p className="lcw-card__reason">{headlineReason(window)}</p>

            <div className="lcw-card__chips">
                <span className={`badge lcw-chip lcw-chip--${band}`}>
                    {crowdLabel(window.metrics.crowdIndex)} · crowd {window.metrics.crowdIndex.toFixed(0)}
                </span>
                <span className="badge badge--neutral">
                    Snow {Math.round(window.metrics.snowReliabilityBase * 100)}% base ·{' '}
                    {Math.round(window.metrics.snowReliabilityTop * 100)}% top
                </span>
                <span className="badge badge--neutral">
                    {priceTierLabel(window.metrics.priceTier)}
                    {priceIndicative ? ' (indicative)' : ''}
                </span>
            </div>

            {window.exclusions.length > 0 && (
                <ul className="lcw-card__exclusions">
                    {window.exclusions.map((exclusion) => (
                        <li key={exclusion.code + exclusion.detail}>
                            <span className="badge badge--danger">{exclusion.code.replace(/_/g, ' ')}</span>
                            <span>{exclusion.detail}</span>
                        </li>
                    ))}
                </ul>
            )}

            <button type="button" className="lcw-card__toggle" onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide breakdown' : 'Show breakdown'}
            </button>

            {open && (
                <div className="lcw-card__detail">
                    <div className="lcw-card__bars">
                        <ComponentBar label="Emptiness" value={window.components.crowdScore} />
                        <ComponentBar
                            label="Price"
                            value={window.components.priceScore}
                            muted={window.components.priceScore == null}
                        />
                        <ComponentBar label="Snow" value={window.components.snowScore} />
                        <ComponentBar label="Personal fit" value={window.components.flexScore} />
                    </div>

                    {overlaps.length > 0 && (
                        <div className="lcw-card__overlaps">
                            <h4>School holidays overlapping this week</h4>
                            <ul>
                                {overlaps.map((overlap) => (
                                    <li key={overlap.authority}>
                                        <strong>{overlap.displayName}</strong>
                                        <span>
                                            {overlap.cause ? `${overlap.cause} · ` : ''}
                                            {Math.round(overlap.overlap * 100)}% of the week · resort weight{' '}
                                            {overlap.demandWeight.toFixed(2)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {window.explain.length > 0 && (
                        <div className="lcw-card__factors">
                            <h4>How the score adds up</h4>
                            <ul>
                                {window.explain.map((factor) => (
                                    <li key={factor.label}>
                                        <span>{factor.label}</span>
                                        <strong>
                                            {factor.delta >= 0 ? '+' : ''}
                                            {factor.delta.toFixed(1)}
                                        </strong>
                                        {isSoft(factor.confidence) && (
                                            <em className="lcw-soft">{confidenceLabel(factor.confidence)}</em>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
};

/**
 * Ranked low-crowd ski weeks.
 *
 * <p>Two presentation rules the backend contract depends on: ineligible weeks are
 * shown with their reason rather than hidden, and anything the backend marks as
 * inferred is labelled as such. Several inputs here are genuinely uncertain —
 * resort season dates, discretionary school closures — and a clean ranking that
 * hides that would be more confident than the data supports.
 */
const LowCrowdWindows: React.FC<Props> = ({
    resort = 'la-clusaz',
    from,
    to,
    homeCalendar = 'IE-NATIONAL',
    highlightWeekStart,
    onResortChange,
}) => {
    const [preset, setPreset] = useState<WindowPreset>('balanced');
    const [policy, setPolicy] = useState<TravellerPolicy>('AVOID_SCHOOL_HOLIDAY');
    const [data, setData] = useState<LowCrowdWindowResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** Set when the resort exists in the catalogue but has no planning profile. */
    const [unconfigured, setUnconfigured] = useState<ResortMatch | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { windows } = await getLowCrowdWindows({
                resort,
                from,
                to,
                homeCalendar,
                policy,
                preset,
                includeIneligible: true,
            });
            setData(windows);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load candidate weeks.';
            // The backend answers an unset-up resort with 404 and a message naming
            // the ones it does know. That is a normal state here, not a failure —
            // almost no resort in the catalogue has a profile — so it gets its own
            // explanation rather than a red error box.
            setError(/No planning profile|404/.test(message) ? null : message);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [resort, from, to, homeCalendar, policy, preset]);

    useEffect(() => {
        if (unconfigured) {
            setLoading(false);
            return;
        }
        void load();
    }, [load, unconfigured]);

    const handleSelect = useCallback((match: ResortMatch) => {
        setUnconfigured(match.hasProfile ? null : match);
        if (match.hasProfile) {
            onResortChange?.(match);
        }
    }, [onResortChange]);

    const ranked = useMemo(() => eligibleWindows(data), [data]);
    const excluded = useMemo(() => excludedWindows(data), [data]);
    const priceIndicative = priceIsIndicativeOnly(data);
    const changeoverDay = titleCase(data?.resort.changeoverDay ?? 'SATURDAY');

    return (
        <section className="lcw" aria-label="Low-crowd ski windows">
            <header className="lcw__head">
                <div className="lcw__heading">
                    <h1 className="lcw__title">
                        {unconfigured?.name ?? data?.resort.name ?? 'Low-crowd windows'}
                    </h1>
                    {unconfigured ? (
                        <p className="lcw__subtitle">
                            {[unconfigured.region, unconfigured.country].filter(Boolean).join(', ')}
                            {unconfigured.topAltM != null && ` · to ${unconfigured.topAltM} m`}
                        </p>
                    ) : (
                        <p className="lcw__subtitle">
                            Weeks run {changeoverDay} to {changeoverDay}, matching the resort&apos;s own changeover day.
                            {data?.resort.baseAltitudeM != null && (
                                <> Base {data.resort.baseAltitudeM} m · top {data.resort.topAltitudeM} m.</>
                            )}
                        </p>
                    )}
                </div>
                {onResortChange && (
                    <ResortSearchBox
                        value={unconfigured?.name ?? data?.resort.name}
                        onSelect={handleSelect}
                    />
                )}
            </header>

            <div className="lcw__controls" hidden={!!unconfigured}>
                <fieldset className="lcw__field">
                    <legend>What matters most</legend>
                    <div className="lcw__options">
                        {PRESETS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                title={option.blurb}
                                className={`lcw__option ${preset === option.id ? 'lcw__option--active' : ''}`.trim()}
                                onClick={() => setPreset(option.id)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="lcw__field">
                    <legend>Your own school calendar</legend>
                    <div className="lcw__options">
                        {POLICIES.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                title={option.blurb}
                                className={`lcw__option ${policy === option.id ? 'lcw__option--active' : ''}`.trim()}
                                onClick={() => setPolicy(option.id)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </fieldset>
            </div>

            {unconfigured && (
                <section className="lcw__unconfigured">
                    <h2>No planning data for {unconfigured.name} yet</h2>
                    <p>
                        It is in the ski catalogue
                        {[unconfigured.region, unconfigured.country].filter(Boolean).length > 0 && (
                            <> — {[unconfigured.region, unconfigured.country].filter(Boolean).join(', ')}</>
                        )}
                        {unconfigured.topAltM != null && <>, topping out at {unconfigured.topAltM} m</>}
                        {' '}— but ranking its weeks needs three things this resort does not have yet: a season,
                        a changeover day, and the school calendars that actually drive its lift queues.
                    </p>
                    <p className="lcw__unconfigured-note">
                        Those weights are per-resort on purpose. Irish school holidays barely move a French
                        alpine resort but dominate a Pyrenean one, so copying La Clusaz&apos;s numbers across
                        would produce a confident ranking that is simply wrong.
                    </p>
                    <button type="button" className="lcw__unconfigured-back" onClick={() => setUnconfigured(null)}>
                        ← Back to {data?.resort.name ?? 'the current resort'}
                    </button>
                </section>
            )}

            {!unconfigured && loading && <p className="lcw__status">Scoring candidate weeks…</p>}
            {!unconfigured && error && <p className="lcw__status lcw__status--error">{error}</p>}

            {!unconfigured && !loading && !error && data && (
                <>
                    {data.warnings.length > 0 && (
                        <ul className="lcw__warnings">
                            {data.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    )}

                    <div className="lcw__list">
                        {ranked.map((window) => (
                            <WindowCard
                                key={window.start}
                                window={window}
                                priceIndicative={priceIndicative}
                                chosen={window.start === highlightWeekStart}
                            />
                        ))}
                        {ranked.length === 0 && (
                            <p className="lcw__status">
                                No week in this range is available under the selected policy.
                            </p>
                        )}
                    </div>

                    {excluded.length > 0 && (
                        <details className="lcw__excluded">
                            <summary>{plural(excluded.length, 'week')} ruled out — and why</summary>
                            <div className="lcw__list">
                                {excluded.map((window) => (
                                    <WindowCard
                                        key={window.start}
                                        window={window}
                                        priceIndicative={priceIndicative}
                                    />
                                ))}
                            </div>
                        </details>
                    )}

                    <footer className="lcw__coverage">
                        <h4>Calendars used</h4>
                        <ul>
                            {data.calendarCoverage.map((coverage) => (
                                <li key={coverage.authority}>
                                    <strong>{coverage.displayName}</strong>
                                    <span>
                                        {plural(coverage.periodCount, 'period')} ·{' '}
                                        <em className={isSoft(coverage.confidence) ? 'lcw-soft' : undefined}>
                                            {confidenceLabel(coverage.confidence)}
                                        </em>
                                        {coverage.sourceDataset ? ` · ${coverage.sourceDataset}` : ''}
                                    </span>
                                    {coverage.note && <span className="lcw__note">{coverage.note}</span>}
                                </li>
                            ))}
                        </ul>
                    </footer>
                </>
            )}
        </section>
    );
};

export default LowCrowdWindows;
