import React from 'react';
import { AntiCauchemarAnalysis } from '../services/api';
import './TruthCard.css';

interface TruthCardProps {
    truth?: AntiCauchemarAnalysis | null;
    className?: string;
}

const formatEuro = (value?: number, currency: string = 'EUR'): string | null => {
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

const TruthCard: React.FC<TruthCardProps> = ({ truth, className }) => {
    if (!truth) return null;

    const currency = truth.currency ?? 'EUR';
    const realWorldEntryPrice = truth.realWorldEntryPrice ?? truth.realCost;
    const realWorldPriceLabel = formatEuro(realWorldEntryPrice, currency);
    const hiddenPenaltyLabel = formatEuro(truth.hiddenCostPenalty, currency);
    const shouldHighlightCatch = typeof truth.hiddenCostPenalty === 'number' && truth.hiddenCostPenalty > 15 && Boolean(truth.theCatch);
    const hasContent = Boolean(realWorldPriceLabel || truth.logisticVerdict || truth.theCatch || hiddenPenaltyLabel);

    if (!hasContent) return null;

    return (
        <section className={`truth-card ${className ?? ''}`.trim()} aria-label="Truth card">
            <div className="truth-card__header">
                <span className="truth-card__eyebrow">Anti-Cauchemar</span>
                {hiddenPenaltyLabel && <span className="truth-card__penalty">Hidden cost: {hiddenPenaltyLabel}</span>}
            </div>

            {realWorldPriceLabel && (
                <div className="truth-card__price-row">
                    <span className="truth-card__label">Real-world entry price</span>
                    <strong className="truth-card__price">{realWorldPriceLabel}</strong>
                </div>
            )}

            {shouldHighlightCatch && (
                <div className="truth-card__warning" role="note" aria-live="polite">
                    <span className="truth-card__warning-label">The Catch</span>
                    <p>{truth.theCatch}</p>
                </div>
            )}

            {!shouldHighlightCatch && truth.theCatch && (
                <div className="truth-card__fact truth-card__fact--catch">
                    <span className="truth-card__label">The Catch</span>
                    <p>{truth.theCatch}</p>
                </div>
            )}

            {truth.logisticVerdict && (
                <div className="truth-card__fact truth-card__fact--verdict">
                    <span className="truth-card__label">Logistic verdict</span>
                    <p>{truth.logisticVerdict}</p>
                </div>
            )}
        </section>
    );
};

export default TruthCard;

