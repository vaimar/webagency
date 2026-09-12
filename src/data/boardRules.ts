// Carrying a board — the rules, per carrier.
//
// This is the dataset that exists nowhere in one place. Every wake trip runs
// into it and every rider re-researches it from scratch: can I get a board on
// a TGV, what does Ryanair charge for a board bag, will the ferry take it.
//
// ONE DESIGN RULE, AND IT IS THE OPPOSITE OF THE VENUE CATALOGUE.
//
// A venue fact we have not verified HIDES the venue — failing closed costs the
// user an option, which is the safe direction. A board rule we have not
// verified must do the reverse and WARN LOUDLY, because the failure modes are
// opposite: being wrong about a board costs you a EUR 150 penalty, a refused
// bag at the gate, or a trip you cannot take. Silence is the dangerous answer
// here, so an unverified rule still produces a warning — clearly marked as
// unconfirmed — rather than nothing.

export type CarrierMode = 'plane' | 'train' | 'ferry' | 'coach' | 'car';

/** How a fact here was established. Same discipline as the venue catalogue. */
export type RuleProvenanceKind =
    /** Read on the carrier's own page. The only kind we should quote as fact. */
    | 'carrier'
    /** A directory, blog or aggregator. A lead: right often, stale sometimes. */
    | 'third_party'
    /** True by physical reality, not by anyone's policy (your own car). */
    | 'physical_fact';

export interface RuleProvenance {
    kind: RuleProvenanceKind;
    sourceUrl: string | null;
    checkedOn: string | null;
    note: string;
}

export interface CarrierBoardRule {
    carrier: string;
    mode: CarrierMode;
    /** null = nobody has checked. Never assume yes. */
    allowed: boolean | null;
    /** Booked ahead vs paid at the desk — the gap is usually punitive. */
    feeOnlineEur: number | null;
    feeAtDepartureEur: number | null;
    maxLengthCm: number | null;
    maxWeightKg: number | null;
    excessEurPerKg: number | null;
    mustDeclareInAdvance: boolean | null;
    /** What happens if you turn up non-compliant. */
    penaltyNote: string | null;
    provenance: RuleProvenance;
}

// ─────────────────────────────────────────────────────────────────────────────
// The board itself
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardSpec {
    lengthCm: number;
    /** A padded bag adds length, and every carrier measures the bag. */
    bagged: boolean;
    weightKg?: number | null;
}

/** A bag adds roughly this much over the board. Estimated, not measured. */
export const BAG_OVERHEAD_CM = 10;

/**
 * Typical adult wakeboard lengths. Sizing runs on rider weight: roughly
 * 135-139 cm for 60-77 kg, 140-144 cm for ~82 kg, 144 cm+ above 90 kg, and
 * beginners are steered to the longer end for stability.
 *
 * This matters because it is what collides with carrier limits — the common
 * case is not a short board.
 */
export const TYPICAL_BOARD_CM = { short: 134, common: 140, long: 144 };

export const effectiveLengthCm = (board: BoardSpec): number => (
    board.lengthCm + (board.bagged ? BAG_OVERHEAD_CM : 0)
);

// ─────────────────────────────────────────────────────────────────────────────
// The registry
// ─────────────────────────────────────────────────────────────────────────────

const LEAD = (note: string, sourceUrl: string): RuleProvenance => ({
    kind: 'third_party',
    sourceUrl,
    checkedOn: '2026-09-12',
    note: `${note} Not confirmed against the carrier's own page — treat as a lead.`,
});

