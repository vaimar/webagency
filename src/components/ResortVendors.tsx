import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ResortOfferingsResponse, ResortVendor, VendorOffering, getResortOfferings } from '../services/api';
import {
    categoryLabel,
    compulsoryExtras,
    dietaryLabel,
    eateries,
    estimatedDinnerFor,
    formatEuros,
    formatPrices,
    groupByCategory,
    hireShops,
    isUnorderable,
    kindLabel,
    liftOperators,
    liftPassCostFor,
    activityVendors,
    mainsRange,
} from '../services/resortOfferings';
import './ResortVendors.css';

interface Props {
    resort: string;
    /** Party size drives both the filter and the estimated-cost figures. */
    partySize?: number;
}

/** A lift company does not have a menu, and a hire shop does not have one either. */
const listNoun = (vendor: ResortVendor): string => {
    switch (vendor.kind) {
        case 'LIFT_OPERATOR':
            return 'tariff';
        case 'RENTAL':
            return 'rates';
        default:
            return 'menu';
    }
};

const OfferingRow: React.FC<{ offering: VendorOffering; partySize: number }> = ({ offering, partySize }) => {
    const unorderable = isUnorderable(offering, partySize);
    return (
        <li className={`rv-item ${unorderable ? 'rv-item--unorderable' : ''}`.trim()}>
            <div className="rv-item__head">
                <span className="rv-item__name">{offering.name}</span>
                <span className="rv-item__price">{formatPrices(offering.prices)}</span>
            </div>
            {offering.description && <p className="rv-item__desc">{offering.description}</p>}
            {(offering.dietaryFlags?.length || offering.conditions) && (
                <div className="rv-item__meta">
                    {offering.dietaryFlags?.map((flag) => (
                        <span key={flag} className="badge badge--success">{dietaryLabel(flag)}</span>
                    ))}
                    {offering.conditions && <span className="rv-item__conditions">{offering.conditions}</span>}
                </div>
            )}
            {offering.choices && offering.choices.length > 0 && (
                <ul className="rv-item__choices">
                    {Object.entries(
                        offering.choices.reduce<Record<string, string[]>>((acc, choice) => {
                            (acc[choice.group] ??= []).push(choice.label);
                            return acc;
                        }, {}),
                    ).map(([group, labels]) => (
                        <li key={group}>
                            <strong>{group === 'PLAT' ? 'Main' : group === 'DESSERT' ? 'Dessert' : group}:</strong>{' '}
                            {labels.join(' · ')}
                        </li>
                    ))}
                </ul>
            )}
            {unorderable && (
                <p className="rv-item__blocked">
                    Needs more people than your party — {formatPrices(offering.prices)}.
                </p>
            )}
        </li>
    );
};

