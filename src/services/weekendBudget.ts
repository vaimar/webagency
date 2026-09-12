// Weekend budget — what the trip actually costs, line by line.
//
// This answers the question the product is for: "someone wants to go to
// Le Mans and wakeboard — what does the weekend cost?" Not "which of our
// catalogue venues matches a filter". Any destination works; what matters is
// whether each line has a price behind it.
//
// Every line carries its own status, exactly like a flight CostLine:
//   EXACT                  a published price (a menu, a session rate, a fare)
//   ESTIMATED              a reasonable figure, clearly marked
//   MANUAL_CHECK_REQUIRED  we do not have this number — shown as a gap, never
//                          dropped, because a total that silently omits the
//                          train fare is a lie
//
// The total takes the WEAKEST status of its lines. A budget with one unpriced
// leg is an estimate, however precise the rest is.

import { CostLineStatus } from './api';

export type BudgetLineKind = 'transport' | 'stay' | 'food' | 'activity' | 'other';

export interface BudgetLineInput {
    kind: BudgetLineKind;
    label: string;
    /** Price of one unit: one night, one meal, one session, one fare. */
    unitAmount: number | null;
    /** Nights, meals, sessions. */
    units: number;
    /** True when the cost scales with the number of people (a meal), false
     *  when it does not (a hotel room, a car). */
    perPerson: boolean;
    status: CostLineStatus;
    /** Where the number came from — a menu, a venue page, the backend. */
    source: string;
    note?: string;
}

export interface BudgetLine extends BudgetLineInput {
    /** unitAmount x units x (perPerson ? partySize : 1). Null when unpriced. */
    amount: number | null;
}

export interface BudgetTotals {
    /** What the whole party pays. */
    party: number;
    /** party / partySize — what each person owes. */
    perPerson: number;
    currency: string;
    /** Weakest contributing line. */
    status: CostLineStatus;
    /** Lines we could not price. The total is incomplete by exactly these. */
    unpricedLabels: string[];
}

export interface WeekendBudget {
    destination: string;
    nights: number;
    partySize: number;
    lines: BudgetLine[];
    totals: BudgetTotals;
    /** Null when no ceiling was given. */
    withinBudget: boolean | null;
    /** Headroom (positive) or overshoot (negative) against the ceiling. */
    budgetGapPerPerson: number | null;
}

export interface ComposeInput {
    destination: string;
    nights: number;
    partySize: number;
    lines: BudgetLineInput[];
    currency?: string;
    /** Ceiling per person, if the traveller named one. */
    budgetPerPerson?: number | null;
}

/** Weakest status wins, in this order. */
const STATUS_RANK: Record<CostLineStatus, number> = {
    EXACT: 0,
    OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE: 1,
    ESTIMATED: 2,
    MANUAL_CHECK_REQUIRED: 3,
};

export const priceLine = (line: BudgetLineInput, partySize: number): BudgetLine => {
    if (line.unitAmount === null || !Number.isFinite(line.unitAmount) || line.units <= 0) {
        return { ...line, amount: null };
    }
    const heads = line.perPerson ? Math.max(1, partySize) : 1;
    // Round to cents — a menu price of 20.90 must not drift.
    return { ...line, amount: Math.round(line.unitAmount * line.units * heads * 100) / 100 };
};

export const composeWeekend = (input: ComposeInput): WeekendBudget => {
    const partySize = Math.max(1, input.partySize);
    const currency = input.currency ?? 'EUR';
    const lines = input.lines.map((line) => priceLine(line, partySize));

    const party = Math.round(
        lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) * 100,
    ) / 100;

    const unpriced = lines.filter((line) => line.amount === null);

    // An unpriced line drags the whole total down to MANUAL_CHECK_REQUIRED,
    // whatever the others say.
    let worst: CostLineStatus = 'EXACT';
    for (const line of lines) {
        const status: CostLineStatus = line.amount === null ? 'MANUAL_CHECK_REQUIRED' : line.status;
        if (STATUS_RANK[status] > STATUS_RANK[worst]) {
            worst = status;
        }
    }

    const perPerson = Math.round((party / partySize) * 100) / 100;
    const ceiling = input.budgetPerPerson ?? null;

    return {
        destination: input.destination,
        nights: input.nights,
        partySize,
        lines,
        totals: {
            party,
            perPerson,
            currency,
            status: lines.length === 0 ? 'MANUAL_CHECK_REQUIRED' : worst,
            unpricedLabels: unpriced.map((line) => line.label),
        },
        // Unknown rather than false when a line is missing: a budget you cannot
        // complete is not a budget you have blown.
        withinBudget: ceiling === null ? null : (unpriced.length > 0 ? null : perPerson <= ceiling),
        budgetGapPerPerson: ceiling === null ? null : Math.round((ceiling - perPerson) * 100) / 100,
    };
};

/** Sums one category — powers the per-kind rows in the UI. */
export const subtotalByKind = (budget: WeekendBudget, kind: BudgetLineKind): number => (
    Math.round(
        budget.lines
            .filter((line) => line.kind === kind)
            .reduce((sum, line) => sum + (line.amount ?? 0), 0) * 100,
    ) / 100
);

/**
 * Picks the cheapest fully-priced transport option. Unpriced options are not
 * "free" and are never chosen — they are returned so the UI can show them as
 * alternatives still to check.
 */
export interface TransportOption extends BudgetLineInput {
    kind: 'transport';
    mode: 'flight' | 'train' | 'car' | 'coach';
    durationMinutes?: number | null;
}

export interface TransportChoice {
    chosen: TransportOption | null;
    alternatives: TransportOption[];
    unpriced: TransportOption[];
}

export const chooseTransport = (options: TransportOption[], partySize: number): TransportChoice => {
    const priced = options.filter((o) => priceLine(o, partySize).amount !== null);
    const unpriced = options.filter((o) => priceLine(o, partySize).amount === null);

    const ranked = [...priced].sort((a, b) => {
        const costA = priceLine(a, partySize).amount ?? Infinity;
        const costB = priceLine(b, partySize).amount ?? Infinity;
        if (costA !== costB) return costA - costB;
        return (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity);
    });

    return {
        chosen: ranked[0] ?? null,
        alternatives: ranked.slice(1),
        unpriced,
    };
};
