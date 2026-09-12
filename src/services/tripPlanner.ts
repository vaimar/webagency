// Planner — intent in, a concrete list of endpoint calls out.
//
// No model runs here. The strategy is chosen from the SHAPE of the intent by
// a fixed table, so a plan is reproducible, diffable and unit-testable, and
// the number of expensive /api/trips/explore calls is bounded before anything
// hits the network. See docs/ai-intent-layer.md §2.
//
// When curated facts cannot honestly satisfy a hard filter the planner does
// not quietly widen the search. It blocks, and reports the single relaxation
// that would yield results — the deterministic "nearest alternative" the
// no_backing UX state renders.

import { RIDE_SPOTS, RideSpot, shortlistRideSpots, ShortlistFilters } from '../data/rideSpots';
import { resolveDestinationHint } from './destinationDirectory';
import { TripExploreRequestPayload } from '../types/tripExploration';
import { ResolvedIntent } from './tripIntent';

export type PlanStrategy =
    /** One resolvable destination — search it directly. */
    | 'SINGLE_SPOT'
    /** No destination named — filter the catalogue, then fan out. */
    | 'SHORTLIST_FANOUT'
    /** Destination fixed, dates open — sample dates across the window. */
    | 'DATE_SWEEP'
    /** Nothing can be searched honestly. `blocked` explains why. */
    | 'BLOCKED';

/** Bounded on purpose: explore is measured in seconds, not milliseconds. */
export const FANOUT_WIDTH = 3;
export const DATE_SAMPLE_SIZE = 3;

const DEFAULT_PROVIDERS = ['serpapi'];
const DEFAULT_ACTIVITY_RADIUS_M = 5000;
const DEFAULT_HOTEL_RADIUS_M = 10000;

export interface PlannedCall {
    /** Catalogue label this call is for — the option's identity downstream. */
    spotLabel: string;
    travelDate: string;
    request: TripExploreRequestPayload;
}

export type PlanWarningKind =
    | 'ASSUMPTION_APPLIED'
    | 'HIDDEN_FOR_MISSING_DATA'
    | 'DATE_SAMPLED'
    | 'FANOUT_TRUNCATED'
    | 'SEASON_UNCHECKED';

export interface PlanWarning {
    kind: PlanWarningKind;
    message: string;
}

export interface PlanRelaxation {
    /** The filter to drop, named for the chip the user would edit.
     *  'allVenueFacts' is the last resort: search without any curated-fact
     *  filter at all, which is the only offer available while the catalogue
     *  is still being verified. */
    dropFilter: 'rideSurface' | 'skillLevel' | 'dateWindow' | 'allVenueFacts';
    wouldYield: number;
    message: string;
}

export interface PlanBlock {
    reason: 'NO_VERIFIED_CANDIDATES' | 'NO_CANDIDATES_MATCH' | 'NO_ORIGIN';
    message: string;
    /** The nearest deterministic alternative, computed — never guessed. */
    relaxation: PlanRelaxation | null;
}

export interface ExecutionPlan {
    strategy: PlanStrategy;
    calls: PlannedCall[];
    warnings: PlanWarning[];
    blocked: PlanBlock | null;
    sampledDates: string[];
}

export interface PlanContext {
    now?: Date;
    spots?: RideSpot[];
    /** How the traveller reaches their departure airport. */
    firstMileMode?: 'rental_car' | 'public_transport';
}

// ─────────────────────────────────────────────────────────────────────────────
// Date sampling
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (iso: string, days: number): string => (
    toIso(new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY))
);

const dayOfWeek = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * Picks representative departure dates across a window: weekends first, since
 * that is when most short trips run, then one midweek date for contrast.
 *
 * A month-wide window is NOT searched exhaustively — 30 dates times N spots is
 * far too many calls. The caller must label the result as a sample; claiming
 * "cheapest this month" from three dates would be a lie.
 */
export const sampleDates = (
    earliest: string,
    latest: string,
    nights: number,
    limit = DATE_SAMPLE_SIZE,
): string[] => {
    const candidates: string[] = [];
    for (let cursor = earliest; cursor <= latest; cursor = addDays(cursor, 1)) {
        // The whole trip has to fit inside the window.
        if (addDays(cursor, nights) <= latest) {
            candidates.push(cursor);
        }
        if (candidates.length > 400) {
            break;
        }
    }

    if (candidates.length === 0) {
        // Window too tight for the requested nights — depart on day one and
        // let the backend answer for what it can.
        return [earliest];
    }

    const fridays = candidates.filter((date) => dayOfWeek(date) === 5);
    const midweek = candidates.filter((date) => dayOfWeek(date) === 3);

    const picked: string[] = [];
    const take = (date: string) => {
        if (picked.length < limit && !picked.includes(date)) {
            picked.push(date);
        }
    };

    fridays.slice(0, 2).forEach(take);
    midweek.slice(0, 1).forEach(take);
    candidates.forEach(take);

    return picked.slice(0, limit).sort();
};

