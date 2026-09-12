// Wake road trip — the travelling-salesman problem, with a board in the boot.
//
// This is the thing tour operators do not sell. They sell a package TO a
// place. A wake trip is a ROUTE: three or four spots chained together, by
// whatever mix of car, train, ferry and plane actually works, over a set
// number of days. Nobody publishes that, because working it out means knowing
// how far the spots are from each other AND whether you can physically get a
// board onto each leg.
//
// Two halves:
//   1. ORDER   — which sequence of stops costs least (or drives least).
//                Exact for the handful of spots a real trip has; heuristic
//                beyond, rather than hanging on 10! permutations.
//   2. CARRY   — can the board come, and what does it cost. A car leg is
//                free and unlimited. Every other mode has rules that are
//                genuinely hard to find, which is precisely why they are
//                worth owning.

import { round2 } from './driveEstimate';
import { BudgetLineInput } from './weekendBudget';

export type TravelMode = 'car' | 'train' | 'ferry' | 'plane';

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface RouteStop {
    label: string;
    point: GeoPoint;
    nights: number;
    /** Session cost per rider at this spot, when known. */
    sessionEur?: number | null;
}

/**
 * Whether a board can travel on this leg, and what it costs.
 *
 * `allowed: null` means nobody has checked — the leg still plans, but the
 * board line is flagged rather than assumed free. This is the dataset that
 * does not exist anywhere in one place: "can I get a wakeboard on a TGV,
 * and what does Ryanair charge for a board bag."
 */
export interface BoardPolicy {
    mode: TravelMode;
    carrier?: string;
    allowed: boolean | null;
    feeEur: number | null;
    maxLengthCm: number | null;
    note: string;
    /** Same discipline as the venue catalogue: say where this came from. */
    sourceUrl?: string | null;
    checkedOn?: string | null;
}

/** Your own car: the board just goes in. No carrier, no fee, no rules. */
export const CAR_BOARD_POLICY: BoardPolicy = {
    mode: 'car',
    allowed: true,
    feeEur: 0,
    maxLengthCm: null,
    note: 'Your own vehicle — no carrier rule applies.',
};

/** An unchecked mode. Plans fine; the board line is surfaced as unknown. */
export const unknownBoardPolicy = (mode: TravelMode, carrier?: string): BoardPolicy => ({
    mode,
    carrier,
    allowed: null,
    feeEur: null,
    maxLengthCm: null,
    note: `Board carriage on ${carrier ?? mode} not verified — check before booking.`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Distance
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export const straightLineKm = (a: GeoPoint, b: GeoPoint): number => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return round2(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)));
};

/** Roads are not straight. Same 1.3 factor the transfer estimator already uses. */
export const ROAD_FACTOR = 1.3;
export const roadKm = (a: GeoPoint, b: GeoPoint): number => round2(straightLineKm(a, b) * ROAD_FACTOR);

// ─────────────────────────────────────────────────────────────────────────────
// Legs
// ─────────────────────────────────────────────────────────────────────────────

export interface Leg {
    from: string;
    to: string;
    mode: TravelMode;
    distanceKm: number;
    durationMinutes: number;
    /** Null when the mode is not priced — never treated as free. */
    costEur: number | null;
    board: BoardPolicy;
    note?: string;
}

export interface DrivingRates {
    /** Fuel plus wear, per km, for the vehicle — not per person. */
    eurPerKm: number;
    averageKph: number;
}

/** Conservative European defaults; override per trip. */
export const DEFAULT_DRIVING: DrivingRates = { eurPerKm: 0.22, averageKph: 85 };

