// Trip Ledger — a multi-stop, door-to-door trip cost model.
// Honest-pricing rules apply: every line is EXACT, ESTIMATED, or CHECK
// (unknown until the user fills it in). Unknown lines are surfaced, never
// silently dropped, and the grand total is labelled "so far" while any remain.

export type LedgerStatus = 'EXACT' | 'ESTIMATED' | 'CHECK';

export interface LedgerLine {
    id: string;
    label: string;
    /** Group total unless perPerson is set. null = unknown (CHECK). */
    amount: number | null;
    status: LedgerStatus;
    note?: string;
    /** Multiply by the traveller count for the group total. */
    perPerson?: boolean;
    /** Travellers on THIS line when it differs from the party default
     *  (e.g. only 3 booked on a flight). Editable in the UI. */
    pax?: number;
    /** Renders partner booking links for flight lines. */
    booking?: { origin: string; destination: string; date: string };
}

export type LedgerSegmentKind = 'drive' | 'fly' | 'stay' | 'activity' | 'parking';

export interface LedgerSegment {
    id: string;
    /** Display date or range, e.g. "Thu 30 Jul" or "Sun 2 – Sat 8 Aug". */
    when: string;
    title: string;
    kind: LedgerSegmentKind;
    lines: LedgerLine[];
    /** Honest context note shown under the segment. */
    info?: string;
}

export interface LedgerPhase {
    id: string;
    title: string;
    segments: LedgerSegment[];
}

export interface TripLedgerModel {
    id: string;
    title: string;
    partyLabel: string;
    /** Travellers that pay a fare/seat (a 3-year-old pays child fare on airlines). */
    payingTravellers: number;
    phases: LedgerPhase[];
    /** Costs deliberately outside the total — must stay visible (core rule). */
    excluded: string[];
}

/** User overrides for a line, persisted locally. All fields optional so a
 *  pax tweak doesn't clobber an amount edit and vice versa. */
export interface LedgerOverride {
    amount?: number | null;
    status?: LedgerStatus;
    pax?: number;
}

export type LedgerOverrides = Record<string, LedgerOverride>;

export const LEDGER_STORAGE_KEY = 'trip-ledger-alps-ibiza-2026';

export interface LedgerTotals {
    exact: number;
    estimated: number;
    /** exact + estimated — the honest "total so far". */
    knownTotal: number;
    unknownCount: number;
}

export const effectiveLine = (line: LedgerLine, overrides: LedgerOverrides): LedgerLine => {
    const override = overrides[line.id];
    if (!override) {
        return line;
    }
    return {
        ...line,
        ...('amount' in override ? { amount: override.amount ?? null } : {}),
        ...(override.status !== undefined ? { status: override.status } : {}),
        ...(override.pax !== undefined ? { pax: override.pax } : {}),
    };
};

/** Travellers this line multiplies by: its own pax, else the party default. */
export const linePax = (line: LedgerLine, payingTravellers: number): number => (
    line.pax ?? payingTravellers
);

export const lineGroupAmount = (line: LedgerLine, payingTravellers: number): number | null => {
    if (line.amount == null) {
        return null;
    }
    return line.perPerson ? line.amount * linePax(line, payingTravellers) : line.amount;
};

export const computeTotals = (model: TripLedgerModel, overrides: LedgerOverrides): LedgerTotals => {
    let exact = 0;
    let estimated = 0;
    let unknownCount = 0;
    for (const phase of model.phases) {
        for (const segment of phase.segments) {
            for (const rawLine of segment.lines) {
                const line = effectiveLine(rawLine, overrides);
                const group = lineGroupAmount(line, model.payingTravellers);
                if (group == null) {
                    unknownCount += 1;
                } else if (line.status === 'EXACT') {
                    exact += group;
                } else {
                    estimated += group;
                }
            }
        }
    }
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
        exact: round(exact),
        estimated: round(estimated),
        knownTotal: round(exact + estimated),
        unknownCount,
    };
};

// ── User-built ledger document ──────────────────────────────────────────────
// The whole model (structure + numbers) is user-editable and persisted, so
// adding a destination is a form action, not a code change. The seed below is
// only the starting template; "Reset" returns to it.

export const LEDGER_DOC_KEY = 'trip-ledger-doc-v2';

/** ~7 L/100 km at ~€1.85/L. */
export const FUEL_EUR_PER_KM = 0.13;
/** French autoroute average; short hops (< 80 km) are usually toll-free. */
export const TOLL_EUR_PER_KM = 0.085;
const TOLL_FREE_BELOW_KM = 80;

