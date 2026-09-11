// Fan-out execution and result shaping. Deterministic end to end — no model
// runs in this file, and none is required for it to produce a full result.
//
// The order matters: unbacked options are dropped BEFORE anything is scored or
// explained, so a flight with no real fare can never reach a card or a prompt.
// See docs/ai-intent-layer.md §4, rule 5.

import { CostLineStatus, DataConfidence } from './api';
import {
    HiddenGemHotel,
    TripExplorationResponse,
    TripExploreRequestPayload,
    UnifiedFlightOption,
} from '../types/tripExploration';
import { ExecutionPlan, PlannedCall } from './tripPlanner';
import { WeightProfile } from './tripIntent';
import {
    getCandidateSpread,
    projectOption,
    RankableOption,
    rankOptions,
    ScoredOption,
} from './tripRanking';
import { asPositiveAmount, getFlightPricing } from './tripExploreSelectors';

export type SearchWarningKind =
    | 'BACKEND_DEGRADED'
    | 'MANUAL_CHECK_REQUIRED'
    | 'STALE_PRICE'
    | 'PARTIAL_FANOUT'
    | 'NO_BACKING'
    | 'CALL_FAILED';

export interface SearchWarning {
    kind: SearchWarningKind;
    severity: 'info' | 'warn' | 'critical';
    message: string;
    spotLabel?: string;
}

export interface TripOption {
    id: string;
    spotLabel: string;
    travelDate: string;
    arrivalAirport: string | null;
    originAirport: string | null;
    flight: UnifiedFlightOption;
    stay: HiddenGemHotel | null;
    rideDistanceKm: number | null;
    total: { amount: number; currency: string; status: CostLineStatus };
    /** Populated by ranking. */
    score: number;
    scoreComponents: ScoredOption['components'];
}

export interface SearchConfidence {
    level: DataConfidence;
    candidatesSearched: number;
    candidatesReturned: number;
    staleQuotes: number;
    manualChecks: number;
    orchestrationStatuses: string[];
    drivers: string[];
}

export interface SearchResult {
    options: TripOption[];
    warnings: SearchWarning[];
    confidence: SearchConfidence;
    /** Dearest ÷ cheapest — feeds the materiality gate's budget question. */
    candidateSpread: number | undefined;
    /** Raw payloads keyed by spot label, for the detail tabs. */
    payloads: Record<string, TripExplorationResponse>;
}

/** Injectable so the fan-out is testable without a network. */
export type ExploreFetcher = (request: TripExploreRequestPayload) => Promise<TripExplorationResponse>;

export const defaultExploreFetcher: ExploreFetcher = async (request) => {
    // Relative URL — the CRA dev proxy and the production reverse proxy both
    // route /api to the Spring backend, same as TripExplorationContext.
    const response = await fetch('/api/trips/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error(`Trip search failed with status ${response.status}`);
    }
    return (await response.json()) as TripExplorationResponse;
};

// ─────────────────────────────────────────────────────────────────────────────
// Backing rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A flight only counts if the backend actually priced it. `ticketPrice` is a
 * Java primitive, so 0 means "never set" — never a free seat.
 */
export const hasRealBacking = (flight: UnifiedFlightOption | null | undefined): boolean => {
    if (!flight) {
        return false;
    }
    const pricing = getFlightPricing(flight);
    return typeof pricing.honestTotal === 'number'
        || typeof pricing.baseFare === 'number'
        || asPositiveAmount(flight.ticketPrice) !== undefined;
};

const pickBestFlight = (payload: TripExplorationResponse): UnifiedFlightOption | null => {
    const candidates: UnifiedFlightOption[] = [
        ...(payload.bestUnifiedFlight ? [payload.bestUnifiedFlight] : []),
        ...(payload.unifiedFlights ?? []),
    ];
    return candidates.find(hasRealBacking) ?? null;
};

