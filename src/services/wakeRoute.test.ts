import { BoardSpec, findCarrierRule, TYPICAL_BOARD_CM } from '../data/boardRules';
import { composeWeekend } from './weekendBudget';
import {
    buildCarLeg,
    CAR_CARRIER,
    EXACT_LIMIT,
    optimiseRoute,
    roadKm,
    RouteStop,
    routeToBudgetLines,
    straightLineKm,
} from './wakeRoute';

const BOARD: BoardSpec = { lengthCm: TYPICAL_BOARD_CM.common, bagged: true };

// A real French wake road trip. Coordinates are the towns the parks sit in.
const LYON = { label: 'Lyon', point: { lat: 45.7640, lon: 4.8357 } };

const stop = (label: string, lat: number, lon: number, nights: number, sessionEur?: number): RouteStop => ({
    label, point: { lat, lon }, nights, sessionEur,
});

const LAMOTTE = stop('Lamotte-du-Rhône', 44.2372, 4.7031, 1, 36);   // Rhône valley, south of Lyon
const MIOS = stop('Mios (Lakecity 33)', 44.6050, -0.9370, 2, 30);    // Atlantic, far west
const LE_MANS = stop('Le Mans', 48.0061, 0.1996, 1, 36);             // north-west
const BARCARES = stop('Le Barcarès', 42.7980, 3.0370, 1, 32);        // Mediterranean, far south

describe('straight line vs road', () => {
    it('measures real separation between two spots', () => {
        // Lyon to Lamotte-du-Rhône is roughly 170 km as the crow flies.
        const km = straightLineKm(LYON.point, LAMOTTE.point);
        expect(km).toBeGreaterThan(160);
        expect(km).toBeLessThan(180);
    });

    it('adds the road factor, because roads are not straight', () => {
        expect(roadKm(LYON.point, LAMOTTE.point))
            .toBeCloseTo(straightLineKm(LYON.point, LAMOTTE.point) * 1.3, 1);
    });
});

describe('optimiseRoute — the travelling salesman part', () => {
    it('orders four spots to minimise driving, and proves it is optimal', () => {
        const plan = optimiseRoute(LYON, [LE_MANS, BARCARES, LAMOTTE, MIOS]);

        expect(plan.optimal).toBe(true);
        expect(plan.order).toHaveLength(4);
        // Every permutation was measured, so nothing can beat it.
        expect(plan.totalKm).toBeGreaterThan(0);
    });

    it('beats the order a human would type in', () => {
        const naiveOrder = [LE_MANS, BARCARES, LAMOTTE, MIOS];
        const naiveKm = [...naiveOrder].reduce((acc, s, i) => {
            const from = i === 0 ? LYON.point : naiveOrder[i - 1].point;
            return acc + roadKm(from, s.point);
        }, 0) + roadKm(naiveOrder[naiveOrder.length - 1].point, LYON.point);

        const plan = optimiseRoute(LYON, naiveOrder);
        expect(plan.totalKm).toBeLessThan(naiveKm);
    });

    it('closes the loop — a road trip comes home', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE, MIOS]);

        expect(plan.legs[0].from).toBe('Lyon');
        expect(plan.legs[plan.legs.length - 1].to).toBe('Lyon');
        expect(plan.legs).toHaveLength(3);   // out, across, back
    });

    it('can be told not to return, for a one-way trip', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE, MIOS], { returnTo: null });

        expect(plan.legs).toHaveLength(2);
        expect(plan.legs[plan.legs.length - 1].to).not.toBe('Lyon');
    });

    it('falls back to a heuristic rather than hanging on a long route', () => {
        const many: RouteStop[] = Array.from({ length: EXACT_LIMIT + 2 }, (_, i) =>
            stop(`Spot ${i}`, 44 + i * 0.4, 2 + i * 0.3, 1));

        const started = Date.now();
        const plan = optimiseRoute(LYON, many);

        expect(plan.optimal).toBe(false);
        expect(plan.order).toHaveLength(many.length);
        expect(Date.now() - started).toBeLessThan(3000);
    });

    it('handles a single stop and no stops without blowing up', () => {
        expect(optimiseRoute(LYON, [LAMOTTE]).order).toHaveLength(1);
        expect(optimiseRoute(LYON, []).order).toEqual([]);
    });
});

describe('the board', () => {
    it('travels in your own car, with no carrier policy at all', () => {
        const leg = buildCarLeg(LYON, LAMOTTE);

        expect(leg.carrier).toEqual(CAR_CARRIER);
        expect(leg.carrier.allowed).toBe(true);
        expect(leg.carrier.provenance.kind).toBe('physical_fact');
    });
});

describe('costing a route', () => {
    it('prices a four-spot French road trip for two riders', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE, MIOS, LE_MANS, BARCARES]);
        const lines = routeToBudgetLines({
            plan, partySize: 2, nightlyEur: 74, mealsEurPerDay: 35, board: BOARD,
        });
        const budget = composeWeekend({
            destination: 'French wake road trip', nights: 5, partySize: 2, lines,
        });

        // Driving, four sessions, stays and food all present.
        expect(lines.filter((l) => l.kind === 'activity')).toHaveLength(4);
        expect(budget.totals.party).toBeGreaterThan(0);
        expect(budget.totals.status).toBe('ESTIMATED');
        expect(budget.totals.unpricedLabels).toEqual([]);
    });

    // A car route costs nothing extra for the board; the same route by train
    // does, and the route says so.
    it('adds no board line when the whole trip is by car', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE], { returnTo: null });
        const lines = routeToBudgetLines({ plan, partySize: 1, board: BOARD });

        expect(lines.filter((l) => l.label.startsWith('Board:'))).toHaveLength(0);
    });

    it('flags the TGV leg as over-limit rather than pricing it at zero', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE], { returnTo: null });
        plan.legs[0] = {
            ...plan.legs[0],
            mode: 'train',
            carrier: findCarrierRule('SNCF (TGV INOUI / Intercités)')!,
        };

        const lines = routeToBudgetLines({ plan, partySize: 1, board: BOARD });
        const budget = composeWeekend({
            destination: 'Train trip', nights: 1, partySize: 1, lines,
        });

        expect(budget.totals.status).toBe('MANUAL_CHECK_REQUIRED');
        const boardLine = lines.find((l) => l.label.startsWith('Board:'))!;
        expect(boardLine.unitAmount).toBeNull();
        expect(boardLine.note).toMatch(/over/i);
    });

    it('prices a Ryanair board bag rather than leaving it out', () => {
        const plan = optimiseRoute(LYON, [LAMOTTE], { returnTo: null });
        plan.legs[0] = { ...plan.legs[0], mode: 'plane', carrier: findCarrierRule('Ryanair')! };

        const lines = routeToBudgetLines({ plan, partySize: 2, board: BOARD });
        const boardLine = lines.find((l) => l.label.startsWith('Board:'))!;

        expect(boardLine.unitAmount).toBe(60);
        expect(boardLine.perPerson).toBe(true);
    });
});
