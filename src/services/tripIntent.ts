// Intent hardening — the boundary between untrusted model output and the
// deterministic search core.
//
// Everything the parse model emits arrives here as `unknown`. This module is
// the "closed vocabulary" rule from docs/ai-intent-layer.md §4 made real:
// every field is validated against a fixed enum or a numeric range, unknown
// values are DROPPED rather than coerced, and the one free-text field
// (destinationHints) must survive resolveDestinationHint() or it is discarded
// with a warning. Nothing reaches an endpoint without passing through here.

import { UserProfile } from './api';
import { resolveDestinationHint, resolveOriginAirport } from './destinationDirectory';
import { ClimateBand, RideSurface, SkillFloor } from '../data/rideSpots';

export type RideActivity = 'wakeboard' | 'snowboard' | 'surf' | 'kitesurf';
export type BudgetBand = 'tight' | 'moderate' | 'open';
export type SkillLevel = SkillFloor;

/**
 * The ranking profiles. The model may pick one of these names and nothing
 * else — the weight vectors themselves live in code and are never negotiable.
 */
export type WeightProfile = 'cheapest_honest' | 'least_friction' | 'most_ride_time' | 'balanced';

export const WEIGHT_PROFILES: WeightProfile[] = [
    'cheapest_honest', 'least_friction', 'most_ride_time', 'balanced',
];

export interface DateWindow {
    /** YYYY-MM-DD */
    earliest: string;
    /** YYYY-MM-DD */
    latest: string;
}

export interface BudgetIntent {
    totalEur: number | null;
    band: BudgetBand | null;
    perPerson: boolean;
}

export interface TripIntent {
    /** Resolved IATA code, never free text. */
    origin: string | null;
    dateWindow: DateWindow | null;
    nights: number | null;
    partySize: number | null;
    activity: RideActivity | null;
    rideSurface: RideSurface | null;
    skillLevel: SkillLevel | null;
    budget: BudgetIntent;
    climate: ClimateBand | null;
    weightProfile: WeightProfile;
    /** Catalogue labels only — anything unresolvable was dropped. */
    destinationHints: string[];
}

/** Where each field came from. Drives the "assumed" chip styling in the UI. */
export type FieldSource = 'user' | 'profile' | 'assumed';

export interface ResolvedIntent extends TripIntent {
    sources: Partial<Record<keyof TripIntent, FieldSource>>;
}

export type IntentWarningKind =
    | 'HINT_UNRESOLVED'
    | 'FIELD_DROPPED'
    | 'PROFILE_APPLIED'
    | 'ASSUMPTION_APPLIED';

export interface IntentWarning {
    kind: IntentWarningKind;
    field: string;
    message: string;
}

export interface NormalizedIntent {
    intent: ResolvedIntent;
    warnings: IntentWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitive guards — every one drops rather than coerces
// ─────────────────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bounds the work a malformed or hostile payload can cause. */
const MAX_HINTS = 8;
const MAX_STRING_LENGTH = 120;

const asEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | null => (
    typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null
);

const asBoundedInt = (value: unknown, min: number, max: number): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return null;
    }
    return value >= min && value <= max ? value : null;
};

const asPositiveMoney = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    // A budget beyond this is meaningless here and signals a parse error.
    return value <= 1_000_000 ? Math.round(value) : null;
};

const asIsoDate = (value: unknown): string | null => (
    typeof value === 'string' && ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        ? value
        : null
);

const asShortString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= MAX_STRING_LENGTH ? trimmed : null;
};

const asRecord = (value: unknown): Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITIES: readonly RideActivity[] = ['wakeboard', 'snowboard', 'surf', 'kitesurf'];
const SURFACES: readonly RideSurface[] = ['cable', 'boat', 'sea'];
const CLIMATES: readonly ClimateBand[] = ['warm', 'temperate', 'cold'];
const SKILL_LEVELS: readonly SkillLevel[] = ['none', 'some', 'confident'];
const BANDS: readonly BudgetBand[] = ['tight', 'moderate', 'open'];

/**
 * Hardens raw model output into a ResolvedIntent.
 *
 * `raw` is untrusted: it may be malformed, may carry unknown enum members, and
 * may name destinations that do not exist. Nothing is coerced — a value that
 * fails its guard is dropped and reported.
 */