/** Two nights out from today when the user gave no window at all. */
export const defaultWindow = (now: Date, nights: number): { earliest: string; latest: string } => {
    const start = addDays(toIso(now), 7);
    return { earliest: start, latest: addDays(start, nights + 4) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Candidate selection
// ─────────────────────────────────────────────────────────────────────────────

const buildFilters = (intent: ResolvedIntent, openOn?: string): ShortlistFilters => ({
    activity: intent.activity ?? undefined,
    surface: intent.rideSurface ?? undefined,
    // "Beginner-friendly" is a hard constraint only when they said they are one.
    beginnerOnly: intent.skillLevel === 'none' ? true : undefined,
    climate: intent.climate ?? undefined,
    openOn,
});

const buildRequest = (
    spotLabel: string,
    intent: ResolvedIntent,
    travelDate: string,
    context: PlanContext,
): PlannedCall => {
    const hint = resolveDestinationHint(spotLabel);
    const request: TripExploreRequestPayload = {
        origin: intent.origin ?? '',
        destination: spotLabel,
        travelDate,
        providers: DEFAULT_PROVIDERS,
        activityRadiusMeters: DEFAULT_ACTIVITY_RADIUS_M,
        hotelRadiusMeters: DEFAULT_HOTEL_RADIUS_M,
    };

    if (intent.activity) {
        request.activity = intent.activity;
    }
    // The backend 400s with DESTINATION_AIRPORT_REQUIRED unless it curates the
    // destination itself, so hinted ones must carry the airport explicitly.
    if (hint && !hint.curatedByBackend) {
        request.arrivalAirport = hint.arrivalAirport;
    }
    if (context.firstMileMode) {
        request.firstMileAccess = { mode: context.firstMileMode, source: 'ride-finder' };
    }

    return { spotLabel, travelDate, request };
};

/**
 * Recomputes the shortlist with one filter dropped, to find the nearest honest
 * alternative to offer. Returns null when dropping it changes nothing.
 */
const findRelaxation = (
    intent: ResolvedIntent,
    context: PlanContext,
    openOn?: string,
): PlanRelaxation | null => {
    const spots = context.spots ?? RIDE_SPOTS;
    const attempts: Array<{ key: PlanRelaxation['dropFilter']; filters: ShortlistFilters; label: string }> = [];

    if (intent.rideSurface) {
        attempts.push({
            key: 'rideSurface',
            filters: { ...buildFilters(intent, openOn), surface: undefined },
            label: `without the ${intent.rideSurface}-only filter`,
        });
    }
    if (intent.skillLevel === 'none') {
        attempts.push({
            key: 'skillLevel',
            filters: { ...buildFilters(intent, openOn), beginnerOnly: undefined },
            label: 'without the beginner-friendly filter',
        });
    }
    if (openOn) {
        attempts.push({
            key: 'dateWindow',
            filters: { ...buildFilters(intent), openOn: undefined },
            label: 'on other dates',
        });
    }

    // Last resort: no single drop helps while the catalogue is unverified, so
    // offer the search with every curated-fact filter removed. Never leave the
    // user with a dead end and nothing to click.
    attempts.push({
        key: 'allVenueFacts',
        filters: { activity: intent.activity ?? undefined },
        label: 'if we search without the filters we cannot verify yet',
    });

    for (const attempt of attempts) {
        const yielded = shortlistRideSpots(attempt.filters, spots, context.now).included.length;
        if (yielded > 0) {
            return {
                dropFilter: attempt.key,
                wouldYield: yielded,
                message: `${yielded} option${yielded === 1 ? '' : 's'} ${attempt.label}`,
            };
        }
    }

    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// The plan
// ─────────────────────────────────────────────────────────────────────────────

export const planSearch = (intent: ResolvedIntent, context: PlanContext = {}): ExecutionPlan => {
    const now = context.now ?? new Date();
    const spots = context.spots ?? RIDE_SPOTS;
    const warnings: PlanWarning[] = [];

    if (!intent.origin) {
        return {
            strategy: 'BLOCKED',
            calls: [],
            warnings,
            blocked: { reason: 'NO_ORIGIN', message: 'No departure airport resolved.', relaxation: null },
            sampledDates: [],
        };
    }

    const nights = intent.nights ?? 2;
    if (intent.nights === null) {
        warnings.push({ kind: 'ASSUMPTION_APPLIED', message: `Assuming ${nights} nights.` });
    }

    const window = intent.dateWindow ?? defaultWindow(now, nights);
    if (!intent.dateWindow) {
        warnings.push({ kind: 'ASSUMPTION_APPLIED', message: `Assuming departure around ${window.earliest}.` });
    }

    const windowDays = Math.round(
        (Date.parse(`${window.latest}T00:00:00Z`) - Date.parse(`${window.earliest}T00:00:00Z`)) / MS_PER_DAY,
    );
    // Only sweep when the USER expressed flexibility. A window we assumed
    // ourselves must not cost three times the calls to explore.
    const datesAreOpen = Boolean(intent.dateWindow) && windowDays > nights + 3;
    const sampledDates = datesAreOpen
        ? sampleDates(window.earliest, window.latest, nights)
        : [window.earliest];

    // ── A named destination short-circuits catalogue filtering entirely ──
    if (intent.destinationHints.length > 0) {
        const target = intent.destinationHints[0];
        if (intent.destinationHints.length > 1) {
            warnings.push({
                kind: 'FANOUT_TRUNCATED',
                message: `Searching ${target}; also mentioned: ${intent.destinationHints.slice(1).join(', ')}.`,
            });
        }

        if (datesAreOpen) {
            if (sampledDates.length < windowDays) {
                warnings.push({
                    kind: 'DATE_SAMPLED',
                    message: `Checked ${sampledDates.length} dates in that window, not all ${windowDays}.`,
                });
            }
            return {
                strategy: 'DATE_SWEEP',
                calls: sampledDates.map((date) => buildRequest(target, intent, date, context)),
                warnings,
                blocked: null,
                sampledDates,
            };
        }

        return {
            strategy: 'SINGLE_SPOT',
            calls: [buildRequest(target, intent, sampledDates[0], context)],
            warnings,
            blocked: null,
            sampledDates,
        };
    }

    // ── No destination: filter the catalogue, fail closed on missing facts ──
    //
    // The season gate applies only to dates the USER chose. Failing closed is
    // right for a constraint they asked for; applying it to a date we assumed
    // ourselves would block every search on our own guess — and with no
    // verified seasons in the catalogue, that means the product shows nothing
    // at all. Skipping it is reported, never silent.
    const userChoseDates = intent.sources.dateWindow === 'user';
    const openOn = userChoseDates ? sampledDates[0] : undefined;
    if (!userChoseDates) {
        warnings.push({
            kind: 'SEASON_UNCHECKED',
            message: 'Opening seasons are not verified, so we did not filter by season for the dates we assumed. Check the venue before booking.',
        });
    }

    const shortlist = shortlistRideSpots(buildFilters(intent, openOn), spots, now);

    if (shortlist.hiddenForMissingData > 0) {
        warnings.push({
            kind: 'HIDDEN_FOR_MISSING_DATA',
            message: `${shortlist.hiddenForMissingData} venue${shortlist.hiddenForMissingData === 1 ? '' : 's'} hidden — we have not verified the facts that filter needs.`,
        });
    }

    if (shortlist.included.length === 0) {
        const allMissing = shortlist.excluded.every((entry) => entry.dueToMissingData);
        return {
            strategy: 'BLOCKED',
            calls: [],
            warnings,
            blocked: {
                reason: allMissing ? 'NO_VERIFIED_CANDIDATES' : 'NO_CANDIDATES_MATCH',
                message: allMissing
                    ? 'No venue has verified facts for that filter yet.'
                    : 'No venue in the catalogue matches those constraints.',
                relaxation: findRelaxation(intent, context, openOn),
            },
            sampledDates,
        };
    }

    // Climate is a soft preference: it orders the shortlist, never trims it.
    const ordered = [...shortlist.included].sort(
        (a, b) => (b.climateBonus - a.climateBonus) || a.spot.label.localeCompare(b.spot.label),
    );

    if (ordered.length > FANOUT_WIDTH) {
        warnings.push({
            kind: 'FANOUT_TRUNCATED',
            message: `Searched the top ${FANOUT_WIDTH} of ${ordered.length} matching venues.`,
        });
    }

    return {
        strategy: 'SHORTLIST_FANOUT',
        calls: ordered
            .slice(0, FANOUT_WIDTH)
            .map((entry) => buildRequest(entry.spot.label, intent, sampledDates[0], context)),
        warnings,
        blocked: null,
        sampledDates,
    };
};
