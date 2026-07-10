import React from 'react';
import {
    formatCurrency,
    getFirstMileDrive,
    getTripVerdict,
    VerdictTargetTab,
} from '../services/tripExploreSelectors';
import { SelfConnectResult } from '../services/selfConnect';
import { HotelResult, TripExplorationResponse, UnifiedFlightOption } from '../types/tripExploration';
import { SelfConnectStatus } from './TripSelfConnectTab';

const CTA_LABELS: Record<VerdictTargetTab, string> = {
    flights: 'See flights →',
    selfConnect: 'See routing →',
    stays: 'See stays →',
};

interface TripVerdictCardProps {
    trip: TripExplorationResponse;
    /** Flight the user picked in the flights tab; falls back to the backend's best. */
    selectedFlight?: UnifiedFlightOption | null;
    nights?: number;
    driveMode?: boolean;
    /** Direct hotel-search fallback stays — lead-stay source when no hidden gems. */
    extraStays?: HotelResult[];
    /** Self-transfer routing result once loaded — feeds the savings list. */
    selfConnect: SelfConnectResult | null;
    selfConnectStatus: SelfConnectStatus;
    /** Jump to the tab holding the receipts behind a saving. */
    onJumpToTab: (tab: VerdictTargetTab) => void;
    /** Kick off the self-transfer check without leaving the current tab. */
    onCheckSelfTransfer: () => void;
}

// The first thing on screen after a search: the honest answer ("this trip
// really costs €X"), the euros the engine saved vs the obvious route, and the
// catches behind the teaser fare. Every row links to the tab with the receipts.
const TripVerdictCard: React.FC<TripVerdictCardProps> = ({
    trip,
    selectedFlight = null,
    nights,
    driveMode,
    extraStays = [],
    selfConnect,
    selfConnectStatus,
    onJumpToTab,
    onCheckSelfTransfer,
}) => {
    const flight = selectedFlight ?? trip.bestUnifiedFlight ?? null;
    const drive = getFirstMileDrive(trip, flight, nights, driveMode);
    const { cost, savings, catches } = getTripVerdict(trip, {
        selectedFlight,
        nights,
        driveEur: drive?.totalEur,
        selfConnect,
        extraStays,
    });

    const biggestSaving = savings[0];
    const hasSelfTransferSaving = savings.some((saving) => saving.kind === 'selfTransfer');
    const canCheckSelfTransfer = Boolean(trip.originAirport && trip.resolvedArrivalAirport);

    return (
        <article className="trip-explore-dashboard__card trip-explore-dashboard__verdict" aria-label="Trip verdict">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">The verdict</p>
                    <h3 className="trip-explore-dashboard__verdict-total">
                        {cost.partial ? 'At least ' : ''}
                        {formatCurrency(cost.total, cost.currency)}
                        <span className="trip-explore-dashboard__package-caption">
                            {' '}door-to-door · {cost.nights} nights, 1 traveller
                        </span>
                    </h3>
                    <p className="trip-explore-dashboard__verdict-line">
                        {cost.partial
                            ? 'Some parts are still unpriced, so this total is a floor — not the full bill.'
                            : 'Flight, stay, food and local transport counted — what you would actually spend, not the teaser fare.'}
                    </p>
                </div>
                {biggestSaving && (
                    <span className="trip-explore-dashboard__verdict-chip">
                        Save {formatCurrency(biggestSaving.amount, biggestSaving.currency)}
                    </span>
                )}
            </div>

            <div className="trip-explore-dashboard__verdict-rows">
                {savings.map((saving) => (
                    <div
                        key={saving.kind}
                        className="trip-explore-dashboard__verdict-row trip-explore-dashboard__verdict-row--save"
                    >
                        <div>
                            <strong>{saving.title}</strong>
                            {saving.detail && <p>{saving.detail}</p>}
                        </div>
                        <button
                            type="button"
                            className="trip-explore-dashboard__verdict-cta"
                            onClick={() => onJumpToTab(saving.targetTab)}
                        >
                            {CTA_LABELS[saving.targetTab]}
                        </button>
                    </div>
                ))}

                {catches.map((item) => (
                    <div
                        key={item.kind}
                        className="trip-explore-dashboard__verdict-row trip-explore-dashboard__verdict-row--catch"
                    >
                        <div>
                            <strong>The catch</strong>
                            <p>{item.text}</p>
                        </div>
                    </div>
                ))}

                {!hasSelfTransferSaving && canCheckSelfTransfer && (
                    <div className="trip-explore-dashboard__verdict-row trip-explore-dashboard__verdict-row--neutral">
                        {selfConnectStatus === 'idle' && (
                            <>
                                <div>
                                    <strong>🔀 Could a DIY self-transfer beat this fare?</strong>
                                    <p>Two separate tickets via a cheap hub sometimes cost half the direct price.</p>
                                </div>
                                <button
                                    type="button"
                                    className="trip-explore-dashboard__verdict-cta"
                                    onClick={onCheckSelfTransfer}
                                >
                                    Check routing
                                </button>
                            </>
                        )}
                        {selfConnectStatus === 'loading' && (
                            <div>
                                <strong>🔀 Checking self-transfer routes…</strong>
                                <p>Scanning hub connections across the route network.</p>
                            </div>
                        )}
                        {selfConnectStatus === 'done' && (
                            <div>
                                <strong>🔀 Self-transfer checked</strong>
                                <p>The direct route already wins here — no cheaper 2-leg routing found.</p>
                            </div>
                        )}
                        {selfConnectStatus === 'error' && (
                            <>
                                <div>
                                    <strong>🔀 Self-transfer check failed</strong>
                                    <p>The routing service did not answer.</p>
                                </div>
                                <button
                                    type="button"
                                    className="trip-explore-dashboard__verdict-cta"
                                    onClick={onCheckSelfTransfer}
                                >
                                    Retry
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
};

export default TripVerdictCard;