export const CARRIER_RULES: CarrierBoardRule[] = [
    {
        carrier: 'Your own car',
        mode: 'car',
        allowed: true,
        feeOnlineEur: 0, feeAtDepartureEur: 0,
        maxLengthCm: null, maxWeightKg: null, excessEurPerKg: null,
        mustDeclareInAdvance: false,
        penaltyNote: null,
        provenance: {
            kind: 'physical_fact', sourceUrl: null, checkedOn: null,
            note: 'Your vehicle. No carrier policy applies.',
        },
    },
    {
        carrier: 'Ryanair',
        mode: 'plane',
        allowed: true,
        // The online/airport gap is the trap: turning up unbooked costs more.
        feeOnlineEur: 60, feeAtDepartureEur: 70,
        maxLengthCm: null,          // no published dimension limit found
        maxWeightKg: 20,
        excessEurPerKg: 13,
        mustDeclareInAdvance: true,
        penaltyNote: 'Booked at the airport instead of online costs more per flight, each way.',
        provenance: LEAD(
            'Large sporting goods EUR 60 online / EUR 70 at the airport, up to 20 kg, EUR 13/kg over. No published length limit.',
            'https://help.ryanair.com/hc/en-gb/sections/12489254427665-Sports-Music-Equipment-Luggage',
        ),
    },
    {
        carrier: 'SNCF (TGV INOUI / Intercités)',
        mode: 'train',
        allowed: true,
        feeOnlineEur: 0, feeAtDepartureEur: 0,
        // The number that matters: a common 140 cm board plus a bag is over this.
        maxLengthCm: 130,
        maxWeightKg: null,
        excessEurPerKg: null,
        mustDeclareInAdvance: false,
        penaltyNote: 'Non-conforming baggage is penalised EUR 50-150 per item. Bags must be labelled with name and phone number.',
        provenance: LEAD(
            'Special baggage (sports equipment) max 90 x 130 x 50 cm, carried free but must not obstruct the aisle.',
            'https://www.sncf-connect.com/aide/transport-de-vos-bagages',
        ),
    },
    {
        carrier: 'easyJet',
        mode: 'plane',
        allowed: true,
        feeOnlineEur: 50, feeAtDepartureEur: 60,
        // Generous on length: a board bag is nowhere near this.
        maxLengthCm: 275,
        maxWeightKg: 32,
        excessEurPerKg: null,
        mustDeclareInAdvance: true,
        penaltyNote: 'One piece of sports equipment per passenger. Adding it at the airport costs more.',
        provenance: LEAD(
            'Large sports equipment EUR 50 online / EUR 60 at the airport per flight, up to 32 kg and 275 cm.',
            'https://www.airline-baggage-fees.com/sports/surfboards/easyjet.html',
        ),
    },
    {
        carrier: 'Deutsche Bahn (ICE / long distance)',
        mode: 'train',
        allowed: true,
        // Free, and long enough that a board actually fits — unlike SNCF.
        feeOnlineEur: 0, feeAtDepartureEur: 0,
        maxLengthCm: 200,
        maxWeightKg: null,
        excessEurPerKg: null,
        mustDeclareInAdvance: false,
        penaltyNote: 'Carried only if there is room to stow it safely — no reservation for luggage.',
        provenance: LEAD(
            'Properly packed sports equipment up to 200 x 50 x 30 cm, no charge on long-distance services.',
            'https://www.eurosender.com/en/train/db-baggage-allowance',
        ),
    },
    // Shape is in place; these need a phone call or an unblocked browser.
    ...(['Vueling', 'Transavia', 'Air France'] as const).map((carrier): CarrierBoardRule => ({
        carrier, mode: 'plane',
        allowed: null, feeOnlineEur: null, feeAtDepartureEur: null,
        maxLengthCm: null, maxWeightKg: null, excessEurPerKg: null,
        mustDeclareInAdvance: null, penaltyNote: null,
        provenance: { kind: 'third_party', sourceUrl: null, checkedOn: null, note: 'Not researched yet.' },
    })),
    ...(['Renfe', 'Trenitalia', 'Eurostar'] as const).map((carrier): CarrierBoardRule => ({
        carrier, mode: 'train',
        allowed: null, feeOnlineEur: null, feeAtDepartureEur: null,
        maxLengthCm: null, maxWeightKg: null, excessEurPerKg: null,
        mustDeclareInAdvance: null, penaltyNote: null,
        provenance: { kind: 'third_party', sourceUrl: null, checkedOn: null, note: 'Not researched yet.' },
    })),
    ...(['Brittany Ferries', 'DFDS', 'Baleària', 'Corsica Linea'] as const).map((carrier): CarrierBoardRule => ({
        carrier, mode: 'ferry',
        allowed: null, feeOnlineEur: null, feeAtDepartureEur: null,
        maxLengthCm: null, maxWeightKg: null, excessEurPerKg: null,
        mustDeclareInAdvance: null, penaltyNote: null,
        provenance: { kind: 'third_party', sourceUrl: null, checkedOn: null, note: 'Not researched yet.' },
    })),
    ...(['FlixBus', 'BlaBlaCar Bus'] as const).map((carrier): CarrierBoardRule => ({
        carrier, mode: 'coach',
        allowed: null, feeOnlineEur: null, feeAtDepartureEur: null,
        maxLengthCm: null, maxWeightKg: null, excessEurPerKg: null,
        mustDeclareInAdvance: null, penaltyNote: null,
        provenance: { kind: 'third_party', sourceUrl: null, checkedOn: null, note: 'Not researched yet.' },
    })),
];

