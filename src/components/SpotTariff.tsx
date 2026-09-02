import React from 'react';
import './SpotTariff.css';

/**
 * A park's tariff, as a tariff — not as prose in a description and not as three
 * pills that lose every condition attached to the number.
 *
 * <p>The panel exists because the prices genuinely are not comparable to each
 * other. Crans-Montana's 25 CHF buys twelve minutes with a helmet but no board;
 * Delta's 90 EUR buys an hour for however many people turn up; I-Wakepark's 95 EUR
 * buys an hour split between four. Printing those as "from 25" would be a lie in
 * all three directions, so each row keeps what it buys, who it covers and whether
 * gear is in it, and the per-rider figure is shown only where it can be derived.
 */

export interface PriceLine {
    kind: string;
    amount: number;
    currency: string;
    durationMinutes: number | null;
    perPerson: boolean | null;
    partySizeMin: number | null;
    partySizeMax: number | null;
    includesGear: boolean | null;
    tier: string;
    label: string | null;
    notes: string | null;
    confidence: string;
    perRiderAmount: number | null;
    sourceUrl: string | null;
    observedAt: string | null;
}

/**
 * Groups in the order a rider decides in: what one go costs, then what an hour with
 * mates costs, then the commitments. Gear last because it is a supplement to a row
 * above it, never a reason to come.
 */
const GROUPS: { title: string; kinds: string[]; hint?: string }[] = [
    { title: 'Riding time', kinds: ['SESSION', 'HOUR', 'HALF_DAY', 'DAY'] },
    {
        // High on the panel, not filed with the optional extras: at Dock 5 the band
        // is a quarter again on top of a first hour, and you cannot decline it.
        title: 'Before you can ride',
        kinds: ['ACCESS_BAND'],
        hint: 'Compulsory, paid once.',
    },
    { title: 'Coaching', kinds: ['COACHING'] },
    {
        title: 'The whole line to yourselves',
        kinds: ['GROUP_HIRE'],
        hint: 'One flat price for the party, not per rider.',
    },
    { title: 'Passes and packs', kinds: ['PACK', 'MEMBERSHIP'] },
    { title: 'Gear', kinds: ['GEAR_RENTAL'], hint: 'On top of a session price above.' },
];

const KIND_FALLBACK: Record<string, string> = {
    SESSION: 'Session',
    HOUR: '1 hour',
    HALF_DAY: 'Half day',
    DAY: 'Day pass',
    GROUP_HIRE: 'Private hire',
    PACK: 'Multi-session card',
    MEMBERSHIP: 'Season pass',
    COACHING: 'Coached session',
    GEAR_RENTAL: 'Gear hire',
    ACCESS_BAND: 'Access wristband',
};

const TIER_LABEL: Record<string, string> = {
    REDUCED: 'reduced',
    CHILD: 'child',
    STUDENT: 'student',
    MEMBER: 'members',
    OFF_PEAK: 'off-peak',
    PEAK: 'peak',
};

const money = (amount: number, currency: string): string => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    // Whole units for headline prices; cents only when the number is a derived
    // division that would otherwise round two different products to the same figure.
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
}).format(amount);

/** "45 min", "2 h", "1 h 30" — never "1.5 h", which no park has ever printed. */
const duration = (minutes: number | null): string | null => {
    if (minutes == null) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
};

/** "up to 5", "3–4", "2–5" — whatever the park actually committed to. */
const party = (min: number | null, max: number | null): string | null => {
    if (min == null && max == null) return null;
    if (min != null && max != null) return min === max ? `${min} riders` : `${min}–${max} riders`;
    if (max != null) return `up to ${max} riders`;
    return `${min}+ riders`;
};

const observedLabel = (iso: string): string => new Date(iso).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'short', year: 'numeric',
});

const hostOf = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

const TariffRow: React.FC<{ price: PriceLine }> = ({ price }) => {
    const partyLabel = party(price.partySizeMin, price.partySizeMax);
    const durationLabel = duration(price.durationMinutes);
    const isGroup = price.perPerson === false;
    const isPack = price.kind === 'PACK';

    return (
        <li className="spot-tariff__row">
            <div className="spot-tariff__what">
                <span className="spot-tariff__label">
                    {price.label ?? KIND_FALLBACK[price.kind] ?? price.kind.toLowerCase()}
                </span>
                <span className="spot-tariff__tags">
                    {durationLabel && (
                        <span className="spot-tariff__tag">
                            {durationLabel}
                            {/* A pack's minutes are the water time across every session in
                                it. Left bare it reads as a two-hour pass, which is how the
                                prose version of this data used to be misread. */}
                            {isPack ? ' total' : ''}
                        </span>
                    )}
                    {partyLabel && <span className="spot-tariff__tag">{partyLabel}</span>}
                    {price.tier !== 'STANDARD' && (
                        <span className="spot-tariff__tag spot-tariff__tag--tier">
                            {TIER_LABEL[price.tier] ?? price.tier.toLowerCase()}
                        </span>
                    )}
                    {price.includesGear === true && (
                        <span className="spot-tariff__tag spot-tariff__tag--gear-in">gear included</span>
                    )}
                    {price.includesGear === false && (
                        <span className="spot-tariff__tag spot-tariff__tag--gear-out">gear extra</span>
                    )}
                </span>
                {price.notes && <p className="spot-tariff__note">{price.notes}</p>}
            </div>

            <div className="spot-tariff__cost">
                <span className="spot-tariff__amount">{money(price.amount, price.currency)}</span>
                {/* The number the schema exists to produce: a party rate divided down.
                    Shown only for group rates — repeating it on a per-person row would
                    imply a derivation that never happened. */}
                {isGroup && price.perRiderAmount != null && (
                    <span className="spot-tariff__each">
                        {money(price.perRiderAmount, price.currency)} each
                    </span>
                )}
                {isGroup && price.perRiderAmount == null && (
                    <span className="spot-tariff__each spot-tariff__each--unknown">
                        flat, any headcount
                    </span>
                )}
            </div>
        </li>
    );
};

const SpotTariff: React.FC<{ prices: PriceLine[] }> = ({ prices }) => {
    if (prices.length === 0) return null;

    const sourced = prices.find((p) => p.sourceUrl);
    const observed = prices.map((p) => p.observedAt).filter((d): d is string => !!d).sort().pop();

    return (
        <div className="sdp-section sdp-card spot-tariff">
            <h3 className="sdp-section__title">What it costs</h3>

            {GROUPS.map((group) => {
                const rows = prices.filter((p) => group.kinds.includes(p.kind));
                if (rows.length === 0) return null;
                return (
                    <div key={group.title} className="spot-tariff__group">
                        <h4 className="spot-tariff__group-title">
                            {group.title}
                            {group.hint && <span className="spot-tariff__group-hint">{group.hint}</span>}
                        </h4>
                        <ul className="spot-tariff__rows">
                            {rows.map((price, i) => (
                                <TariffRow key={`${price.kind}-${price.amount}-${price.tier}-${i}`} price={price} />
                            ))}
                        </ul>
                    </div>
                );
            })}

            {/* Provenance, because a price is only as good as the day it was read. */}
            {sourced?.sourceUrl && (
                <p className="spot-tariff__source">
                    Read off{' '}
                    <a href={sourced.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {hostOf(sourced.sourceUrl)} ↗
                    </a>
                    {observed && ` on ${observedLabel(observed)}`}
                    {' — theirs is the current one.'}
                </p>
            )}
        </div>
    );
};

export default SpotTariff;
