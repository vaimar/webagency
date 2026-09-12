// The route result contract — what the UI renders for a built wake route.
//
// Replaces the search-shaped TripOption. A search result answers "which
// destination"; a route answers "what is the trip, leg by leg, and what does
// it cost with a board".
//
// Three rules the shape enforces rather than relies on callers to remember:
//   1. Travel cost and board surcharge are separate totals. A board bag is
//      not travel, and burying it in one number hides the thing that surprises
//      people at the gate.
//   2. Anything unpriced is null and named in `unknownComponents`. Never 0.
//   3. Every fact behind the card is listed with its provenance, so the UI can
//      show uncertainty without hiding the answer.

import { CostLineStatus, DataConfidence } from './api';
import {
    assessCarriage, BoardSpec, CarriageVerdict, CarrierBoardRule,
} from '../data/boardRules';
import {
    ALL_FACT_KEYS, RideSpot, RideSpotFactKey, resolveFact, ResolvedFactStatus, VenueFact,
} from '../data/rideSpots';
import { composeWeekend, WeekendBudget } from './weekendBudget';
import { GeoPoint, RoutePlan, routeToBudgetLines, TravelMode } from './wakeRoute';

// ─────────────────────────────────────────────────────────────────────────────
// The card
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteCardBoard {
    verdict: CarriageVerdict;
    /** Per rider, per leg. Null when unknown or over-limit — never 0. */
    costEur: number | null;
    message: string;
    confirmBeforeBooking: boolean;
    carrier: string;
}

export interface RouteCardLeg {
    from: string;
    to: string;
    mode: TravelMode;
    distanceKm: number;
    durationMinutes: number;
    /** Cost of moving people, excluding the board. */
    travelCostEur: number | null;
    board: RouteCardBoard;
}

export interface RouteTotals {
    /** Getting there — fuel, fares. Excludes the board. */
    baseTravelEur: number;
    /** What carrying the board adds, where we know it. */
    boardSurchargeEur: number;
    staysEur: number;
    foodEur: number;
    sessionsEur: number;
    /** Everything we could actually price. */
    knownSubtotalEur: number;
    /** Named gaps. While this is non-empty the total is incomplete, not final. */
    unknownComponents: string[];
    perPersonEur: number;
    currency: string;
    /** Weakest contributing line. */
    status: CostLineStatus;
}

export type TrustState = 'VERIFIED' | 'DERIVED' | 'REPORTED' | 'LISTED' | 'STALE' | 'UNVERIFIED';

export interface TrustRow {
    spot: string;
    field: RideSpotFactKey;
    state: TrustState;
    checkedOn: string | null;
    sourceUrl: string | null;
    note?: string;
}

export interface TrustSummary {
    rows: TrustRow[];
    verified: number;
    total: number;
    /** Spots left out, and why — never silently dropped. */
    excluded: Array<{ spot: string; reason: string }>;
}

export type RouteWarningKind =
    | 'BOARD_OVER_LIMIT'
    | 'BOARD_UNKNOWN'
    | 'UNPRICED_COMPONENT'
    | 'UNVERIFIED_FACT'
    | 'SPOT_EXCLUDED'
    | 'HEURISTIC_ORDER';

export interface RouteWarning {
    kind: RouteWarningKind;
    severity: 'info' | 'warn' | 'critical';
    message: string;
}

