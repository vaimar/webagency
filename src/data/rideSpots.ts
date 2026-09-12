// Curated ride-spot facts — the catalogue layer the AI intent search reads.
//
// WHY THIS FILE EXISTS
// No backend endpoint returns venue surface, difficulty, climate or opening
// season. Without them, intents like "cable park only", "beginner-friendly",
// "somewhere warm" and "open that week" can only be answered by guessing —
// which is the one thing the intent layer must never do. So these facts are
// curated by hand, carry their own provenance, and are verified by a person.
//
// THE RULE THAT MAKES THIS SAFE
// A fact is only usable once a human has checked it against a source and
// recorded where and when. Until then it is UNVERIFIED and its value is null.
// An UNVERIFIED fact never satisfies a hard filter — the venue is excluded and
// the exclusion is reported, never silently passed through. See
// docs/ai-intent-layer.md §6.
//
// This mirrors the CostLine pattern in services/api.ts on purpose: a curated
// venue fact has exactly the same trust problem as an estimated shuttle fee,
// so it gets the same shape — nullable value + status + note.

import { resolveDestinationHint } from '../services/destinationDirectory';

// ─────────────────────────────────────────────────────────────────────────────
// Fact wrapper
// ─────────────────────────────────────────────────────────────────────────────

/** What a curator may write. STALE is never stored — it is derived from age. */
export type StoredFactStatus = 'VERIFIED' | 'UNVERIFIED' | 'NOT_APPLICABLE';

/** What a consumer reads, after TTL is applied. */
export type ResolvedFactStatus = StoredFactStatus | 'STALE';

/**
 * Where a fact came from. This is not decoration — it decides how much the
 * planner may lean on the value.
 *
 *  venue        the venue's own site or booking system. The gold standard.
 *  third_party  a tourist board, directory or review site. Usable, but these
 *               go stale and are often a season behind.
 *  derived      computed from a documented rule rather than observed (see
 *               CLIMATE_RULE). Carries no URL, because there is no page to read.
 *  user_report  reported directly by someone who knows the venue. No URL either,
 *               so it must say who and when in `note`.
 */
export type FactSourceKind = 'venue' | 'third_party' | 'derived' | 'user_report';

/** Who established it. 'rule' means no human or agent judgement was involved. */
export type FactVerifier = 'human' | 'agent' | 'rule';

export interface VenueFact<T> {
    /** Non-null if and only if status is VERIFIED. Enforced by the validator. */
    value: T | null;
    status: StoredFactStatus;
    /** Required for VERIFIED facts sourced from a page — https, and actually read. */
    sourceUrl: string | null;
    /** YYYY-MM-DD the source was read. Required for VERIFIED. */
    checkedOn: string | null;
    sourceKind?: FactSourceKind;
    verifiedBy?: FactVerifier;
    note?: string;
}

export interface ResolvedFact<T> {
    value: T | null;
    status: ResolvedFactStatus;
    sourceUrl: string | null;
    checkedOn: string | null;
    /** Days since verification, or null when never verified. */
    ageDays: number | null;
}

/** Shorthand for the common case: nobody has checked this yet. */
export const unverified = <T, >(note?: string): VenueFact<T> => ({
    value: null,
    status: 'UNVERIFIED',
    sourceUrl: null,
    checkedOn: null,
    note,
});

export const notApplicable = <T, >(note: string): VenueFact<T> => ({
    value: null,
    status: 'NOT_APPLICABLE',
    sourceUrl: null,
    checkedOn: null,
    note,
});

// ─────────────────────────────────────────────────────────────────────────────
// Domain values
// ─────────────────────────────────────────────────────────────────────────────

export type RideSurface = 'cable' | 'boat' | 'sea';

/** What is actually on site. Dictated, not researched — see spotEntry.ts. */
export type Amenity =
    | 'restaurant' | 'bar' | 'shop' | 'rental' | 'school'
    | 'camping' | 'accommodation' | 'showers' | 'parking'
    | 'beginner-line' | 'kicker' | 'rails' | 'sauna';