export const buildCarLeg = (
    from: RouteStop | { label: string; point: GeoPoint },
    to: RouteStop | { label: string; point: GeoPoint },
    rates: DrivingRates = DEFAULT_DRIVING,
): Leg => {
    const distanceKm = roadKm(from.point, to.point);
    return {
        from: from.label,
        to: to.label,
        mode: 'car',
        distanceKm,
        durationMinutes: Math.round((distanceKm / rates.averageKph) * 60),
        costEur: round2(distanceKm * rates.eurPerKm),
        board: CAR_BOARD_POLICY,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Ordering — the travelling salesman part
// ─────────────────────────────────────────────────────────────────────────────

export interface RoutePlan {
    order: RouteStop[];
    legs: Leg[];
    totalKm: number;
    totalDriveMinutes: number;
    /** True when the order is provably optimal, false when heuristic. */
    optimal: boolean;
}

const permute = <T, >(items: T[]): T[][] => {
    if (items.length <= 1) return [items];
    const out: T[][] = [];
    items.forEach((item, i) => {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const tail of permute(rest)) {
            out.push([item, ...tail]);
        }
    });
    return out;
};

/** Above this, exact search stops being worth the wait. 7! = 5040 orders. */
export const EXACT_LIMIT = 8;

const measure = (
    start: GeoPoint,
    order: RouteStop[],
    end: GeoPoint | null,
): number => {
    let km = 0;
    let cursor = start;
    for (const stop of order) {
        km += roadKm(cursor, stop.point);
        cursor = stop.point;
    }
    if (end) {
        km += roadKm(cursor, end);
    }
    return km;
};

/**
 * Orders the stops to minimise driving. `returnTo` closes the loop — a road
 * trip usually comes home, and ignoring the return leg picks a route that
 * strands you at the far end.
 */
export const optimiseRoute = (
    start: { label: string; point: GeoPoint },
    stops: RouteStop[],
    options: { returnTo?: GeoPoint | null; rates?: DrivingRates } = {},
): RoutePlan => {
    const rates = options.rates ?? DEFAULT_DRIVING;
    const end = options.returnTo === undefined ? start.point : options.returnTo;

    let order: RouteStop[];
    let optimal: boolean;

    if (stops.length <= 1) {
        order = [...stops];
        optimal = true;
    } else if (stops.length <= EXACT_LIMIT) {
        // Small enough to be certain rather than clever.
        let best = permute(stops)[0];
        let bestKm = Infinity;
        for (const candidate of permute(stops)) {
            const km = measure(start.point, candidate, end);
            if (km < bestKm) {
                bestKm = km;
                best = candidate;
            }
        }
        order = best;
        optimal = true;
    } else {
        // Nearest neighbour, then 2-opt. Good enough, and bounded.
        const remaining = [...stops];
        const built: RouteStop[] = [];
        let cursor = start.point;
        while (remaining.length > 0) {
            let nearest = 0;
            let nearestKm = Infinity;
            remaining.forEach((stop, i) => {
                const km = roadKm(cursor, stop.point);
                if (km < nearestKm) { nearestKm = km; nearest = i; }
            });
            const [picked] = remaining.splice(nearest, 1);
            built.push(picked);
            cursor = picked.point;
        }
        let improved = true;
        while (improved) {
            improved = false;
            for (let i = 0; i < built.length - 1; i += 1) {
                for (let j = i + 1; j < built.length; j += 1) {
                    const trial = [...built];
                    // Reverse the span — the classic 2-opt move.
                    const span = trial.slice(i, j + 1).reverse();
                    trial.splice(i, span.length, ...span);
                    if (measure(start.point, trial, end) < measure(start.point, built, end) - 0.01) {
                        built.splice(0, built.length, ...trial);
                        improved = true;
                    }
                }
            }
        }
        order = built;
        optimal = false;
    }

    const legs: Leg[] = [];
    let cursor: { label: string; point: GeoPoint } = start;
    for (const stop of order) {
        legs.push(buildCarLeg(cursor, stop, rates));
        cursor = stop;
    }
    if (end) {
        legs.push(buildCarLeg(cursor, { label: start.label, point: end }, rates));
    }

    return {
        order,
        legs,
        totalKm: round2(legs.reduce((sum, leg) => sum + leg.distanceKm, 0)),
        totalDriveMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
        optimal,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Costing — hands the route to the budget composer
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteCostInput {
    plan: RoutePlan;
    partySize: number;
    /** Nightly room rate, per room rather than per head. */
    nightlyEur?: number | null;
    /** Per person per day. */
    mealsEurPerDay?: number | null;
}

/**
 * Turns a route into budget lines. Every leg becomes a line — including one
 * whose board policy is unknown, which is surfaced rather than dropped.
 */
export const routeToBudgetLines = (input: RouteCostInput): BudgetLineInput[] => {
    const { plan, partySize } = input;
    const lines: BudgetLineInput[] = [];
    const nights = plan.order.reduce((sum, stop) => sum + stop.nights, 0);

    const drivingCost = plan.legs.reduce((sum, leg) => sum + (leg.costEur ?? 0), 0);
    lines.push({
        kind: 'transport',
        label: `Driving, ${plan.totalKm} km total`,
        unitAmount: round2(drivingCost),
        units: 1,
        perPerson: false,
        status: 'ESTIMATED',
        source: `${plan.legs.length} legs at ${DEFAULT_DRIVING.eurPerKm} EUR/km`,
        note: `${Math.round(plan.totalDriveMinutes / 60)}h at the wheel across the trip`,
    });

    // A leg nobody has checked the board rules for is its own line, priced null.
    for (const leg of plan.legs.filter((l) => l.board.allowed === null)) {
        lines.push({
            kind: 'transport',
            label: `Board carriage: ${leg.from} → ${leg.to} by ${leg.mode}`,
            unitAmount: leg.board.feeEur,
            units: 1,
            perPerson: true,
            status: 'MANUAL_CHECK_REQUIRED',
            source: leg.board.carrier ?? leg.mode,
            note: leg.board.note,
        });
    }

    for (const stop of plan.order) {
        if (typeof stop.sessionEur === 'number') {
            lines.push({
                kind: 'activity',
                label: `${stop.label} — session`,
                unitAmount: stop.sessionEur,
                units: 1,
                perPerson: true,
                status: 'EXACT',
                source: `${stop.label} published rate`,
            });
        }
    }

    if (typeof input.nightlyEur === 'number' && nights > 0) {
        lines.push({
            kind: 'stay',
            label: `${nights} nights across ${plan.order.length} stops`,
            unitAmount: input.nightlyEur,
            units: nights,
            perPerson: false,
            status: 'ESTIMATED',
            source: 'nightly room rate',
        });
    }

    if (typeof input.mealsEurPerDay === 'number' && nights > 0) {
        lines.push({
            kind: 'food',
            label: `Eating, ${nights + 1} days`,
            unitAmount: input.mealsEurPerDay,
            units: nights + 1,
            perPerson: true,
            status: 'ESTIMATED',
            source: 'daily food allowance',
        });
    }

    return lines;
};
