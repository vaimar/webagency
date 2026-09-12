import { BoardSpec, findCarrierRule, TYPICAL_BOARD_CM } from '../data/boardRules';
import { RIDE_SPOTS } from '../data/rideSpots';
import { buildRouteCard, buildTrust } from './routeCard';
import { optimiseRoute, RouteStop } from './wakeRoute';

const LYON = { label: 'Lyon', point: { lat: 45.7640, lon: 4.8357 } };
const BOARD: BoardSpec = { lengthCm: TYPICAL_BOARD_CM.common, bagged: true };

const stop = (label: string, lat: number, lon: number, nights = 1, sessionEur = 36): RouteStop =>
    ({ label, point: { lat, lon }, nights, sessionEur });

const SPAY = stop('Wake Paradise', 47.93, 0.17);
const MIOS = stop('Lakecity 33', 44.605, -0.937, 2, 30);

const card = (overrides: Partial<Parameters<typeof buildRouteCard>[0]> = {}) => {
    const plan = optimiseRoute(LYON, [SPAY, MIOS]);
    return buildRouteCard({
        id: 'r1', origin: LYON, plan, spots: [], board: BOARD, partySize: 2,
        nightlyEur: 74, mealsEurPerDay: 35, now: new Date('2026-09-20T00:00:00Z'),
        ...overrides,
    });
};

describe('an all-car route', () => {
    it('adds no board surcharge, because the board is in the boot', () => {
        const c = card();

        expect(c.totals.boardSurchargeEur).toBe(0);
        expect(c.totals.baseTravelEur).toBeGreaterThan(0);
        expect(c.legs.every((l) => l.board.verdict === 'FINE')).toBe(true);
        expect(c.legs.every((l) => l.board.costEur === 0)).toBe(true);
    });

    it('keeps travel, stays, food and sessions as separate totals', () => {
        const c = card();

        expect(c.totals.staysEur).toBeGreaterThan(0);
        expect(c.totals.foodEur).toBeGreaterThan(0);
        expect(c.totals.sessionsEur).toBeGreaterThan(0);
        // The subtotal is the sum of the parts, not a separate guess.
        const parts = c.totals.baseTravelEur + c.totals.boardSurchargeEur
            + c.totals.staysEur + c.totals.foodEur + c.totals.sessionsEur;
        expect(Math.abs(parts - c.totals.knownSubtotalEur)).toBeLessThan(0.02);
    });

    it('reports a proven order and no unknown components', () => {
        const c = card();

        expect(c.orderProven).toBe(true);
        expect(c.totals.unknownComponents).toEqual([]);
        expect(c.confidence).toBe('live');
        expect(c.degraded).toBe(false);
    });
});

describe('a mixed car + Ryanair route', () => {
    const mixed = () => {
        const plan = optimiseRoute(LYON, [SPAY, MIOS]);
        return buildRouteCard({
            id: 'r2', origin: LYON, plan, spots: [], board: BOARD, partySize: 2,
            nightlyEur: 74, mealsEurPerDay: 35,
            carrierByLeg: { 0: findCarrierRule('Ryanair')! },
            now: new Date('2026-09-20T00:00:00Z'),
        });
    };

    it('adds the board bag as a surcharge, kept out of base travel', () => {
        const c = mixed();

        // EUR 60 per rider, two riders, on the one flown leg.
        expect(c.totals.boardSurchargeEur).toBe(120);
        expect(c.totals.baseTravelEur).toBeGreaterThan(0);
        expect(c.legs[0].board.carrier).toBe('Ryanair');
        expect(c.legs[0].board.costEur).toBe(60);
    });

    it('marks the flown leg as needing booking, and the car legs as fine', () => {
        const c = mixed();

        expect(c.legs[0].board.verdict).toBe('MUST_BOOK');
        expect(c.legs[0].board.confirmBeforeBooking).toBe(true);
        expect(c.legs.slice(1).every((l) => l.board.verdict === 'FINE')).toBe(true);
    });
});

// Regression: carrier overrides were once applied to the rendered legs but
// not to the costing, so the card showed one carrier and priced another.
// Overrides are now applied once, to the plan, before either path reads it.
describe('single source of truth for carriers', () => {
    it('prices the same carrier it displays, on a mixed route', () => {
        const plan = optimiseRoute(LYON, [SPAY, MIOS]);
        const ryanair = findCarrierRule('Ryanair')!;
        const c = buildRouteCard({
            id: 'sot', origin: LYON, plan, spots: [], board: BOARD, partySize: 2,
            carrierByLeg: { 0: ryanair },
            now: new Date('2026-09-20T00:00:00Z'),
        });

        // Leg 0 displays Ryanair...
        expect(c.legs[0].board.carrier).toBe('Ryanair');
        expect(c.legs[0].board.costEur).toBe(60);
        // ...and the surcharge is priced from that same carrier, for 2 riders.
        expect(c.totals.boardSurchargeEur).toBe(120);

        // Every other leg stays the car, displayed and priced alike.
        for (const leg of c.legs.slice(1)) {
            expect(leg.board.carrier).toBe('Your own car');
            expect(leg.board.costEur).toBe(0);
        }
    });

    it('keeps the surcharge at zero when nothing is overridden', () => {
        const plan = optimiseRoute(LYON, [SPAY, MIOS]);
        const c = buildRouteCard({
            id: 'sot2', origin: LYON, plan, spots: [], board: BOARD, partySize: 2,
            now: new Date('2026-09-20T00:00:00Z'),
        });

        expect(c.legs.every((l) => l.board.carrier === 'Your own car')).toBe(true);
        expect(c.totals.boardSurchargeEur).toBe(0);
    });
});