/** The weakest contributing line decides how a total may be labelled. */
const deriveTotalStatus = (flight: UnifiedFlightOption): CostLineStatus => {
    const breakdown = flight.antiCauchemar?.priceBreakdown;
    const lines = [
        breakdown?.baseFare, breakdown?.shuttleFee, breakdown?.baggageEstimate,
        breakdown?.lateArrivalMarkup, breakdown?.firstMileLine,
    ].filter(Boolean);

    if (flight.antiCauchemar?.manualCheckRequired
        || lines.some((line) => line?.status === 'MANUAL_CHECK_REQUIRED')) {
        return 'MANUAL_CHECK_REQUIRED';
    }
    if (lines.length > 0 && lines.every((line) => line?.status === 'EXACT')) {
        return 'EXACT';
    }
    return 'ESTIMATED';
};

/**
 * UnifiedFlightOption carries no `fetchDate` — that field lives on
 * FlightAvailable, from /api/flights. The backend has already applied the
 * 12-hour rule and expressed the outcome in the label, so the label is the
 * only freshness signal available here. Do not invent a timestamp.
 */
const isStale = (flight: UnifiedFlightOption): boolean => {
    const label = `${flight.priceLabel ?? ''} ${flight.freshnessLabel ?? ''}`;
    return /cached|estimated/i.test(label);
};

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecuteOptions {
    fetcher?: ExploreFetcher;
    profile?: WeightProfile;
    limit?: number;
}