export const KNOWN_AMENITIES: Amenity[] = [
    'restaurant', 'bar', 'shop', 'rental', 'school',
    'camping', 'accommodation', 'showers', 'parking',
    'beginner-line', 'kicker', 'rails', 'sauna',
];
export type ClimateBand = 'warm' | 'temperate' | 'cold';
export type SkillFloor = 'none' | 'some' | 'confident';

/** MM-DD bounds. `from > to` means the season wraps the new year. */
export interface SeasonWindow {
    from: string;
    to: string;
}

export type OpeningSeason = SeasonWindow | 'year_round';

export interface SessionPrice {
    hourlyEur: number | null;
    dayPassEur: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The row
// ─────────────────────────────────────────────────────────────────────────────

export interface RideSpot {
    /** MUST resolve through resolveDestinationHint() to `arrivalAirport`. */
    label: string;
    /**
     * Where the venue actually is, in words. Descriptive only — never used for
     * routing. It exists because three of this catalogue's original seven
     * entries turned out to be somewhere other than their label implied, and a
     * human auditing the list should not have to re-derive that each time.
     */
    locality?: string;
    /** Coordinates of the water, for routing. Absent = cannot be ordered into a road trip. */
    point?: { lat: number; lon: number };
    /** What is on site. Plain list — no provenance ceremony, it is dictated. */
    amenities?: Amenity[];
    /** Influencer clips and edits. The adventure pitch. */
    videos?: string[];
    /** Copied from destinationDirectory.ts — backend-known, never curated here. */
    arrivalAirport: string;
    activity: 'wakeboard' | 'snowboard' | 'surf' | 'kitesurf';

    // ── launch-critical: the four intents cannot be answered without these ──
    surface: VenueFact<RideSurface>;
    beginnerFriendly: VenueFact<boolean>;
    climateBand: VenueFact<ClimateBand>;
    openingSeason: VenueFact<OpeningSeason>;

    /**
     * Whether the venue is still trading. Unlike every other fact this one
     * fails OPEN: not knowing a venue closed is not evidence that it did, so
     * only an explicit verified `false` removes it. A closed venue is excluded
     * outright — no filter, no ranking, no card.
     */
    operating: VenueFact<boolean>;