export const normalizeTripIntent = (raw: unknown): NormalizedIntent => {
    const input = asRecord(raw);
    const warnings: IntentWarning[] = [];
    const sources: ResolvedIntent['sources'] = {};

    const drop = (field: string, message: string) => {
        warnings.push({ kind: 'FIELD_DROPPED', field, message });
    };

    const note = <K extends keyof TripIntent>(field: K, value: unknown) => {
        if (value !== null && value !== undefined) {
            sources[field] = 'user';
        }
    };

    // ── origin: a place name is resolved to IATA here, never by the model ──
    let origin: string | null = null;
    const rawOrigin = input.origin;
    if (typeof rawOrigin === 'string') {
        const text = asShortString(rawOrigin);
        if (text) {
            // A bare 3-letter code is taken as IATA; anything else goes through
            // the hub lookup. resolveOriginAirport never returns empty.
            origin = /^[A-Za-z]{3}$/.test(text) ? text.toUpperCase() : resolveOriginAirport(text);
        }
    } else if (rawOrigin !== undefined && rawOrigin !== null) {
        drop('origin', 'origin must be a string');
    }
    note('origin', origin);

    // ── date window ──
    let dateWindow: DateWindow | null = null;
    const rawWindow = input.dateWindow;
    if (rawWindow !== undefined && rawWindow !== null) {
        const window = asRecord(rawWindow);
        const earliest = asIsoDate(window.earliest);
        const latest = asIsoDate(window.latest);
        if (earliest && latest && earliest <= latest) {
            dateWindow = { earliest, latest };
        } else {
            drop('dateWindow', 'needs valid YYYY-MM-DD bounds with earliest <= latest');
        }
    }
    note('dateWindow', dateWindow);

    const nights = asBoundedInt(input.nights, 1, 30);
    if (input.nights !== undefined && input.nights !== null && nights === null) {
        drop('nights', 'nights must be a whole number between 1 and 30');
    }
    note('nights', nights);

    const partySize = asBoundedInt(input.partySize, 1, 20);
    if (input.partySize !== undefined && input.partySize !== null && partySize === null) {
        drop('partySize', 'partySize must be a whole number between 1 and 20');
    }
    note('partySize', partySize);

    const activity = asEnum(input.activity, ACTIVITIES);
    if (input.activity !== undefined && input.activity !== null && activity === null) {
        drop('activity', `unknown activity ${JSON.stringify(input.activity)}`);
    }
    note('activity', activity);

    const rideSurface = asEnum(input.rideSurface, SURFACES);
    if (input.rideSurface !== undefined && input.rideSurface !== null && rideSurface === null) {
        drop('rideSurface', `unknown surface ${JSON.stringify(input.rideSurface)}`);
    }
    note('rideSurface', rideSurface);

    const skillLevel = asEnum(input.skillLevel, SKILL_LEVELS);
    if (input.skillLevel !== undefined && input.skillLevel !== null && skillLevel === null) {
        drop('skillLevel', `unknown skill level ${JSON.stringify(input.skillLevel)}`);
    }
    note('skillLevel', skillLevel);

    const climate = asEnum(input.climate, CLIMATES);
    if (input.climate !== undefined && input.climate !== null && climate === null) {
        drop('climate', `unknown climate ${JSON.stringify(input.climate)}`);
    }
    note('climate', climate);

    // ── budget ──
    const rawBudget = asRecord(input.budget);
    const budget: BudgetIntent = {
        totalEur: asPositiveMoney(rawBudget.totalEur),
        band: asEnum(rawBudget.band, BANDS),
        perPerson: rawBudget.perPerson === true,
    };
    if (rawBudget.totalEur !== undefined && rawBudget.totalEur !== null && budget.totalEur === null) {
        drop('budget.totalEur', 'budget must be a positive amount');
    }
    if (budget.totalEur !== null || budget.band !== null) {
        sources.budget = 'user';
    }

    // ── weight profile: unknown falls back rather than failing the search ──
    let weightProfile = asEnum(input.weightProfile, WEIGHT_PROFILES);
    if (weightProfile === null) {
        if (input.weightProfile !== undefined && input.weightProfile !== null) {
            drop('weightProfile', `unknown profile ${JSON.stringify(input.weightProfile)}, using balanced`);
        }
        weightProfile = 'balanced';
        sources.weightProfile = 'assumed';
    } else {
        sources.weightProfile = 'user';
    }

    // ── destination hints: the only free text, and it must resolve ──
    const destinationHints: string[] = [];
    const rawHints = Array.isArray(input.destinationHints) ? input.destinationHints.slice(0, MAX_HINTS) : [];
    for (const candidate of rawHints) {
        const text = asShortString(candidate);
        if (!text) {
            continue;
        }
        const hint = resolveDestinationHint(text);
        if (hint) {
            if (!destinationHints.includes(hint.label)) {
                destinationHints.push(hint.label);
            }
        } else {
            warnings.push({
                kind: 'HINT_UNRESOLVED',
                field: 'destinationHints',
                message: `"${text}" is not in the catalogue — ignored`,
            });
        }
    }
    if (destinationHints.length > 0) {
        sources.destinationHints = 'user';
    }

    return {
        intent: {
            origin,
            dateWindow,
            nights,
            partySize,
            activity,
            rideSurface,
            skillLevel,
            budget,
            climate,
            weightProfile,
            destinationHints,
            sources,
        },
        warnings,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile merge — the user's words always beat their saved preferences
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileContext {
    profile?: UserProfile | null;
    /** Saved home address, used only when the intent names no origin. */
    homeAddress?: string | null;
}

export const mergeProfileIntoIntent = (
    intent: ResolvedIntent,
    context: ProfileContext,
): NormalizedIntent => {
    const warnings: IntentWarning[] = [];
    const merged: ResolvedIntent = { ...intent, sources: { ...intent.sources } };

    if (merged.origin === null && context.homeAddress) {
        merged.origin = resolveOriginAirport(context.homeAddress);
        merged.sources.origin = 'profile';
        warnings.push({
            kind: 'PROFILE_APPLIED',
            field: 'origin',
            message: `departing ${merged.origin}, from your saved home address`,
        });
    }

    const dailyBudget = context.profile?.dailyBudget;
    if (merged.budget.totalEur === null && typeof dailyBudget === 'number' && dailyBudget > 0 && merged.nights) {
        merged.budget = { ...merged.budget, totalEur: Math.round(dailyBudget * merged.nights) };
        merged.sources.budget = 'profile';
        warnings.push({
            kind: 'PROFILE_APPLIED',
            field: 'budget',
            message: `budget from your saved daily allowance × ${merged.nights} nights`,
        });
    }

    return { intent: merged, warnings };
};

// ─────────────────────────────────────────────────────────────────────────────
// Materiality gate
//
// Ask only when proceeding would be wrong, not merely uncertain. Everything
// else is assumed and shown as an editable chip — see docs/ai-intent-layer.md §2.
// ─────────────────────────────────────────────────────────────────────────────

export interface FollowUp {
    field: keyof TripIntent;
    question: string;
    options: Array<{ label: string; value: unknown }>;
    /** Shown on hover: why this one is worth a turn. */
    reason: string;
}

export interface MaterialityContext {
    /** Ratio of dearest to cheapest candidate, when a search has already run. */
    candidateSpread?: number;
    /** Today, for the default date suggestions. */
    now?: Date;
}

/** A spread wider than this makes a vague budget word unanswerable. */
export const WIDE_SPREAD_RATIO = 2;

export const assessMateriality = (
    intent: ResolvedIntent,
    context: MaterialityContext = {},
): FollowUp | null => {
    // 1. No origin at all. There is no honest default for where someone lives.
    if (!intent.origin) {
        return {
            field: 'origin',
            question: 'Where are you flying from?',
            options: [
                { label: 'Dublin', value: 'DUB' },
                { label: 'Shannon', value: 'SNN' },
                { label: 'Cork', value: 'ORK' },
                { label: 'London', value: 'LHR' },
            ],
            reason: 'Every price and travel time depends on the departure airport.',
        };
    }

    // 2. A seasonal ask with no dates. "Somewhere warm" in January and in July
    //    are different catalogues, so an assumed window would pick for them.
    if (!intent.dateWindow && intent.climate !== null) {
        return {
            field: 'dateWindow',
            question: 'Roughly when?',
            options: [
                { label: 'Next month', value: 'next_month' },
                { label: 'In 2–3 months', value: 'quarter' },
                { label: 'Summer', value: 'summer' },
                { label: "I'm flexible", value: 'flexible' },
            ],
            reason: 'Which venues are open — and warm — depends entirely on the month.',
        };
    }

    // 3. A budget word with no number, over a wide spread. Narrow spread means
    //    the word changes nothing, so proceed.
    const vagueBudget = intent.budget.band !== null && intent.budget.totalEur === null;
    const spread = context.candidateSpread;
    if (vagueBudget && typeof spread === 'number' && spread > WIDE_SPREAD_RATIO) {
        return {
            field: 'budget',
            question: "What's your ceiling per person?",
            options: [
                { label: 'Under €250', value: 250 },
                { label: 'Under €400', value: 400 },
                { label: 'Under €600', value: 600 },
                { label: 'No firm limit', value: null },
            ],
            reason: `Options here range more than ${WIDE_SPREAD_RATIO}× in price, so "${intent.budget.band}" could mean any of them.`,
        };
    }

    return null;
};
