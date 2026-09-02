import React, { useCallback, useEffect, useState } from 'react';
import { ResortOfferingsResponse, getResortOfferings } from '../services/api';
import {
    activityVendors,
    compulsoryExtras,
    eateries,
    estimatedDinnerFor,
    formatEuros,
    liftOperators,
    liftPassCostFor,
    partyCost,
} from '../services/resortOfferings';
import './ResortCostSummary.css';

interface Props {
    resort: string;
    partySize: number;
    /** ISO date the trip starts. Shown so the figures are tied to a real week. */
    tripStart?: string;
    /** ISO date the trip ends, exclusive — the day you travel home. */
    tripEnd?: string;
    /** Sends the user to the tab holding the full breakdown. */
    onOpenDetail?: () => void;
}

const formatTripWeek = (start?: string, end?: string): string | null => {
    if (!start || !end) return null;
    const from = new Date(`${start}T00:00:00`);
    const to = new Date(`${end}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    // Built by hand rather than via toLocaleDateString with a month: en-IE
    // renders that as "Sat, 13 Mar", and one end of the range carrying a comma
    // the other lacks reads as a typo.
    const weekday = (d: Date): string => d.toLocaleDateString('en-IE', { weekday: 'short' });
    const month = (d: Date): string => d.toLocaleDateString('en-IE', { month: 'short' });
    const nights = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    const sameMonth = from.getMonth() === to.getMonth();
    const left = sameMonth
        ? `${weekday(from)} ${from.getDate()}`
        : `${weekday(from)} ${from.getDate()} ${month(from)}`;
    return `${left} – ${weekday(to)} ${to.getDate()} ${month(to)} ${to.getFullYear()} · ${nights} nights`;
};

/**
 * The week's headline costs, above the fold on every tab.
 *
 * <p>Exists because the numbers were previously one un-signposted click away, on
 * a tab called "Eating & hire" that promised menus rather than a trip budget. A
 * cost you have to go looking for is a cost you do not factor in.
 *
 * <p>Shows the gaps as first-class entries rather than omitting them. A summary
 * that lists lift and food and stops implies those are the whole bill; naming
 * hire, accommodation and flights as "not priced here" is the difference between
 * a budget and a misleading subtotal.
 */
const ResortCostSummary: React.FC<Props> = ({ resort, partySize, tripStart, tripEnd, onOpenDetail }) => {
    const [data, setData] = useState<ResortOfferingsResponse | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const { offerings } = await getResortOfferings({ resort });
            setData(offerings);
        } catch {
            // A missing catalogue is not an error worth shouting about — the rest
            // of the page is fully usable without it.
            setData(null);
            setFailed(true);
        }
    }, [resort]);

    useEffect(() => {
        void load();
    }, [load]);

    if (failed || !data) {
        return null;
    }

    const operator = liftOperators(data)[0];
    const lift = operator ? liftPassCostFor(operator, partySize, 6) : null;
    const extras = operator ? compulsoryExtras(operator) : [];
    const skicard = extras.find((e) => /skicard/i.test(e.name));
    const skicardTotal = skicard ? (skicard.prices[0]?.amount ?? 0) * partySize : 0;

    // One line per vendor, at its cheapest bookable option. Summing every
    // offering instead would add all six ESI lesson variants together — nobody
    // books a morning course, an afternoon course and two private lessons in the
    // same week, so that total would be fiction.
    const activities = activityVendors(data)
        .map((vendor) => {
            const costs = vendor.offerings
                .filter((o) => o.category === 'ACTIVITY' || o.category === 'SKI_LESSON')
                .map((o) => partyCost(o, partySize))
                .filter((c): c is number => c != null);
            return costs.length === 0
                ? null
                : { vendor: vendor.name, cost: Math.min(...costs) };
        })
        .filter((a): a is { vendor: string; cost: number } => a != null);
    const paidActivities = activities.filter((a) => a.cost > 0);

    const dinners = eateries(data)
        .map((vendor) => estimatedDinnerFor(vendor, partySize))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);

    if (!lift && dinners.length === 0) {
        return null;
    }

    const party = `${partySize} ${partySize === 1 ? 'adult' : 'adults'}`;
    const week = formatTripWeek(tripStart, tripEnd);

    return (
        <section className="rcs" aria-label="What the week costs">
            {week && (
                <p className="rcs__week">
                    <strong>{week}</strong> · {party}
                </p>
            )}
            <div className="rcs__row">
                {lift && (
                    <div className="rcs__item">
                        <span className="rcs__label">Lift passes · 6 days</span>
                        <strong className="rcs__value">{formatEuros(lift.total + skicardTotal)}</strong>
                        <span className="rcs__note">
                            {party} · {formatEuros(lift.perPerson)} each
                            {skicardTotal > 0 && ` + ${formatEuros(skicardTotal)} skicards`}
                        </span>
                    </div>
                )}

                {dinners.length > 0 && (
                    <div className="rcs__item">
                        <span className="rcs__label">Dinner out</span>
                        <strong className="rcs__value">
                            {formatEuros(dinners[0])}–{formatEuros(dinners[dinners.length - 1])}
                        </strong>
                        <span className="rcs__note">{party} · cheapest main each, drinks excluded</span>
                    </div>
                )}

                {paidActivities.length > 0 && (
                    <div className="rcs__item">
                        <span className="rcs__label">Activities · each once</span>
                        <strong className="rcs__value">
                            {formatEuros(paidActivities.reduce((sum, a) => sum + a.cost, 0))}
                        </strong>
                        <span className="rcs__note">
                            Cheapest option at each of {paidActivities.length} places
                            {activities.length > paidActivities.length
                                && `, plus ${activities.length - paidActivities.length} free`} · {party}
                        </span>
                    </div>
                )}

                <div className="rcs__item rcs__item--gap">
                    <span className="rcs__label">Not priced here</span>
                    <strong className="rcs__value rcs__value--muted">Ski hire · stays · flights</strong>
                    <span className="rcs__note">
                        Hire shops quote only after dates are entered, so there is no table to show.
                    </span>
                </div>
            </div>

            {onOpenDetail && (
                <button type="button" className="rcs__link" onClick={onOpenDetail}>
                    See the full tariff and menus →
                </button>
            )}
        </section>
    );
};

export default ResortCostSummary;