export const findCarrierRule = (carrier: string): CarrierBoardRule | undefined => (
    CARRIER_RULES.find((rule) => rule.carrier.toLowerCase() === carrier.trim().toLowerCase())
);

export const rulesForMode = (mode: CarrierMode): CarrierBoardRule[] => (
    CARRIER_RULES.filter((rule) => rule.mode === mode)
);

// ─────────────────────────────────────────────────────────────────────────────
// The verdict
// ─────────────────────────────────────────────────────────────────────────────

export type CarriageVerdict =
    | 'FINE'            // goes, free, no conditions
    | 'FEE_APPLIES'     // goes, at a price we know
    | 'MUST_BOOK'       // goes, but only if declared in advance
    | 'OVER_LIMIT'      // exceeds a published limit — the trap
    | 'NOT_ALLOWED'
    | 'UNKNOWN';        // nobody has checked. Warn, never assume yes.

export interface CarriageAssessment {
    verdict: CarriageVerdict;
    /** Per rider, per leg. Null when unknown — never zero by default. */
    costEur: number | null;
    /** Plain sentence for the card. */
    message: string;
    /** True when the user should confirm before booking. */
    confirmBeforeBooking: boolean;
    rule: CarrierBoardRule;
}

export const assessCarriage = (
    rule: CarrierBoardRule,
    board: BoardSpec,
): CarriageAssessment => {
    const length = effectiveLengthCm(board);
    const unverified = rule.provenance.kind === 'third_party';

    if (rule.allowed === null) {
        return {
            verdict: 'UNKNOWN', costEur: null, rule, confirmBeforeBooking: true,
            message: `${rule.carrier}: board carriage not researched yet. Call before you book — this is the leg that ends trips.`,
        };
    }
    if (rule.allowed === false) {
        return {
            verdict: 'NOT_ALLOWED', costEur: null, rule, confirmBeforeBooking: true,
            message: `${rule.carrier} does not carry boards. You need another leg.`,
        };
    }

    // The published-limit collision. This is the whole point of the dataset.
    if (rule.maxLengthCm !== null && length > rule.maxLengthCm) {
        const over = Math.round(length - rule.maxLengthCm);
        return {
            verdict: 'OVER_LIMIT', costEur: null, rule, confirmBeforeBooking: true,
            message: `Your board${board.bagged ? ' in its bag' : ''} is ${Math.round(length)} cm — ${over} cm over ${rule.carrier}'s ${rule.maxLengthCm} cm limit.`
                + (rule.penaltyNote ? ` ${rule.penaltyNote}` : ''),
        };
    }

    const fee = rule.feeOnlineEur;
    if (fee !== null && fee > 0) {
        const atDesk = rule.feeAtDepartureEur;
        return {
            verdict: rule.mustDeclareInAdvance ? 'MUST_BOOK' : 'FEE_APPLIES',
            costEur: fee, rule, confirmBeforeBooking: unverified,
            message: `${rule.carrier}: €${fee} per board, each way, booked online`
                + (atDesk !== null && atDesk > fee ? ` — €${atDesk} if you leave it to the airport.` : '.')
                + (rule.mustDeclareInAdvance ? ' Must be added before you travel.' : ''),
        };
    }

    return {
        verdict: 'FINE', costEur: 0, rule, confirmBeforeBooking: unverified,
        message: rule.provenance.kind === 'physical_fact'
            ? 'Goes in the car. No fee, no limit, no paperwork.'
            : `${rule.carrier}: carried free within the stated limits.`,
    };
};

/** Cheapest workable way to get the board on this mode, worst case surfaced. */
export const bestCarrierForMode = (
    mode: CarrierMode,
    board: BoardSpec,
): CarriageAssessment | null => {
    const assessed = rulesForMode(mode).map((rule) => assessCarriage(rule, board));
    const workable = assessed.filter((a) => a.verdict === 'FINE' || a.verdict === 'FEE_APPLIES' || a.verdict === 'MUST_BOOK');
    if (workable.length === 0) {
        return assessed[0] ?? null;
    }
    return workable.sort((a, b) => (a.costEur ?? Infinity) - (b.costEur ?? Infinity))[0];
};

/** Coverage, for the research backlog. */
export const ruleCoverage = (): { total: number; researched: number; byMode: Record<CarrierMode, number> } => {
    const byMode = { car: 0, plane: 0, train: 0, ferry: 0, coach: 0 } as Record<CarrierMode, number>;
    let researched = 0;
    for (const rule of CARRIER_RULES) {
        if (rule.allowed !== null) {
            researched += 1;
            byMode[rule.mode] += 1;
        }
    }
    return { total: CARRIER_RULES.length, researched, byMode };
};