describe('degraded semantics', () => {
    // A route missing a spot the rider asked for is not the route they asked
    // for, even when everything remaining is priced.
    it('degrades and warns when a requested spot is excluded', () => {
        const c = card({ excluded: [{ spot: 'Langenfeld', reason: 'no coordinates yet' }] });

        expect(c.degraded).toBe(true);
        expect(c.warnings.some((w) => w.kind === 'SPOT_EXCLUDED')).toBe(true);
        expect(c.trust.excluded).toHaveLength(1);
    });

    it('degrades on an unpriced component, and names it', () => {
        const plan = optimiseRoute(LYON, [SPAY]);
        const c = buildRouteCard({
            id: 'deg', origin: LYON, plan, spots: [], board: BOARD, partySize: 1,
            carrierByLeg: { 0: findCarrierRule('Deutsche Bahn')! },
            now: new Date('2026-09-20T00:00:00Z'),
        });

        expect(c.degraded).toBe(true);
        expect(c.totals.unknownComponents.length).toBeGreaterThan(0);
        expect(c.confidence).toBe('estimated');
    });

    it('is not degraded when everything is priced, placed and verified', () => {
        const c = card();

        expect(c.degraded).toBe(false);
        expect(c.confidence).toBe('live');
        expect(c.totals.unknownComponents).toEqual([]);
        expect(c.trust.excluded).toEqual([]);
    });
});

describe('an unsupported rail leg', () => {
    const rail = () => {
        const plan = optimiseRoute(LYON, [SPAY, MIOS]);
        return buildRouteCard({
            id: 'r3', origin: LYON, plan, spots: [], board: BOARD, partySize: 1,
            nightlyEur: 74, mealsEurPerDay: 35,
            carrierByLeg: { 0: findCarrierRule('SNCF (TGV INOUI / Intercités)')! },
            now: new Date('2026-09-20T00:00:00Z'),
        });
    };

    // The rule the whole contract exists for.
    it('shows null, never zero, for a board that will not fit', () => {
        const c = rail();

        expect(c.legs[0].board.verdict).toBe('OVER_LIMIT');
        expect(c.legs[0].board.costEur).toBeNull();
        expect(c.legs[0].board.costEur).not.toBe(0);
    });

    it('names the leg as an unknown component rather than absorbing it', () => {
        const c = rail();

        expect(c.totals.unknownComponents.length).toBeGreaterThan(0);
        expect(c.totals.unknownComponents.join(' ')).toMatch(/Board:/);
        expect(c.totals.status).toBe('MANUAL_CHECK_REQUIRED');
    });

    it('raises a critical warning and marks the card degraded', () => {
        const c = rail();

        expect(c.warnings.some((w) => w.kind === 'BOARD_OVER_LIMIT' && w.severity === 'critical')).toBe(true);
        expect(c.degraded).toBe(true);
        expect(c.confidence).toBe('estimated');
    });

    it('still produces a usable route — it degrades, it does not disappear', () => {
        const c = rail();

        expect(c.legs.length).toBeGreaterThan(0);
        expect(c.totals.knownSubtotalEur).toBeGreaterThan(0);
        expect(c.stops).toEqual(expect.arrayContaining(['Wake Paradise', 'Lakecity 33']));
    });
});

describe('an unknown carrier', () => {
    it('warns rather than assuming the board travels free', () => {
        const plan = optimiseRoute(LYON, [SPAY]);
        const c = buildRouteCard({
            id: 'r4', origin: LYON, plan, spots: [], board: BOARD, partySize: 1,
            carrierByLeg: { 0: findCarrierRule('Deutsche Bahn')! },
            now: new Date('2026-09-20T00:00:00Z'),
        });

        expect(c.legs[0].board.verdict).toBe('UNKNOWN');
        expect(c.legs[0].board.costEur).toBeNull();
        expect(c.warnings.some((w) => w.kind === 'BOARD_UNKNOWN')).toBe(true);
    });
});

describe('the trust panel', () => {
    it('grades every fact behind the card by where it came from', () => {
        const trust = buildTrust(RIDE_SPOTS, [], new Date('2026-09-20T00:00:00Z'));
        const states = new Set(trust.rows.map((r) => r.state));

        expect(states.has('UNVERIFIED')).toBe(true);   // untouched spots
        expect(states.has('DERIVED')).toBe(true);      // climate, from the rule
        expect(states.has('REPORTED')).toBe(true);     // told to us
        expect(states.has('LISTED')).toBe(true);       // third-party listing
        expect(trust.verified).toBeLessThan(trust.total);
    });

    it('keeps the source and date where there is one', () => {
        const trust = buildTrust(RIDE_SPOTS, [], new Date('2026-09-20T00:00:00Z'));
        const listed = trust.rows.find((r) => r.state === 'LISTED')!;

        expect(listed.sourceUrl).toMatch(/^https:\/\//);
        expect(listed.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('records what was left out and why', () => {
        const c = card({ excluded: [{ spot: 'Langenfeld', reason: 'no coordinates yet' }] });

        expect(c.trust.excluded).toEqual([{ spot: 'Langenfeld', reason: 'no coordinates yet' }]);
        expect(c.warnings.some((w) => w.kind === 'SPOT_EXCLUDED')).toBe(true);
    });
});