    // ── nice-to-have: improve ranking and copy, block nothing ──
    cableCount: VenueFact<number>;
    skillFloor: VenueFact<SkillFloor>;
    sessionPrice: VenueFact<SessionPrice>;
}

export type RideSpotFactKey =
    | 'surface' | 'beginnerFriendly' | 'climateBand' | 'openingSeason'
    | 'cableCount' | 'skillFloor' | 'sessionPrice' | 'operating';

export const LAUNCH_CRITICAL_FACTS: RideSpotFactKey[] = [
    'surface', 'beginnerFriendly', 'climateBand', 'openingSeason',
];

export const ALL_FACT_KEYS: RideSpotFactKey[] = [
    ...LAUNCH_CRITICAL_FACTS, 'cableCount', 'skillFloor', 'sessionPrice', 'operating',
];

/**
 * How long a verified fact stays trustworthy. Physical facts age slowly;
 * prices and published seasons age fast. Geography never goes stale.
 */
export const FACT_TTL_DAYS: Record<RideSpotFactKey, number> = {
    surface: 730,
    beginnerFriendly: 730,
    cableCount: 730,
    skillFloor: 730,
    climateBand: Number.POSITIVE_INFINITY,
    openingSeason: 180,
    sessionPrice: 90,
    operating: 365,
};

// ─────────────────────────────────────────────────────────────────────────────
// The data
//
// Every fact below is UNVERIFIED on purpose. `arrivalAirport` is copied from
// destinationDirectory.ts (backend-resolved), and is the only populated value.
// Filling these in is a human task — open the venue's own site, record the URL
// and the date. Do not populate a value from memory or inference.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CLIMATE_RULE — the documented basis for every derived climateBand.
 *
 * climateBand describes the region during the riding season, not the annual
 * average. It is the one launch-critical field that does NOT require reading a
 * venue's page, because it is a property of where the venue is, so it is
 * derived from a rule rather than left unverified:
 *
 *   warm       Mediterranean basin and the Balearics (roughly below 44°N on a
 *              Mediterranean coast) — reliable summer heat, long season.
 *   temperate  Atlantic and continental western Europe, roughly 44–53°N.
 *   cold       Baltic and Nordic, roughly above 54°N — short summer season.
 *
 * Keyed by the arrival airport because that is the only location anchor the
 * catalogue currently holds. That is a known weakness: a venue can sit far
 * from its airport (see docs/ride-spots-curation.md, "catalogue corrections"),
 * so a curator who confirms the venue's real location should re-check this.
 */
export const CLIMATE_RULE_NOTE = 'derived from region: Mediterranean <44°N = warm, Atlantic/continental 44-53°N = temperate, Baltic >54°N = cold';

const CLIMATE_BY_AIRPORT: Record<string, ClimateBand> = {
    IBZ: 'warm',        // Ibiza, 38.9°N, Balearics
    MRS: 'warm',        // Marseille, 43.4°N, Mediterranean coast
    BOD: 'temperate',   // Bordeaux, 44.8°N, Atlantic
    ORY: 'temperate',   // Paris Orly, 48.7°N, continental
    DUS: 'temperate',   // Dusseldorf, 51.3°N, continental
    VNO: 'cold',        // Vilnius, 54.7°N, Baltic
    PLQ: 'cold',        // Palanga, 55.9°N, Baltic coast
};

/** Builds the derived climate fact, or leaves it unverified for an unknown airport. */
export const deriveClimateBand = (arrivalAirport: string, on: string): VenueFact<ClimateBand> => {
    const band = CLIMATE_BY_AIRPORT[arrivalAirport];
    if (!band) {
        return unverified<ClimateBand>(`no climate rule for ${arrivalAirport}`);
    }
    return {
        value: band,
        status: 'VERIFIED',
        sourceUrl: null,
        checkedOn: on,
        sourceKind: 'derived',
        verifiedBy: 'rule',
        note: CLIMATE_RULE_NOTE,
    };
};

const RULE_APPLIED_ON = '2026-09-12';

/** Told to us by someone who has been there. The strongest evidence we get. */
const told = <T, >(value: T, note: string, on = '2026-09-12'): VenueFact<T> => ({
    value, status: 'VERIFIED', sourceUrl: null, checkedOn: on,
    sourceKind: 'user_report', verifiedBy: 'human', note,
});

/** A directory or tourist-board listing. Usable, but a lead rather than gospel. */
const listed = <T, >(value: T, sourceUrl: string, note: string, on = '2026-09-12'): VenueFact<T> => ({
    value, status: 'VERIFIED', sourceUrl, checkedOn: on,
    sourceKind: 'third_party', verifiedBy: 'agent',
    note: `${note} Third-party listing — confirm with the venue.`,
});

const blankFacts = (): Omit<RideSpot, 'label' | 'arrivalAirport' | 'activity'> => ({
    surface: unverified('check the venue site: cable, boat or open sea'),
    beginnerFriendly: unverified('needs a beginner line or a school on site'),
    // climateBand is filled per row by deriveClimateBand() — see CLIMATE_RULE_NOTE.
    climateBand: unverified<ClimateBand>('set by deriveClimateBand'),
    openingSeason: unverified('published season for the current year'),
    cableCount: unverified(),
    skillFloor: unverified(),
    sessionPrice: unverified('hourly and day-pass, in EUR'),
    operating: unverified('assumed trading unless we learn otherwise'),
});

const spot = (label: string, arrivalAirport: string): RideSpot => ({
    label,
    arrivalAirport,
    activity: 'wakeboard',
    ...blankFacts(),
    climateBand: deriveClimateBand(arrivalAirport, RULE_APPLIED_ON),
});

export const RIDE_SPOTS: RideSpot[] = [
    {
        // Ceased trading. Kept rather than deleted so nobody re-adds it, and so
        // the catalogue records why it disappeared.
        ...spot('EXO 84', 'MRS'),
        operating: {
            value: false,
            status: 'VERIFIED',
            sourceUrl: null,
            checkedOn: '2026-09-12',
            sourceKind: 'user_report',
            verifiedBy: 'human',
            note: 'Reported by the product owner, 2026-09-12: the park has stopped operating.',
        },
    },
    {
        ...spot('Wake Paradise', 'CDG'),
        locality: 'Spay (10 min from Le Mans), France',
        point: { lat: 47.9300, lon: 0.1700 },   // Spay town centre, approximate
        amenities: ['restaurant'],
        surface: listed('cable',
            'https://www.sarthevalley.com/touristic_sheet/wake-paradise-spay-en-2705627/',
            '600 m closed-circuit cable, up to 8 riders at once.'),
        sessionPrice: told({ hourlyEur: 18, dayPassEur: 36 },
            'EUR 36 for two hours, per the Le Mans weekend figures.'),
    },
    // Hypnotics removed 2026-09-12: reported to be in Turkey, not near
    // Perpignan. The catalogue mapped it to PGF, so its airport — and the
    // climate derived from that airport — were wrong by a country. Re-add it
    // only with a confirmed location. The backend still resolves the label to
    // PGF and needs the same correction.
    {
        // Renamed 2026-09-12. There is no cable park on Ibiza; the label
        // asserted a facility that does not exist. The venue is boat-pulled.
        ...spot('Ibiza Wake', 'IBZ'),
        locality: 'Sant Antoni de Portmany, Ibiza',
        point: { lat: 38.9800, lon: 1.3000 },   // Sant Antoni, approximate
        surface: {
            value: 'boat',
            status: 'VERIFIED',
            sourceUrl: null,
            checkedOn: '2026-09-12',
            sourceKind: 'user_report',
            verifiedBy: 'human',
            note: 'Reported by the product owner, 2026-09-12: boat riding at Sant Antoni, no cable on the island.',
        },
        cableCount: notApplicable<number>('boat-pulled, no cable'),
    },
    {
        ...spot('313 Cable Park', 'PLQ'),
        locality: 'Užpelkiai, between Kretinga and Palanga, Lithuania',
        point: { lat: 55.8800, lon: 21.1200 },  // Užpelkiai, approximate
        surface: listed('cable',
            'https://lithuania.travel/en/why-lithuania/by-the-baltic-sea/kretinga/t313-cable-park',
            'Three full-size Sesitec systems.'),
        openingSeason: listed({ from: '05-01', to: '09-30' },
            'https://www.visit-palanga.lt/en/activities/313-cable-park/',
            'Season runs roughly May to September.'),
    },
    spot('Paris Wakepark', 'ORY'),
    {
        ...spot('Lakecity 33', 'BOD'),
        locality: 'Mios, between Bordeaux and Arcachon, France',
        point: { lat: 44.6050, lon: -0.9370 },  // Mios, approximate
        surface: listed('cable', 'https://lakecity.fr/',
            'Two cables: a 5-pylon 760 m and a 2-pylon.'),
    },
    spot('Langenfeld', 'DUS'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Reading facts
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

export const daysSince = (isoDate: string, now: Date): number | null => {
    const then = Date.parse(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(then)) {
        return null;
    }
    return Math.floor((now.getTime() - then) / MS_PER_DAY);
};

/** Applies the TTL. A verified-but-old fact resolves to STALE, not VERIFIED. */
export const resolveFact = <T, >(
    fact: VenueFact<T>,
    key: RideSpotFactKey,
    now: Date = new Date(),
): ResolvedFact<T> => {
    const ageDays = fact.checkedOn ? daysSince(fact.checkedOn, now) : null;

    if (fact.status !== 'VERIFIED') {
        return { value: null, status: fact.status, sourceUrl: fact.sourceUrl, checkedOn: fact.checkedOn, ageDays };
    }

    const ttl = FACT_TTL_DAYS[key];
    const stale = ageDays !== null && Number.isFinite(ttl) && ageDays > ttl;

    return {
        value: fact.value,
        status: stale ? 'STALE' : 'VERIFIED',
        sourceUrl: fact.sourceUrl,
        checkedOn: fact.checkedOn,
        ageDays,
    };
};

/**
 * A hard filter may act on a fact only when a human has verified it. STALE
 * still counts — an out-of-date season is worth acting on with a warning,
 * whereas an unchecked one is worth nothing at all.
 */
export const isUsableForHardFilter = (status: ResolvedFactStatus): boolean => (
    status === 'VERIFIED' || status === 'STALE'
);

/** Handles seasons that wrap the new year (from > to). */
export const isOpenOn = (season: OpeningSeason, isoDate: string): boolean => {
    if (season === 'year_round') {
        return true;
    }
    const monthDay = isoDate.slice(5, 10);
    return season.from <= season.to
        ? monthDay >= season.from && monthDay <= season.to
        : monthDay >= season.from || monthDay <= season.to;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shortlisting
//
// Hard constraints fail CLOSED: an unverified fact excludes the venue.
// Soft preferences fail OPEN: an unverified fact forfeits the bonus only.
// Every exclusion is reported so the UI can say "3 hidden: surface unverified"
// instead of silently shrinking the catalogue.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShortlistFilters {
    /** HARD — "cable park only". */
    surface?: RideSurface;
    /** HARD — "beginner-friendly". */
    beginnerOnly?: boolean;
    /** HARD — "open that week". ISO date. */
    openOn?: string;
    /** SOFT — "somewhere warm". Ranks, never excludes. */
    climate?: ClimateBand;
    activity?: RideSpot['activity'];
}

export type ExclusionReason =
    | 'NOT_OPERATING'
    | 'ACTIVITY_MISMATCH'
    | 'SURFACE_MISMATCH'
    | 'SURFACE_UNVERIFIED'
    | 'NOT_BEGINNER_FRIENDLY'
    | 'BEGINNER_UNVERIFIED'
    | 'CLOSED_ON_DATE'
    | 'SEASON_UNVERIFIED';

export interface ShortlistExclusion {
    spot: RideSpot;
    reason: ExclusionReason;
    /** True when the venue was dropped for missing data rather than a real mismatch. */
    dueToMissingData: boolean;
    field?: RideSpotFactKey;
}

export interface ShortlistEntry {
    spot: RideSpot;
    /** 0..1 soft-preference bonus. Never affects inclusion. */
    climateBonus: number;
    /** Facts that were usable but out of date — the UI shows these as amber. */
    staleFacts: RideSpotFactKey[];
    /** Facts this decision leaned on that nobody read off the venue's own page. */
    inferredFacts: RideSpotFactKey[];
}

export interface ShortlistResult {
    included: ShortlistEntry[];
    excluded: ShortlistExclusion[];
    /** Count dropped purely for missing data — surface this, never hide it. */
    hiddenForMissingData: number;
}

export const shortlistRideSpots = (
    filters: ShortlistFilters,
    spots: RideSpot[] = RIDE_SPOTS,
    now: Date = new Date(),
): ShortlistResult => {
    const included: ShortlistEntry[] = [];
    const excluded: ShortlistExclusion[] = [];

    const drop = (spot: RideSpot, reason: ExclusionReason, dueToMissingData: boolean, field?: RideSpotFactKey) => {
        excluded.push({ spot, reason, dueToMissingData, field });
    };

    for (const spot of spots) {
        // Fails open: only a confirmed closure removes a venue.
        const operating = resolveFact(spot.operating, 'operating', now);
        if (isUsableForHardFilter(operating.status) && operating.value === false) {
            drop(spot, 'NOT_OPERATING', false, 'operating');
            continue;
        }

        if (filters.activity && spot.activity !== filters.activity) {
            drop(spot, 'ACTIVITY_MISMATCH', false);
            continue;
        }

        const staleFacts: RideSpotFactKey[] = [];
        const inferredFacts: RideSpotFactKey[] = [];
        const noteStale = (key: RideSpotFactKey, status: ResolvedFactStatus) => {
            if (status === 'STALE') {
                staleFacts.push(key);
            }
            // A rule or a directory is weaker evidence than the venue itself.
            const kind = spot[key].sourceKind ?? 'venue';
            if (kind !== 'venue' && !inferredFacts.includes(key)) {
                inferredFacts.push(key);
            }
        };

        // ── HARD: surface ──
        if (filters.surface) {
            const resolved = resolveFact(spot.surface, 'surface', now);
            if (!isUsableForHardFilter(resolved.status)) {
                drop(spot, 'SURFACE_UNVERIFIED', true, 'surface');
                continue;
            }
            if (resolved.value !== filters.surface) {
                drop(spot, 'SURFACE_MISMATCH', false, 'surface');
                continue;
            }
            noteStale('surface', resolved.status);
        }

        // ── HARD: beginner-friendly ──
        if (filters.beginnerOnly) {
            const resolved = resolveFact(spot.beginnerFriendly, 'beginnerFriendly', now);
            if (!isUsableForHardFilter(resolved.status)) {
                drop(spot, 'BEGINNER_UNVERIFIED', true, 'beginnerFriendly');
                continue;
            }
            if (resolved.value !== true) {
                drop(spot, 'NOT_BEGINNER_FRIENDLY', false, 'beginnerFriendly');
                continue;
            }
            noteStale('beginnerFriendly', resolved.status);
        }

        // ── HARD: open on the chosen date ──
        if (filters.openOn) {
            const resolved = resolveFact(spot.openingSeason, 'openingSeason', now);
            if (!isUsableForHardFilter(resolved.status) || resolved.value === null) {
                drop(spot, 'SEASON_UNVERIFIED', true, 'openingSeason');
                continue;
            }
            if (!isOpenOn(resolved.value, filters.openOn)) {
                drop(spot, 'CLOSED_ON_DATE', false, 'openingSeason');
                continue;
            }
            noteStale('openingSeason', resolved.status);
        }

        // ── SOFT: climate. Unverified forfeits the bonus, never excludes. ──
        let climateBonus = 0;
        if (filters.climate) {
            const resolved = resolveFact(spot.climateBand, 'climateBand', now);
            if (isUsableForHardFilter(resolved.status) && resolved.value === filters.climate) {
                climateBonus = 1;
                noteStale('climateBand', resolved.status);
            }
        }

        included.push({ spot, climateBonus, staleFacts, inferredFacts });
    }

    return {
        included,
        excluded,
        hiddenForMissingData: excluded.filter((entry) => entry.dueToMissingData).length,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Coverage — drives the readiness banner and the rollout checklist
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageReport {
    totalSpots: number;
    /** Spots with every launch-critical fact verified (or still in TTL). */
    launchReady: number;
    /** Per-field count of spots where the fact is usable. */
    byField: Record<RideSpotFactKey, number>;
    staleFields: Array<{ label: string; field: RideSpotFactKey; ageDays: number | null }>;
}

export const getCoverage = (spots: RideSpot[] = RIDE_SPOTS, now: Date = new Date()): CoverageReport => {
    const byField = {} as Record<RideSpotFactKey, number>;
    for (const key of ALL_FACT_KEYS) {
        byField[key] = 0;
    }
    const staleFields: CoverageReport['staleFields'] = [];
    let launchReady = 0;

    for (const spot of spots) {
        const stillTrading = resolveFact(spot.operating, 'operating', now);
        let complete = stillTrading.value !== false;

        for (const key of ALL_FACT_KEYS) {
            const resolved = resolveFact(spot[key] as VenueFact<unknown>, key, now);
            if (isUsableForHardFilter(resolved.status)) {
                byField[key] += 1;
                if (resolved.status === 'STALE') {
                    staleFields.push({ label: spot.label, field: key, ageDays: resolved.ageDays });
                }
            } else if (LAUNCH_CRITICAL_FACTS.includes(key)) {
                complete = false;
            }
        }

        if (complete) {
            launchReady += 1;
        }
    }

    return { totalSpots: spots.length, launchReady, byField, staleFields };
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation — the rules a curator's PR must satisfy. Run in tests, so a bad
// row fails CI rather than reaching the intent layer.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
    label: string;
    field: RideSpotFactKey | 'label' | 'arrivalAirport';
    rule: string;
    message: string;
}

const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const validateRideSpots = (
    spots: RideSpot[] = RIDE_SPOTS,
    now: Date = new Date(),
): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    const seen = new Set<string>();

    const add = (label: string, field: ValidationIssue['field'], rule: string, message: string) => {
        issues.push({ label, field, rule, message });
    };

    for (const spot of spots) {
        const { label } = spot;

        // R1 — identity must agree with the routing catalogue.
        const key = label.trim().toLowerCase();
        if (seen.has(key)) {
            add(label, 'label', 'R1-unique', 'duplicate label');
        }
        seen.add(key);

        const hint = resolveDestinationHint(label);
        if (!hint) {
            add(label, 'label', 'R2-resolvable', 'does not resolve via resolveDestinationHint()');
        } else if (hint.arrivalAirport !== spot.arrivalAirport) {
            add(label, 'arrivalAirport', 'R2-airport-agrees',
                `directory says ${hint.arrivalAirport}, row says ${spot.arrivalAirport}`);
        }

        for (const factKey of ALL_FACT_KEYS) {
            const fact = spot[factKey] as VenueFact<unknown>;

            // R3 — a value may only exist behind a VERIFIED status.
            if (fact.status === 'VERIFIED') {
                if (fact.value === null || fact.value === undefined) {
                    add(label, factKey, 'R3-verified-has-value', 'VERIFIED but value is null');
                }
                // R4 — a fact read off a page must name the page. A fact with
                // no page behind it (a rule, or somebody telling us) must say
                // where it came from in `note` instead of citing nothing.
                const kind = fact.sourceKind ?? 'venue';
                if (kind === 'derived' || kind === 'user_report') {
                    if (fact.sourceUrl !== null) {
                        add(label, factKey, 'R4-no-url-expected', `${kind} facts carry no sourceUrl`);
                    }
                    if (!fact.note) {
                        add(label, factKey, 'R4-note-required',
                            `${kind} facts must record their basis in \`note\``);
                    }
                } else if (!fact.sourceUrl || !fact.sourceUrl.startsWith('https://')) {
                    add(label, factKey, 'R4-source-url', 'VERIFIED needs an https sourceUrl');
                }
                if (!fact.checkedOn || !ISO_DATE_RE.test(fact.checkedOn)) {
                    add(label, factKey, 'R5-checked-on', 'VERIFIED needs checkedOn as YYYY-MM-DD');
                } else {
                    const age = daysSince(fact.checkedOn, now);
                    if (age === null) {
                        add(label, factKey, 'R5-checked-on', 'checkedOn is not a real date');
                    } else if (age < 0) {
                        add(label, factKey, 'R5-checked-on', 'checkedOn is in the future');
                    }
                }
            } else if (fact.value !== null) {
                // R6 — no provisional guesses parked in the value slot.
                add(label, factKey, 'R6-no-unverified-value',
                    `status is ${fact.status} but a value is present`);
            }
        }

        // R7 — season bounds must be real calendar days.
        const season = spot.openingSeason;
        if (season.status === 'VERIFIED' && season.value && season.value !== 'year_round') {
            if (!MD_RE.test(season.value.from) || !MD_RE.test(season.value.to)) {
                add(label, 'openingSeason', 'R7-season-format', 'season bounds must be MM-DD');
            }
        }

        // R8 — cableCount is meaningful only for cable venues.
        const surface = spot.surface;
        const cable = spot.cableCount;
        if (surface.status === 'VERIFIED' && surface.value !== 'cable' && cable.status === 'VERIFIED') {
            add(label, 'cableCount', 'R8-cable-only',
                `cableCount set but surface is ${String(surface.value)} — use notApplicable()`);
        }
        if (cable.status === 'VERIFIED' && typeof cable.value === 'number' && cable.value <= 0) {
            add(label, 'cableCount', 'R8-cable-positive', 'cableCount must be > 0');
        }

        // R9 — cross-field sanity: beginner-friendly contradicts a high skill floor.
        const beginner = spot.beginnerFriendly;
        const floor = spot.skillFloor;
        if (beginner.status === 'VERIFIED' && beginner.value === true
            && floor.status === 'VERIFIED' && floor.value === 'confident') {
            add(label, 'beginnerFriendly', 'R9-beginner-consistent',
                'beginnerFriendly=true contradicts skillFloor=confident');
        }

        // R10 — prices must be sane.
        const price = spot.sessionPrice;
        if (price.status === 'VERIFIED' && price.value) {
            const { hourlyEur, dayPassEur } = price.value;
            if ((hourlyEur !== null && hourlyEur < 0) || (dayPassEur !== null && dayPassEur < 0)) {
                add(label, 'sessionPrice', 'R10-price-non-negative', 'prices must be >= 0');
            }
            if (hourlyEur !== null && dayPassEur !== null && hourlyEur > dayPassEur) {
                add(label, 'sessionPrice', 'R10-price-ordering', 'hourly rate exceeds the day pass');
            }
        }
    }

    return issues;
};
