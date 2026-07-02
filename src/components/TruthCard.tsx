import React from 'react';
import { AntiCauchemarAnalysis, CostLine, PriceBreakdown } from '../services/api';
import { getAntiCauchemarPricingSummary } from '../services/antiCauchemarPricing';
import {
    estimateAirportTransfer,
    formatTransferLabel,
    getArrivalHour,
    type TransferEstimate,
} from '../services/transferEstimate';
import './TruthCard.css';

interface TruthCardProps {
    truth?: AntiCauchemarAnalysis | null;
    basePrice?: number | string;
    className?: string;
    /** IATA destination code — used to calculate transfer estimate when the backend returns 0 */
    destinationCode?: string;
    /** ISO datetime of the arrival — used for night-rate detection */
    arrivalTime?: string;
}

const formatEuro = (value?: number | null, currency: string = 'EUR'): string | null => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;

    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${Math.round(value)} ${currency}`;
    }
};

const STATUS_META: Record<string, { label: string; className: string }> = {
    EXACT: { label: '✓ exact', className: 'cost-line__badge--exact' },
    ESTIMATED: { label: '~ est.', className: 'cost-line__badge--estimated' },
    MANUAL_CHECK_REQUIRED: { label: '⚠ check', className: 'cost-line__badge--manual' },
    OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE: { label: 'ℹ local info', className: 'cost-line__badge--override' },
};

const CostLineRow: React.FC<{ label: string; line: CostLine }> = ({ label, line }) => {
    const meta = STATUS_META[line.status ?? ''] ?? { label: line.status ?? '', className: '' };
    const amountLabel = typeof line.amount === 'number' ? formatEuro(line.amount, line.currency ?? 'EUR') : null;

    return (
        <div className="cost-line">
            <span className="cost-line__label">{label}</span>
            <span className="cost-line__right">
                <span className={`cost-line__badge ${meta.className}`}>{meta.label}</span>
                <strong className="cost-line__amount">
                    {amountLabel ?? (line.status === 'MANUAL_CHECK_REQUIRED' ? '?' : '€0')}
                </strong>
            </span>
            {line.note && <span className="cost-line__note">{line.note}</span>}
        </div>
    );
};

const PriceBreakdownStack: React.FC<{ breakdown: PriceBreakdown; currency: string }> = ({ breakdown }) => (
    <div className="truth-card__breakdown-stack">
        {breakdown.baseFare && <CostLineRow label="Base fare" line={breakdown.baseFare} />}
        {((breakdown.shuttleFee && (breakdown.shuttleFee.amount ?? 0) > 0) || breakdown.shuttleFee?.status === 'MANUAL_CHECK_REQUIRED')
            ? breakdown.shuttleFee && <CostLineRow label="Airport transfer" line={breakdown.shuttleFee} />
            : null}
        {breakdown.baggageEstimate && (breakdown.baggageEstimate.amount ?? 0) > 0
            ? <CostLineRow label="Cabin bag" line={breakdown.baggageEstimate} />
            : null}
        {((breakdown.lateArrivalMarkup && (breakdown.lateArrivalMarkup.amount ?? 0) > 0) || breakdown.lateArrivalMarkup?.status === 'MANUAL_CHECK_REQUIRED')
            ? breakdown.lateArrivalMarkup && <CostLineRow label="Late arrival markup" line={breakdown.lateArrivalMarkup} />
            : null}
        {breakdown.firstMileLine && (
            <CostLineRow label="Home → airport (first mile)" line={breakdown.firstMileLine} />
        )}
    </div>
);

const TruthCard: React.FC<TruthCardProps> = ({ truth, basePrice, className, destinationCode, arrivalTime }) => {
    if (!truth) return null;

    const pricing = getAntiCauchemarPricingSummary(basePrice, truth);
    const flightFareLabel = formatEuro(pricing.ticketPrice ?? pricing.baseFare, pricing.currency);
    const shuttleLabel = (pricing.airportShuttleEstimate ?? 0) > 0 ? formatEuro(pricing.airportShuttleEstimate, pricing.currency) : null;
    const bagLabel = (pricing.cabinBagEstimate ?? 0) > 0 ? formatEuro(pricing.cabinBagEstimate, pricing.currency) : null;
    const estimatedEntryLabel = formatEuro(pricing.estimatedEntryPrice, pricing.currency);
    const doorToTripLabel = pricing.doorToTripPrice ? formatEuro(pricing.doorToTripPrice, pricing.currency) : null;
    const hasBreakdownItems = Boolean(shuttleLabel || bagLabel);
    const shouldHighlightCatch = pricing.hasOpaquePenalty && Boolean(truth.theCatch);
    const hasContent = Boolean(estimatedEntryLabel || truth.logisticVerdict || truth.theCatch || pricing.hasOpaquePenalty || pricing.hasManualCheckRequired);

    // Use structured priceBreakdown from backend when available
    const hasStructuredBreakdown = Boolean(truth.priceBreakdown);

    // Frontend transfer estimate: used when backend shuttle = 0 but we have coordinates
    const backendHasShuttle = (pricing.airportShuttleEstimate ?? 0) > 0;
    const arrivalHour = getArrivalHour(arrivalTime);
    const calculatedTransfer: TransferEstimate | null = (!backendHasShuttle && destinationCode)
        ? estimateAirportTransfer(destinationCode, arrivalHour)
        : null;

    if (!hasContent) return null;

    return (
        <section className={`truth-card ${className ?? ''}`.trim()} aria-label="Truth card">
            <div className="truth-card__header">
                <span className="truth-card__eyebrow">Travel warning</span>
                {pricing.hasOpaquePenalty && <span className="truth-card__penalty">Possible extra costs</span>}
                {pricing.hasManualCheckRequired && (
                    <span className="truth-card__penalty truth-card__penalty--manual">Manual check required</span>
                )}
            </div>

            {estimatedEntryLabel && (
                <div className="truth-card__price-row">
                    <span className="truth-card__label">
                        {pricing.auditedTotalCost ? 'Audited total cost' : 'Estimated entry price'}
                    </span>
                    <strong className="truth-card__price">{estimatedEntryLabel}</strong>
                </div>
            )}

            {doorToTripLabel && (
                <div className="truth-card__price-row truth-card__price-row--door-to-trip">
                    <span className="truth-card__label">Door-to-trip price</span>
                    <strong className="truth-card__price truth-card__price--door">{doorToTripLabel}</strong>
                </div>
            )}

            {/* Structured backend breakdown (preferred) */}
            {hasStructuredBreakdown && truth.priceBreakdown && (
                <div className="truth-card__fact truth-card__fact--verdict">
                    <span className="truth-card__label">Price breakdown</span>
                    <PriceBreakdownStack breakdown={truth.priceBreakdown} currency={pricing.currency} />
                </div>
            )}

            {/* Legacy flat breakdown — shown only when no structured breakdown available */}
            {!hasStructuredBreakdown && estimatedEntryLabel && hasBreakdownItems && (
                <div className="truth-card__fact truth-card__fact--verdict">
                    <span className="truth-card__label">Price breakdown</span>
                    <p>
                        {flightFareLabel && <>Flight fare {flightFareLabel}</>}
                        {shuttleLabel && <><br />Airport transfer {shuttleLabel}</>}
                        {bagLabel && <><br />Cabin bag {bagLabel}</>}
                    </p>
                </div>
            )}

            {calculatedTransfer && (
                <div className="truth-card__fact truth-card__transfer">
                    <span className="truth-card__label">
                        Taxi estimate · {calculatedTransfer.distanceKm} km straight-line
                        {calculatedTransfer.isNightRate && ' · night rate'}
                    </span>
                    <p className="truth-card__transfer-row">
                        <strong className="truth-card__transfer-fare">
                            {formatTransferLabel(calculatedTransfer)}
                        </strong>
                        {calculatedTransfer.publicTransport && (
                            <span className="truth-card__transfer-alt">
                                {' '}or {calculatedTransfer.publicTransport.mode} ~€{calculatedTransfer.publicTransport.costEur} ({calculatedTransfer.publicTransport.durationMins} min)
                            </span>
                        )}
                    </p>
                    <span className="truth-card__transfer-note">
                        Calculated from airport → city centre. Not added to the price — verify before booking.
                    </span>
                </div>
            )}

            {pricing.hasOpaquePenalty && !estimatedEntryLabel && (
                <div className="truth-card__fact truth-card__fact--catch">
                    <span className="truth-card__label">Possible extra costs</span>
                    <p>The app sees extra-friction risk on this route, but it does not yet know whether that is airport transfer, baggage, or another add-on. So it stays a warning, not a hard price increase.</p>
                </div>
            )}

            {shouldHighlightCatch && (
                <div className="truth-card__warning" role="note" aria-live="polite">
                    <span className="truth-card__warning-label">Travel warning</span>
                    <p>{truth.theCatch}</p>
                </div>
            )}

            {!shouldHighlightCatch && truth.theCatch && (
                <div className="truth-card__fact truth-card__fact--catch">
                    <span className="truth-card__label">Travel warning</span>
                    <p>{truth.theCatch}</p>
                </div>
            )}

            {truth.logisticVerdict && (
                <div className="truth-card__fact truth-card__fact--verdict">
                    <span className="truth-card__label">Airport reality</span>
                    <p>{truth.logisticVerdict}</p>
                </div>
            )}

            {truth.localAccessKnowledgeNote && (
                <div className="truth-card__fact truth-card__fact--local-access">
                    <span className="truth-card__label">Local access info</span>
                    <p>{truth.localAccessKnowledgeNote}</p>
                </div>
            )}
        </section>
    );
};

export default TruthCard;

