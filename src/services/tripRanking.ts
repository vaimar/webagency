// Ranking — the numbers behind a WeightProfile.
//
// The model picks one profile NAME and nothing else. Every weight and every
// piece of arithmetic lives here, frozen, so a ranking can be reproduced,
// diffed and unit-tested. See docs/ai-intent-layer.md §4, rule 8.
//
// Each component is normalized across the candidate set so that 1 is always
// "better" regardless of whether the underlying field is lower-is-better
// (cost, distance) or higher-is-better (stay quality). A component with no
// backing data anywhere in the set is DROPPED and its weight redistributed
// across the survivors — never silently treated as zero, which would rank an
// unknown as though it were the worst possible value.

import { CostLine, PriceBreakdown } from './api';
import { HiddenGemHotel, UnifiedFlightOption } from '../types/tripExploration';
import { WeightProfile } from './tripIntent';
import { asPositiveAmount, getFlightPricing, isLateNightArrival } from './tripExploreSelectors';

export type ScoreComponent =
    | 'honestCost'
    | 'transitFriction'
    | 'arrivalRisk'
    | 'uncertainty'
    | 'rideProximity'
    | 'stayQuality';

export const SCORE_COMPONENTS: ScoreComponent[] = [
    'honestCost', 'transitFriction', 'arrivalRisk', 'uncertainty', 'rideProximity', 'stayQuality',
];

export type WeightVector = Record<ScoreComponent, number>;

/**
 * Frozen. "Least stressful even if it costs more" is this table, not a filter —
 * which is precisely why one enum token of model output is enough to express it.
 */
export const WEIGHT_VECTORS: Record<WeightProfile, WeightVector> = {
    cheapest_honest: {
        honestCost: 1.0, transitFriction: 0.2, arrivalRisk: 0.2,
        uncertainty: 0.3, rideProximity: 0.2, stayQuality: 0.1,
    },
    least_friction: {
        honestCost: 0.3, transitFriction: 1.0, arrivalRisk: 1.0,
        uncertainty: 0.8, rideProximity: 0.6, stayQuality: 0.4,
    },
    most_ride_time: {
        honestCost: 0.4, transitFriction: 0.7, arrivalRisk: 0.5,
        uncertainty: 0.3, rideProximity: 1.0, stayQuality: 0.2,
    },
    balanced: {
        honestCost: 0.7, transitFriction: 0.5, arrivalRisk: 0.5,
        uncertainty: 0.4, rideProximity: 0.5, stayQuality: 0.3,
    },
};

/** Raw, un-normalized measurements. `null` means the backend gave us nothing. */
export interface RawMetrics {
    /** Lower is better. */
    honestTotal: number | null;
    /** Lower is better — stops and minutes in the air, plus any drive to the hub. */
    transitMinutes: number | null;
    stops: number | null;
    /** Lower is better — 0 when the arrival carries no late-night risk. */
    arrivalRisk: number | null;
    /** Lower is better — count of non-EXACT cost lines. */
    unverifiedLines: number | null;
    /** Lower is better. */
    rideDistanceKm: number | null;
    /** Higher is better. */
    stayScore: number | null;
}

export interface RankableOption {
    id: string;
    label: string;
    metrics: RawMetrics;
}