export interface RouteCard {
    id: string;
    origin: { label: string; point: GeoPoint };
    /** Furthest stop, or the origin again on a loop. */
    destination: { label: string };
    stops: string[];
    nights: number;
    partySize: number;
    legs: RouteCardLeg[];
    totals: RouteTotals;
    trust: TrustSummary;
    warnings: RouteWarning[];
    confidence: DataConfidence;
    /** True when something material is unverified or unpriced. */
    degraded: boolean;
    /** False when the stop order is heuristic rather than proven. */
    orderProven: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust
// ─────────────────────────────────────────────────────────────────────────────

const trustStateFor = (
    status: ResolvedFactStatus,
    sourceKind: string | undefined,
): TrustState => {
    if (status === 'UNVERIFIED' || status === 'NOT_APPLICABLE') return 'UNVERIFIED';
    if (status === 'STALE') return 'STALE';
    switch (sourceKind) {
        case 'derived': return 'DERIVED';
        case 'user_report': return 'REPORTED';
        case 'third_party': return 'LISTED';
        default: return 'VERIFIED';
    }
};

/** Every fact behind the card, with where it came from. Powers the trust panel. */
export const buildTrust = (
    spots: RideSpot[],
    excluded: Array<{ spot: string; reason: string }> = [],
    now: Date = new Date(),
): TrustSummary => {
    const rows: TrustRow[] = [];
    for (const spot of spots) {
        for (const field of ALL_FACT_KEYS) {
            // The union of VenueFact<T> across fields has no single T; only
            // the metadata is read here, so widen to unknown deliberately.
            const fact = spot[field] as VenueFact<unknown>;
            const resolved = resolveFact(fact, field, now);
            rows.push({
                spot: spot.label,
                field,
                state: trustStateFor(resolved.status, fact.sourceKind),
                checkedOn: resolved.checkedOn,
                sourceUrl: resolved.sourceUrl,
                note: fact.note,
            });
        }
    }
    return {
        rows,
        verified: rows.filter((r) => r.state !== 'UNVERIFIED').length,
        total: rows.length,
        excluded,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// The mapper
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildRouteCardInput {
    id: string;
    origin: { label: string; point: GeoPoint };
    plan: RoutePlan;
    spots: RideSpot[];
    board: BoardSpec;
    partySize: number;
    nightlyEur?: number | null;
    mealsEurPerDay?: number | null;
    excluded?: Array<{ spot: string; reason: string }>;
    carrierByLeg?: Record<number, CarrierBoardRule>;
    now?: Date;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const buildRouteCard = (input: BuildRouteCardInput): RouteCard => {
    const now = input.now ?? new Date();
    const warnings: RouteWarning[] = [];

    // Apply carrier overrides ONCE, to the plan, so the displayed legs and the
    // costed lines cannot disagree about who is carrying the board.
    const plan: RoutePlan = input.carrierByLeg
        ? {
            ...input.plan,
            legs: input.plan.legs.map((leg, index) => (
                input.carrierByLeg?.[index] ? { ...leg, carrier: input.carrierByLeg[index] } : leg
            )),
        }
        : input.plan;

    // ── legs, each with its own board verdict ──
    const legs: RouteCardLeg[] = plan.legs.map((leg) => {
        const carrier = leg.carrier;
        const verdict = assessCarriage(carrier, input.board);

        if (verdict.verdict === 'OVER_LIMIT') {
            warnings.push({ kind: 'BOARD_OVER_LIMIT', severity: 'critical', message: verdict.message });
        } else if (verdict.verdict === 'UNKNOWN') {
            warnings.push({ kind: 'BOARD_UNKNOWN', severity: 'warn', message: verdict.message });
        }

        return {
            from: leg.from,
            to: leg.to,
            mode: leg.mode,
            distanceKm: leg.distanceKm,
            durationMinutes: leg.durationMinutes,
            travelCostEur: leg.costEur,
            board: {
                verdict: verdict.verdict,
                costEur: verdict.costEur,
                message: verdict.message,
                confirmBeforeBooking: verdict.confirmBeforeBooking,
                carrier: carrier.carrier,
            },
        };
    });

    // ── totals: travel and board kept apart on purpose ──
    const lines = routeToBudgetLines({
        plan,
        partySize: input.partySize,
        board: input.board,
        nightlyEur: input.nightlyEur,
        mealsEurPerDay: input.mealsEurPerDay,
    });
    const budget: WeekendBudget = composeWeekend({
        destination: plan.order[plan.order.length - 1]?.label ?? input.origin.label,
        nights: plan.order.reduce((sum, s) => sum + s.nights, 0),
        partySize: input.partySize,
        lines,
    });

    const isBoardLine = (label: string) => label.startsWith('Board:');
    const sumWhere = (predicate: (label: string, kind: string) => boolean) => round2(
        budget.lines
            .filter((l) => predicate(l.label, l.kind))
            .reduce((sum, l) => sum + (l.amount ?? 0), 0),
    );

    const baseTravelEur = sumWhere((label, kind) => kind === 'transport' && !isBoardLine(label));
    const boardSurchargeEur = sumWhere((label) => isBoardLine(label));
    const staysEur = sumWhere((_l, kind) => kind === 'stay');
    const foodEur = sumWhere((_l, kind) => kind === 'food');
    const sessionsEur = sumWhere((_l, kind) => kind === 'activity');

    const unknownComponents = budget.totals.unpricedLabels;
    if (unknownComponents.length > 0) {
        warnings.push({
            kind: 'UNPRICED_COMPONENT',
            severity: 'warn',
            message: `Not costed yet: ${unknownComponents.join(', ')}. The total below is incomplete by exactly these.`,
        });
    }

    if (!plan.optimal) {
        warnings.push({
            kind: 'HEURISTIC_ORDER',
            severity: 'info',
            message: 'Too many stops to check every order — this one is good, not provably shortest.',
        });
    }

    // ── trust ──
    const excluded = input.excluded ?? [];
    for (const item of excluded) {
        warnings.push({ kind: 'SPOT_EXCLUDED', severity: 'info', message: `${item.spot}: ${item.reason}` });
    }
    const trust = buildTrust(input.spots, excluded, now);

    const unverifiedUsed = trust.rows.filter(
        (r) => r.state === 'LISTED' || r.state === 'DERIVED' || r.state === 'STALE',
    );
    if (unverifiedUsed.length > 0) {
        warnings.push({
            kind: 'UNVERIFIED_FACT',
            severity: 'info',
            message: `${unverifiedUsed.length} fact${unverifiedUsed.length === 1 ? '' : 's'} came from a listing or a rule rather than the venue. See the trust panel.`,
        });
    }

    // Dropping a spot the rider asked for is material: the route they get is
    // not the route they asked for, even if everything left is priced.
    const degraded = unknownComponents.length > 0
        || warnings.some((w) => w.severity === 'critical')
        || unverifiedUsed.length > 0
        || excluded.length > 0;

    const confidence: DataConfidence = unknownComponents.length > 0 || warnings.some((w) => w.severity === 'critical')
        ? 'estimated'
        : unverifiedUsed.length > 0 ? 'mixed' : 'live';

    const last = plan.order[plan.order.length - 1];
    const returnsHome = legs.length > 0 && legs[legs.length - 1].to === input.origin.label;

    return {
        id: input.id,
        origin: input.origin,
        destination: { label: returnsHome ? `${input.origin.label} (loop)` : last?.label ?? input.origin.label },
        stops: plan.order.map((s) => s.label),
        nights: plan.order.reduce((sum, s) => sum + s.nights, 0),
        partySize: input.partySize,
        legs,
        totals: {
            baseTravelEur,
            boardSurchargeEur,
            staysEur,
            foodEur,
            sessionsEur,
            knownSubtotalEur: budget.totals.party,
            unknownComponents,
            perPersonEur: budget.totals.perPerson,
            currency: budget.totals.currency,
            status: budget.totals.status,
        },
        trust,
        warnings,
        confidence,
        degraded,
        orderProven: plan.optimal,
    };
};