const VendorCard: React.FC<{ vendor: ResortVendor; partySize: number }> = ({ vendor, partySize }) => {
    const [open, setOpen] = useState(false);
    const groups = useMemo(() => groupByCategory(vendor), [vendor]);
    const range = mainsRange(vendor);
    const dinner = estimatedDinnerFor(vendor, partySize);

    return (
        <article className="rv-card">
            <header className="rv-card__head">
                <div>
                    <strong className="rv-card__name">{vendor.name}</strong>
                    <span className="rv-card__type">{vendor.sourceType ?? kindLabel(vendor.kind)}</span>
                </div>
                <div className="rv-card__summary">
                    {range && <span className="rv-card__range">{formatEuros(range.from)}–{formatEuros(range.to)}</span>}
                    {dinner != null && vendor.kind !== 'RENTAL' && (
                        <span className="rv-card__party">
                            ≈{formatEuros(dinner)} for {partySize}
                        </span>
                    )}
                </div>
            </header>

            <button type="button" className="rv-card__toggle" onClick={() => setOpen((v) => !v)}>
                {open ? `Hide ${listNoun(vendor)}` : `Show ${listNoun(vendor)} (${vendor.offerings.length} items)`}
            </button>

            {open && (
                <div className="rv-card__body">
                    {groups.map((group) => (
                        <section key={group.category} className="rv-group">
                            <h4 className="rv-group__title">{categoryLabel(group.category)}</h4>
                            <ul className="rv-group__list">
                                {group.offerings.map((offering) => (
                                    <OfferingRow key={offering.slug} offering={offering} partySize={partySize} />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </article>
    );
};

/**
 * A resort's eating and hire options.
 *
 * <p>Prices always render with their basis, and anything the party is too small
 * to order is shown greyed with the reason rather than silently dropped — a
 * two-person fondue vanishing from a solo diner's list reads as "they don't
 * serve fondue".
 */
const ResortVendors: React.FC<Props> = ({ resort, partySize = 2 }) => {
    const [data, setData] = useState<ResortOfferingsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [party, setParty] = useState(partySize);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { offerings } = await getResortOfferings({ resort });
            setData(offerings);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load the resort catalogue.');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [resort]);

    useEffect(() => {
        void load();
    }, [load]);

    const food = useMemo(() => eateries(data), [data]);
    const hire = useMemo(() => hireShops(data), [data]);
    const lifts = useMemo(() => liftOperators(data), [data]);
    const things = useMemo(() => activityVendors(data), [data]);

    if (loading) return <p className="rv__status">Loading the resort catalogue…</p>;
    if (error) return <p className="rv__status rv__status--error">{error}</p>;
    if (!data || data.vendors.length === 0) {
        return <p className="rv__status">No menu or hire data has been ingested for this resort yet.</p>;
    }

    return (
        <section className="rv" aria-label="Resort eating and hire">
            <div className="rv__controls">
                <label htmlFor="rv-party">Party size</label>
                <input
                    id="rv-party"
                    type="number"
                    min={1}
                    max={12}
                    value={party}
                    onChange={(e) => setParty(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                />
                <span className="rv__controls-note">
                    Sets the per-person maths and flags anything your party is too small to order.
                </span>
            </div>

            {data.warnings.length > 0 && (
                <ul className="rv__warnings">
                    {data.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            )}

            {lifts.map((operator) => {
                const sixDay = liftPassCostFor(operator, party, 6);
                const extras = compulsoryExtras(operator);
                const skicard = extras.find((e) => /skicard/i.test(e.name));
                const skicardTotal = skicard ? (skicard.prices[0]?.amount ?? 0) * party : 0;
                return (
                    <section key={operator.slug} className="rv-lift">
                        <h3 className="rv__section-title">
                            Lift pass{operator.seasonLabel ? ` — ${operator.seasonLabel} grid` : ''}
                        </h3>
                        {sixDay && (
                            <p className="rv-lift__headline">
                                {/* All-in, matching the summary above. Two different
                                    headline numbers for the same purchase reads as a bug. */}
                                <strong>{formatEuros(sixDay.total + skicardTotal)}</strong> for {party}
                                {party === 1 ? ' adult' : ' adults'}, 6 days
                                <span className="rv-lift__detail">
                                    {' '}— {formatEuros(sixDay.perPerson)} each, {sixDay.label}
                                    {extras.length > 0 && (
                                        <>
                                            {'. Plus '}
                                            {extras
                                                .map((e) => `${e.name} ${formatPrices(e.prices)}`)
                                                .join(', ')}
                                        </>
                                    )}
                                </span>
                            </p>
                        )}
                        <div className="rv__list">
                            <VendorCard vendor={operator} partySize={party} />
                        </div>
                    </section>
                );
            })}

            {things.length > 0 && (
                <>
                    <h3 className="rv__section-title">Lessons &amp; activities — {things.length}</h3>
                    <div className="rv__list">
                        {things.map((vendor) => (
                            <VendorCard key={vendor.slug} vendor={vendor} partySize={party} />
                        ))}
                    </div>
                </>
            )}

            {food.length > 0 && (
                <>
                    <h3 className="rv__section-title">Eating — {food.length} places</h3>
                    <div className="rv__list">
                        {food.map((vendor) => (
                            <VendorCard key={vendor.slug} vendor={vendor} partySize={party} />
                        ))}
                    </div>
                </>
            )}

            {hire.length > 0 && (
                <>
                    <h3 className="rv__section-title">Hire</h3>
                    <div className="rv__list">
                        {hire.map((vendor) => (
                            <VendorCard key={vendor.slug} vendor={vendor} partySize={party} />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
};

export default ResortVendors;