export interface ScoredOption extends RankableOption {
    score: number;
    /** Normalized 0..1 per component, before weighting. Powers the "why" tooltip. */
    components: Partial<Record<ScoreComponent, number>>;
    /** Components dropped for want of data anywhere in the candidate set. */
    missingComponents: ScoreComponent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection from backend payloads
// ─────────────────────────────────────────────────────────────────────────────

const countUnverifiedLines = (breakdown?: PriceBreakdown | null): number | null => {
    if (!breakdown) {
        return null;
    }
    const lines: Array<CostLine | undefined | null> = [
        breakdown.baseFare, breakdown.shuttleFee, breakdown.baggageEstimate,
        breakdown.lateArrivalMarkup, breakdown.firstMileLine,
    ];
    const present = lines.filter((line): line is CostLine => Boolean(line));
    if (present.length === 0) {
        return null;
    }
    return present.filter((line) => line.status !== 'EXACT').length;
};

export interface ProjectionInput {
    id: string;
    label: string;
    flight?: UnifiedFlightOption | null;
    stay?: HiddenGemHotel | null;
    rideDistanceKm?: number | null;
}

/** Turns backend payloads into the measurements the scorer understands. */
export const projectOption = (input: ProjectionInput): RankableOption => {
    const flight = input.flight ?? null;
    const pricing = getFlightPricing(flight);
    const truth = flight?.antiCauchemar;

    const flightMinutes = asPositiveAmount(flight?.totalDurationMinutes)
        ?? asPositiveAmount(truth?.totalTravelTimeMinutes)
        ?? null;
    const driveMinutes = asPositiveAmount(flight?.originDriveMinutes) ?? 0;

    // Late-night arrivals and a backend-priced late-arrival markup are the two
    // signals of a stressful landing; either alone counts.
    let arrivalRisk: number | null = null;
    if (flight) {
        const markup = asPositiveAmount(truth?.hiddenCostPenalty) ?? 0;
        arrivalRisk = (isLateNightArrival(flight.scheduledArrival) ? 1 : 0) + (markup > 0 ? 1 : 0);
    }

    return {
        id: input.id,
        label: input.label,
        metrics: {
            honestTotal: pricing.honestTotal ?? null,
            transitMinutes: flightMinutes === null ? null : flightMinutes + driveMinutes,
            stops: typeof flight?.stops === 'number' ? flight.stops : null,
            arrivalRisk,
            unverifiedLines: countUnverifiedLines(truth?.priceBreakdown),
            rideDistanceKm: asPositiveAmount(input.rideDistanceKm) ?? null,
            stayScore: asPositiveAmount(input.stay?.compositeScore) ?? null,
        },
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/** Reads one component's raw value. Lower-is-better everywhere except stayQuality. */
const readMetric = (metrics: RawMetrics, component: ScoreComponent): number | null => {
    switch (component) {
        case 'honestCost':
            return metrics.honestTotal;
        case 'transitFriction': {
            if (metrics.transitMinutes === null && metrics.stops === null) {
                return null;
            }
            // A stop costs roughly an hour of felt friction on top of its clock time.
            return (metrics.transitMinutes ?? 0) + (metrics.stops ?? 0) * 60;
        }
        case 'arrivalRisk':
            return metrics.arrivalRisk;
        case 'uncertainty':
            return metrics.unverifiedLines;
        case 'rideProximity':
            return metrics.rideDistanceKm;
        case 'stayQuality':
            return metrics.stayScore;
        default:
            return null;
    }
};

const HIGHER_IS_BETTER: ScoreComponent[] = ['stayQuality'];

/**
 * Min-max normalizes each component across the set, orients it so 1 is always
 * better, then takes a weighted mean over the components that have data.
 */
export const scoreOptions = (
    options: RankableOption[],
    profile: WeightProfile,
): ScoredOption[] => {
    const weights = WEIGHT_VECTORS[profile];

    // A component survives only if at least one candidate has a value for it.
    const ranges = new Map<ScoreComponent, { min: number; max: number }>();
    const missingComponents: ScoreComponent[] = [];

    for (const component of SCORE_COMPONENTS) {
        const values = options
            .map((option) => readMetric(option.metrics, component))
            .filter((value): value is number => value !== null);

        if (values.length === 0) {
            missingComponents.push(component);
            continue;
        }
        ranges.set(component, { min: Math.min(...values), max: Math.max(...values) });
    }

    return options.map((option) => {
        const components: Partial<Record<ScoreComponent, number>> = {};
        let weighted = 0;
        let weightUsed = 0;

        for (const [component, range] of Array.from(ranges.entries())) {
            const raw = readMetric(option.metrics, component);
            if (raw === null) {
                // This candidate lacks a value the others have. Skipping keeps
                // it from being scored as the worst case on a missing field.
                continue;
            }

            const span = range.max - range.min;
            // A tie separates nothing, so everyone takes the same neutral value.
            // This has to be applied AFTER orientation: setting position = 1 up
            // front would score a tie as best on higher-is-better components and
            // worst on lower-is-better ones.
            const position = span === 0 ? 0 : (raw - range.min) / span;
            const oriented = span === 0
                ? 1
                : (HIGHER_IS_BETTER.includes(component) ? position : 1 - position);

            components[component] = oriented;
            weighted += oriented * weights[component];
            weightUsed += weights[component];
        }

        return {
            ...option,
            // Redistribution is implicit: dividing by the weight actually used
            // rescales the survivors to fill the whole 0..1 range.
            score: weightUsed === 0 ? 0 : weighted / weightUsed,
            components,
            missingComponents: [...missingComponents],
        };
    });
};

/** Scores, orders best-first, and keeps the top `limit`. Ties break on label for stability. */
export const rankOptions = (
    options: RankableOption[],
    profile: WeightProfile,
    limit = 3,
): ScoredOption[] => scoreOptions(options, profile)
    .sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label))
    .slice(0, limit);

/** Dearest ÷ cheapest across the set — feeds the materiality gate's budget test. */
export const getCandidateSpread = (options: RankableOption[]): number | undefined => {
    const totals = options
        .map((option) => option.metrics.honestTotal)
        .filter((value): value is number => value !== null && value > 0);

    if (totals.length < 2) {
        return undefined;
    }
    return Math.max(...totals) / Math.min(...totals);
};
