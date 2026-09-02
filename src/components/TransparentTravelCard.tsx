import React from 'react';
import './TransparentTravelCard.css';

export interface PotentialFee {
    id: string;
    label: string;
    amount?: number;
    description?: string;
    frequency?: 'common' | 'sometimes' | 'rare';
}

export interface BookingLink {
    id: string;
    label: string;
    href: string;
}

interface TransparentTravelCardProps {
    routeLabel: string;
    callPrice: number;
    estimatedRealPrice: number;
    currency?: string;
    hiddenFees: PotentialFee[];
    bookingLinks?: BookingLink[];
    estimateNote?: string;
    verificationLabel?: string;
}

const formatMoney = (amount: number, currency: string): string => {
    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
};

const feeFrequencyLabel: Record<NonNullable<PotentialFee['frequency']>, string> = {
    common: 'Frequent',
    sometimes: 'Occasional',
    rare: 'Rare',
};

const TransparentTravelCard: React.FC<TransparentTravelCardProps> = ({
    routeLabel,
    callPrice,
    estimatedRealPrice,
    currency = 'EUR',
    hiddenFees,
    bookingLinks = [],
    estimateNote = 'Estimated from the previous 24 hours',
    verificationLabel = 'Anti-Nightmare approach: pricing explained before redirect',
}) => {
    const hasDelta = estimatedRealPrice > callPrice;
    const delta = Math.max(0, estimatedRealPrice - callPrice);

    return (
        <article className="transparent-travel-card" aria-label={`Transparent pricing card for ${routeLabel}`}>
            <header className="transparent-travel-card__header">
                <div>
                    <p className="transparent-travel-card__badge">Anti-Nightmare</p>
                    <h3 className="transparent-travel-card__route">{routeLabel}</h3>
                </div>
                <span className="transparent-travel-card__trust">{verificationLabel}</span>
            </header>

            <section className="transparent-travel-card__price-block" aria-live="polite">
                <p className="transparent-travel-card__label">Headline price</p>
                <p className="transparent-travel-card__price">{formatMoney(callPrice, currency)}</p>

                <div className="transparent-travel-card__subtotal">
                    <span>Estimated real price</span>
                    <strong>{formatMoney(estimatedRealPrice, currency)}</strong>
                </div>

                {hasDelta && (
                    <p className="transparent-travel-card__delta">
                        +{formatMoney(delta, currency)} potential extras (bag, transfer, local taxes)
                    </p>
                )}
                <p className="transparent-travel-card__note">{estimateNote}</p>
            </section>

            <details className="transparent-travel-card__details">
                <summary>Why this price?</summary>
                {/* eslint-disable-next-line jsx-a11y/no-redundant-roles --
                    not redundant in practice: this list is styled
                    `list-style: none` (TransparentTravelCard.css), and Safari
                    strips list semantics from such lists in VoiceOver. The
                    explicit role is what keeps "list, 3 items" being announced. */}
                <ul className="transparent-travel-card__fees" role="list">
                    {hiddenFees.map((fee) => (
                        <li key={fee.id} className="transparent-travel-card__fee-row">
                            <div>
                                <p className="transparent-travel-card__fee-title">{fee.label}</p>
                                {fee.description && <p className="transparent-travel-card__fee-description">{fee.description}</p>}
                            </div>
                            <div className="transparent-travel-card__fee-meta">
                                {fee.frequency && <span className="transparent-travel-card__frequency">{feeFrequencyLabel[fee.frequency]}</span>}
                                {typeof fee.amount === 'number' && <strong>{formatMoney(fee.amount, currency)}</strong>}
                            </div>
                        </li>
                    ))}
                </ul>
            </details>

            {bookingLinks.length > 0 && (
                <footer className="transparent-travel-card__actions">
                    {bookingLinks.map((link) => (
                        <a
                            key={link.id}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transparent-travel-card__action-link"
                        >
                            {link.label}
                        </a>
                    ))}
                </footer>
            )}
        </article>
    );
};

export default TransparentTravelCard;

