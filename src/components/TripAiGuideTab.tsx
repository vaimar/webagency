import React from 'react';
import { AiTripGuide } from '../services/aiTripGuide';

export type AiGuideStatus = 'idle' | 'loading' | 'done' | 'error';

interface TripAiGuideTabProps {
    status: AiGuideStatus;
    guide: AiTripGuide | null;
    onRetry: () => void;
}

const TripAiGuideTab: React.FC<TripAiGuideTabProps> = ({ status, guide, onRetry }) => {
    const neighborhoods = guide?.neighborhoods ?? [];
    const activityTips = guide?.activityTips ?? [];
    const restaurantPicks = guide?.restaurantPicks ?? [];
    const localTips = guide?.localTips ?? [];
    const dayPlan = guide?.dayPlan ?? [];
    const generated = Boolean(guide?.generated);

    return (
        <article className="trip-explore-dashboard__card">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">AI concierge</p>
                    <h3 className="trip-explore-dashboard__card-title">Trip guide</h3>
                </div>
                {status === 'done' && generated && guide?.provider && (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {guide.provider}{guide.cached ? ' · cached' : ''}
                    </span>
                )}
            </div>

            {status === 'loading' && (
                <div className="trip-explore-dashboard__ai-loading" role="status" aria-live="polite">
                    <span className="trip-explore-dashboard__ai-spinner" />
                    <p className="trip-explore-dashboard__muted">Writing your personalized guide…</p>
                </div>
            )}

            {status === 'error' && (
                <div className="trip-explore-dashboard__alert-block">
                    <span className="trip-explore-dashboard__alert-label">AI guide unavailable</span>
                    <p>Could not reach the AI concierge. Your flights, stays, activities and restaurants are unaffected.</p>
                    <button type="button" className="trip-explore-dashboard__chip" onClick={onRetry}>
                        Try again
                    </button>
                </div>
            )}

            {status === 'done' && guide && (
                <>
                    {guide.summary && (
                        <p className={generated ? 'trip-explore-dashboard__ai-summary' : 'trip-explore-dashboard__muted'}>
                            {guide.summary}
                        </p>
                    )}

                    {/* Degraded (AI unavailable/unparseable): offer a retry, hide empty sections. */}
                    {!generated && (
                        <button type="button" className="trip-explore-dashboard__chip" onClick={onRetry}>
                            Try again
                        </button>
                    )}

                    {neighborhoods.length > 0 && (
                        <section className="trip-explore-dashboard__ai-section">
                            <span className="trip-explore-dashboard__meta-label">Where to base yourself</span>
                            <div className="trip-explore-dashboard__stays-grid">
                                {neighborhoods.map((n, i) => (
                                    <div key={`${n.name}-${i}`} className="trip-explore-dashboard__hotel-card">
                                        <h4 className="trip-explore-dashboard__hotel-name">{n.name}</h4>
                                        {n.vibe && <p className="trip-explore-dashboard__muted">{n.vibe}</p>}
                                        {n.bestFor && (
                                            <div className="trip-explore-dashboard__reason-pill">Best for {n.bestFor}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {activityTips.length > 0 && (
                        <section className="trip-explore-dashboard__ai-section">
                            <span className="trip-explore-dashboard__meta-label">On the water / snow</span>
                            <ul className="trip-explore-dashboard__ai-list">
                                {activityTips.map((tip, i) => <li key={i}>{tip}</li>)}
                            </ul>
                        </section>
                    )}

                    {restaurantPicks.length > 0 && (
                        <section className="trip-explore-dashboard__ai-section">
                            <span className="trip-explore-dashboard__meta-label">AI restaurant picks</span>
                            <div className="trip-explore-dashboard__stays-grid">
                                {restaurantPicks.map((r, i) => (
                                    <div key={`${r.name}-${i}`} className="trip-explore-dashboard__hotel-card">
                                        <div className="trip-explore-dashboard__hotel-main">
                                            <div>
                                                <h4 className="trip-explore-dashboard__hotel-name">{r.name}</h4>
                                                {r.cuisine && (
                                                    <div className="trip-explore-dashboard__hotel-meta">
                                                        <span className="trip-explore-dashboard__hotel-rating">{r.cuisine}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {r.note && <div className="trip-explore-dashboard__reason-pill">{r.note}</div>}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {dayPlan.length > 0 && (
                        <section className="trip-explore-dashboard__ai-section">
                            <span className="trip-explore-dashboard__meta-label">Day by day</span>
                            <div className="trip-explore-dashboard__timeline">
                                {dayPlan.map((d, i) => (
                                    <div key={i} className="trip-explore-dashboard__timeline-item">
                                        <span className="trip-explore-dashboard__timeline-dot" />
                                        <div>
                                            <span className="trip-explore-dashboard__meta-label">
                                                Day {d.day ?? i + 1}{d.title ? ` · ${d.title}` : ''}
                                            </span>
                                            {d.plan && <strong>{d.plan}</strong>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {localTips.length > 0 && (
                        <section className="trip-explore-dashboard__ai-section">
                            <span className="trip-explore-dashboard__meta-label">Local tips</span>
                            <ul className="trip-explore-dashboard__ai-list">
                                {localTips.map((tip, i) => <li key={i}>{tip}</li>)}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </article>
    );
};

export default TripAiGuideTab;