export const executePlan = async (
    plan: ExecutionPlan,
    options: ExecuteOptions = {},
): Promise<SearchResult> => {
    const fetcher = options.fetcher ?? defaultExploreFetcher;
    const profile = options.profile ?? 'balanced';
    const warnings: SearchWarning[] = [];
    const payloads: Record<string, TripExplorationResponse> = {};

    if (plan.calls.length === 0) {
        return {
            options: [],
            warnings,
            confidence: {
                level: 'estimated',
                candidatesSearched: 0,
                candidatesReturned: 0,
                staleQuotes: 0,
                manualChecks: 0,
                orchestrationStatuses: [],
                drivers: ['No candidates were searched.'],
            },
            candidateSpread: undefined,
            payloads,
        };
    }

    // All calls go out together. One failure must not sink the others, so
    // allSettled rather than all.
    const settled = await Promise.allSettled(
        plan.calls.map((call: PlannedCall) => fetcher(call.request)),
    );

    const rankable: RankableOption[] = [];
    const draft = new Map<string, Omit<TripOption, 'score' | 'scoreComponents'>>();
    const orchestrationStatuses: string[] = [];
    let staleQuotes = 0;
    let manualChecks = 0;

    settled.forEach((outcome, index) => {
        const call = plan.calls[index];
        const id = `${call.spotLabel}::${call.travelDate}`;

        if (outcome.status === 'rejected') {
            warnings.push({
                kind: 'CALL_FAILED',
                severity: 'warn',
                message: `${call.spotLabel} could not be searched.`,
                spotLabel: call.spotLabel,
            });
            return;
        }

        const payload = outcome.value;
        payloads[id] = payload;

        const status = payload.orchestrationStatus ?? 'OK';
        orchestrationStatuses.push(status);
        if (status !== 'OK') {
            warnings.push({
                kind: 'BACKEND_DEGRADED',
                severity: 'warn',
                message: `${call.spotLabel}: backend reported ${status}.`,
                spotLabel: call.spotLabel,
            });
        }

        // Rule 5, applied before anything is scored or shown.
        if (payload.routeAvailable === false) {
            warnings.push({
                kind: 'NO_BACKING',
                severity: 'info',
                message: `No route to ${call.spotLabel} on ${call.travelDate}.`,
                spotLabel: call.spotLabel,
            });
            return;
        }

        const flight = pickBestFlight(payload);
        if (!flight) {
            warnings.push({
                kind: 'NO_BACKING',
                severity: 'info',
                message: `No priced flight to ${call.spotLabel} on ${call.travelDate}.`,
                spotLabel: call.spotLabel,
            });
            return;
        }

        const totalStatus = deriveTotalStatus(flight);
        if (totalStatus === 'MANUAL_CHECK_REQUIRED') {
            manualChecks += 1;
            warnings.push({
                kind: 'MANUAL_CHECK_REQUIRED',
                severity: 'warn',
                message: `${call.spotLabel}: part of the cost could not be verified.`,
                spotLabel: call.spotLabel,
            });
        }
        if (isStale(flight)) {
            staleQuotes += 1;
            warnings.push({
                kind: 'STALE_PRICE',
                severity: 'info',
                message: `${call.spotLabel}: price is from cache, not live.`,
                spotLabel: call.spotLabel,
            });
        }

        const pricing = getFlightPricing(flight);
        const stay = payload.hiddenGemHotels?.[0] ?? null;
        const rideDistanceKm = asPositiveAmount(payload.primaryActivity?.distanceKm) ?? null;

        draft.set(id, {
            id,
            spotLabel: call.spotLabel,
            travelDate: call.travelDate,
            arrivalAirport: payload.resolvedArrivalAirport ?? null,
            originAirport: payload.originAirport ?? null,
            flight,
            stay,
            rideDistanceKm,
            total: {
                amount: pricing.honestTotal ?? pricing.baseFare ?? 0,
                currency: pricing.currency,
                status: totalStatus,
            },
        });

        rankable.push(projectOption({
            id,
            label: call.spotLabel,
            flight,
            stay,
            rideDistanceKm,
        }));
    });

    if (draft.size < plan.calls.length) {
        warnings.push({
            kind: 'PARTIAL_FANOUT',
            severity: 'info',
            message: `${draft.size} of ${plan.calls.length} searches returned a usable option.`,
        });
    }

    const ranked = rankOptions(rankable, profile, options.limit ?? 3);
    const optionsOut: TripOption[] = ranked
        .map((scored) => {
            const base = draft.get(scored.id);
            return base ? { ...base, score: scored.score, scoreComponents: scored.components } : null;
        })
        .filter((option): option is TripOption => option !== null);

    return {
        options: optionsOut,
        warnings,
        confidence: buildConfidence({
            searched: plan.calls.length,
            returned: draft.size,
            staleQuotes,
            manualChecks,
            orchestrationStatuses,
            options: optionsOut,
        }),
        candidateSpread: getCandidateSpread(rankable),
        payloads,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Confidence — computed from the payloads, never asserted
// ─────────────────────────────────────────────────────────────────────────────

interface ConfidenceInput {
    searched: number;
    returned: number;
    staleQuotes: number;
    manualChecks: number;
    orchestrationStatuses: string[];
    options: TripOption[];
}

export const buildConfidence = (input: ConfidenceInput): SearchConfidence => {
    const drivers: string[] = [];
    const degraded = input.orchestrationStatuses.some((status) => status !== 'OK');

    if (input.returned < input.searched) {
        drivers.push(`${input.searched - input.returned} of ${input.searched} searches returned nothing usable.`);
    }
    if (input.staleQuotes > 0) {
        drivers.push(`${input.staleQuotes} price${input.staleQuotes === 1 ? '' : 's'} came from cache.`);
    }
    if (input.manualChecks > 0) {
        drivers.push(`${input.manualChecks} option${input.manualChecks === 1 ? '' : 's'} carry an unverified cost line.`);
    }
    if (degraded) {
        drivers.push('The backend reported degraded orchestration.');
    }

    const allExact = input.options.length > 0 && input.options.every((o) => o.total.status === 'EXACT');

    let level: DataConfidence = 'mixed';
    if (input.manualChecks > 0 || degraded || input.returned === 0) {
        level = 'estimated';
    } else if (allExact && input.staleQuotes === 0 && input.returned === input.searched) {
        level = 'live';
        drivers.push('Every cost line is exact and every search returned.');
    }

    return {
        level,
        candidatesSearched: input.searched,
        candidatesReturned: input.returned,
        staleQuotes: input.staleQuotes,
        manualChecks: input.manualChecks,
        orchestrationStatuses: input.orchestrationStatuses,
        drivers,
    };
};