export interface NewStopInput {
    kind: LedgerSegmentKind;
    title: string;
    when: string;
    /** drive: distance → auto fuel/toll estimates. */
    km?: number | null;
    /** fly: IATA codes + date → per-person fare line with booking links. */
    origin?: string;
    destination?: string;
    date?: string;
}

const KIND_DEFAULT_LINE_LABEL: Record<LedgerSegmentKind, string> = {
    drive: 'Trip cost',
    fly: 'Flight (per person)',
    stay: 'Accommodation',
    activity: 'Activity cost',
    parking: 'Parking',
};

export const createSegment = (input: NewStopInput, idSeed: string = `${Date.now()}`): LedgerSegment => {
    const id = `custom-${idSeed}`;
    const lines: LedgerLine[] = [];
    if (input.kind === 'drive' && input.km != null && input.km > 0) {
        lines.push({ id: `${id}-fuel`, label: `Fuel (~${Math.round(input.km)} km)`, amount: Math.round(input.km * FUEL_EUR_PER_KM), status: 'ESTIMATED' });
        if (input.km >= TOLL_FREE_BELOW_KM) {
            lines.push({ id: `${id}-tolls`, label: 'Tolls (motorway estimate)', amount: Math.round(input.km * TOLL_EUR_PER_KM), status: 'ESTIMATED' });
        }
    } else if (input.kind === 'fly' && input.origin && input.destination) {
        lines.push({
            id: `${id}-fare`,
            label: `Flight ${input.origin.toUpperCase()} → ${input.destination.toUpperCase()} (per person)`,
            amount: null,
            status: 'CHECK',
            perPerson: true,
            booking: input.date
                ? { origin: input.origin.toUpperCase(), destination: input.destination.toUpperCase(), date: input.date }
                : undefined,
        });
    } else {
        lines.push({ id: `${id}-main`, label: KIND_DEFAULT_LINE_LABEL[input.kind], amount: null, status: 'CHECK' });
    }
    return { id, when: input.when, title: input.title, kind: input.kind, lines };
};

export const createPhase = (title: string, idSeed: string = `${Date.now()}`): LedgerPhase => ({
    id: `custom-phase-${idSeed}`,
    title,
    segments: [],
});

/** Bakes legacy per-line overrides into a model (v1 → v2 migration). */
export const applyOverridesToModel = (model: TripLedgerModel, overrides: LedgerOverrides): TripLedgerModel => ({
    ...model,
    phases: model.phases.map((phase) => ({
        ...phase,
        segments: phase.segments.map((segment) => ({
            ...segment,
            lines: segment.lines.map((line) => effectiveLine(line, overrides)),
        })),
    })),
});

export const loadDocument = (seed: TripLedgerModel): TripLedgerModel => {
    try {
        const raw = window.localStorage.getItem(LEDGER_DOC_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as TripLedgerModel;
            if (parsed && Array.isArray(parsed.phases)) {
                return parsed;
            }
        }
    } catch {
        // fall through to seed
    }
    return applyOverridesToModel(seed, loadOverrides());
};

export const saveDocument = (model: TripLedgerModel): void => {
    try {
        window.localStorage.setItem(LEDGER_DOC_KEY, JSON.stringify(model));
    } catch {
        // Storage unavailable — edits just won't persist.
    }
};

export const clearDocument = (): void => {
    try {
        window.localStorage.removeItem(LEDGER_DOC_KEY);
        window.localStorage.removeItem(LEDGER_STORAGE_KEY);
    } catch {
        // ignore
    }
};

export const loadOverrides = (): LedgerOverrides => {
    try {
        const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as LedgerOverrides) : {};
    } catch {
        return {};
    }
};

export const saveOverrides = (overrides: LedgerOverrides): void => {
    try {
        window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(overrides));
    } catch {
        // Storage unavailable (private mode) — edits just won't persist.
    }
};

// ── Seed itinerary: Limerick → La Clusaz + Ibiza, 30 Jul – 16 Aug 2026 ──────
// Driving estimates use ~7 L/100 km at ~€1.85/L plus current French autoroute
// tolls; all are ESTIMATED and editable. Fares are CHECK until booked.

export const ALPS_IBIZA_2026: TripLedgerModel = {
    id: 'alps-ibiza-2026',
    title: 'Alps + Ibiza — summer 2026',
    partyLabel: '3 adults + 1 child (3 yrs)',
    payingTravellers: 4,
    excluded: [
        'Food and drink (excluded from total)',
        'La Clusaz activities other than TNA wakeboard sessions',
        'Ibiza beach clubs / boat trips',
    ],
    phases: [
        {
            id: 'getting-there',
            title: 'Getting there',
            segments: [
                {
                    id: 'snn-parking',
                    when: 'Thu 30 Jul → Sun 16 Aug',
                    title: 'Drive Limerick → Shannon, long-term parking',
                    kind: 'parking',
                    info: 'Your own car waits at SNN — no taxi needed on the late return, whatever hour you land.',
                    lines: [
                        { id: 'parking-snn', label: 'Shannon Airport parking (18 days)', amount: 198, status: 'EXACT', note: 'Booked price you provided.' },
                        { id: 'fuel-limerick-snn', label: 'Fuel Limerick ⇄ Shannon (2 × 25 km)', amount: 7, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'fly-out',
                    when: 'Thu 30 Jul',
                    title: 'Fly Shannon → Paris',
                    kind: 'fly',
                    info: 'Verify which Paris airport your fare lands at — Beauvais adds ~€17 pp and 1h15 by shuttle to the city.',
                    lines: [
                        {
                            id: 'flight-snn-paris', label: 'Flight Shannon → Paris (per person)', amount: null, status: 'CHECK', perPerson: true, pax: 3,
                            note: 'Booked for 3 — adjust the traveller count if that changes. Enter the per-person price incl. bags.',
                            booking: { origin: 'SNN', destination: 'BVA', date: '2026-07-30' },
                        },
                    ],
                },
                {
                    id: 'paris-night-1',
                    when: 'Thu 30 Jul',
                    title: 'Night in Paris — family',
                    kind: 'stay',
                    lines: [
                        { id: 'stay-paris-1', label: 'Family stay', amount: 0, status: 'EXACT' },
                    ],
                },
            ],
        },
        {
            id: 'road-to-alps',
            title: 'Road to the Alps',
            segments: [
                {
                    id: 'car-france',
                    when: 'Fri 31 Jul → Sat 8 Aug',
                    title: 'Car for the France legs',
                    kind: 'drive',
                    info: 'Family car or rental? If renting: August rates from Paris run €350–€600/week for a family car — enter your quote.',
                    lines: [
                        { id: 'car-hire', label: 'Car (rental or borrow)', amount: null, status: 'CHECK' },
                    ],
                },
                {
                    id: 'paris-nsg',
                    when: 'Fri 31 Jul',
                    title: 'Drive Paris → Nuits-Saint-Georges (~315 km, A6)',
                    kind: 'drive',
                    lines: [
                        { id: 'fuel-paris-nsg', label: 'Fuel', amount: 41, status: 'ESTIMATED' },
                        { id: 'tolls-paris-nsg', label: 'Autoroute tolls (A6)', amount: 26, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'nsg-stay',
                    when: 'Fri 31 Jul',
                    title: 'Kyriad Nuits-Saint-Georges — 1 night',
                    kind: 'stay',
                    lines: [
                        {
                            id: 'stay-nsg', label: 'Room(s) for 3 adults + child', amount: 130, status: 'ESTIMATED',
                            note: 'Price shown per stay estimate. Verify at booking for your group size — Kyriad triples/quads vary.',
                        },
                    ],
                },
                {
                    id: 'nsg-annecy',
                    when: 'Sat 1 Aug',
                    title: 'Drive Nuits-Saint-Georges → Annecy (~250 km, A6/A40/A41)',
                    kind: 'drive',
                    lines: [
                        { id: 'fuel-nsg-annecy', label: 'Fuel', amount: 32, status: 'ESTIMATED' },
                        { id: 'tolls-nsg-annecy', label: 'Autoroute tolls', amount: 21, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'annecy-stay',
                    when: 'Sat 1 Aug',
                    title: 'Annecy — 1 night',
                    kind: 'stay',
                    info: 'Peak-season Saturday on the lake — book early; family rooms in August go fast.',
                    lines: [
                        { id: 'stay-annecy', label: 'Hotel night (3 adults + child)', amount: null, status: 'CHECK' },
                    ],
                },
            ],
        },
        {
            id: 'la-clusaz',
            title: 'La Clusaz week',
            segments: [
                {
                    id: 'annecy-laclusaz',
                    when: 'Sun 2 Aug',
                    title: 'Drive Annecy → La Clusaz (~32 km, no tolls)',
                    kind: 'drive',
                    lines: [
                        { id: 'fuel-annecy-lcz', label: 'Fuel', amount: 5, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'chalet',
                    when: 'Sun 2 → Sat 8 Aug',
                    title: 'Chalet La Clusaz — 6 nights (booked)',
                    kind: 'stay',
                    lines: [
                        { id: 'stay-chalet', label: 'Chalet rental', amount: null, status: 'CHECK', note: 'Already booked — enter the price you paid.' },
                    ],
                },
                {
                    id: 'tna',
                    when: 'During the week',
                    title: 'Wakeboard at TNA (Téléski Nautique, Lake Annecy — Sevrier)',
                    kind: 'activity',
                    info: 'Cable park ~40 min drive from La Clusaz. Sessions are typically ~€25–30/hour — check current rates and opening days.',
                    lines: [
                        { id: 'tna-sessions', label: 'TNA sessions (2 × ~€30)', amount: 60, status: 'ESTIMATED' },
                        { id: 'fuel-tna', label: 'Fuel La Clusaz ⇄ Sevrier (2 trips)', amount: 20, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'lcz-paris',
                    when: 'Sat 8 Aug',
                    title: 'Drive La Clusaz → Paris (~580 km, A40/A6)',
                    kind: 'drive',
                    info: 'First August Saturday is the worst French traffic day of the year (Bison Futé black). Leave very early.',
                    lines: [
                        { id: 'fuel-lcz-paris', label: 'Fuel', amount: 75, status: 'ESTIMATED' },
                        { id: 'tolls-lcz-paris', label: 'Autoroute tolls', amount: 48, status: 'ESTIMATED' },
                    ],
                },
                {
                    id: 'paris-night-2',
                    when: 'Sat 8 Aug',
                    title: 'Night in Paris — family',
                    kind: 'stay',
                    lines: [
                        { id: 'stay-paris-2', label: 'Family stay', amount: 0, status: 'EXACT' },
                    ],
                },
            ],
        },
        {
            id: 'ibiza',
            title: 'Ibiza week',
            segments: [
                {
                    id: 'fly-ibiza',
                    when: 'Sun 9 Aug',
                    title: 'Fly Paris → Ibiza',
                    kind: 'fly',
                    info: 'Orly (Vueling/Transavia) is usually the practical Paris airport for Ibiza; Beauvais (Ryanair) can be cheaper.',
                    lines: [
                        {
                            id: 'flight-paris-ibz', label: 'Flight Paris → Ibiza (per person)', amount: null, status: 'CHECK', perPerson: true,
                            booking: { origin: 'ORY', destination: 'IBZ', date: '2026-08-09' },
                        },
                    ],
                },
                {
                    id: 'ibiza-stay',
                    when: 'Sun 9 → Sat 15 Aug',
                    title: 'Ibiza — 6 nights',
                    kind: 'stay',
                    lines: [
                        { id: 'stay-ibiza', label: 'Accommodation (6 nights)', amount: null, status: 'CHECK' },
                    ],
                },
                {
                    id: 'fly-back-paris',
                    when: 'Sat 15 Aug',
                    title: 'Fly Ibiza → Paris',
                    kind: 'fly',
                    lines: [
                        {
                            id: 'flight-ibz-paris', label: 'Flight Ibiza → Paris (per person)', amount: null, status: 'CHECK', perPerson: true,
                            booking: { origin: 'IBZ', destination: 'ORY', date: '2026-08-15' },
                        },
                    ],
                },
                {
                    id: 'paris-night-3',
                    when: 'Sat 15 Aug',
                    title: 'Night in Paris — family',
                    kind: 'stay',
                    lines: [
                        { id: 'stay-paris-3', label: 'Family stay', amount: 0, status: 'EXACT' },
                    ],
                },
            ],
        },
        {
            id: 'home',
            title: 'Home',
            segments: [
                {
                    id: 'fly-home',
                    when: 'Sun 16 Aug',
                    title: 'Fly Paris → Shannon, drive home to Limerick',
                    kind: 'fly',
                    info: 'Late arrival friction does not apply — your car is parked at Shannon.',
                    lines: [
                        {
                            id: 'flight-paris-snn', label: 'Flight Paris → Shannon (per person)', amount: null, status: 'CHECK', perPerson: true,
                            booking: { origin: 'BVA', destination: 'SNN', date: '2026-08-16' },
                        },
                    ],
                },
            ],
        },
    ],
};
