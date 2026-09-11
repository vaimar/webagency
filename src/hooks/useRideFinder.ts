// The Ride Finder state machine.
//
// States map to docs/ai-intent-layer.md §01b. Two notes on the mapping:
//
//  - results_partial / results_degraded are not separate statuses here. They
//    render the same layout as `results` with a banner, so they are a derived
//    `quality` field rather than three near-identical branches.
//  - `parsing` and `narrative_failed` are model-gated. The parser is injected
//    and currently absent, so `parsing` is skipped; the machine already
//    handles it so wiring the model later needs no rework.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: editing a chip re-enters at
// `searching`, never at `parsing`. Re-running the parser on a chip edit would
// let a correction to one field silently move another.

import { useCallback, useMemo, useRef, useState } from 'react';
import { RideSpot } from '../data/rideSpots';
import {
    assessMateriality,
    FollowUp,
    IntentWarning,
    mergeProfileIntoIntent,
    normalizeTripIntent,
    ProfileContext,
    ResolvedIntent,
} from '../services/tripIntent';
import { ExecutionPlan, planSearch } from '../services/tripPlanner';
import { executePlan, ExploreFetcher, SearchResult } from '../services/tripSearch';

export type SearchProgress = Record<string, 'pending' | 'done' | 'failed'>;

export type ResultQuality = 'full' | 'partial' | 'degraded';

export type RideFinderState =
    | { status: 'idle' }
    | { status: 'parsing'; text: string }
    | { status: 'needs_answer'; intent: ResolvedIntent; followUp: FollowUp; warnings: IntentWarning[] }
    | { status: 'searching'; intent: ResolvedIntent; plan: ExecutionPlan; progress: SearchProgress }
    | {
        status: 'results';
        intent: ResolvedIntent;
        plan: ExecutionPlan;
        result: SearchResult;
        quality: ResultQuality;
        warnings: IntentWarning[];
    }
    | { status: 'no_backing'; intent: ResolvedIntent; plan: ExecutionPlan; warnings: IntentWarning[] }
    | { status: 'error'; message: string; intent: ResolvedIntent | null };

/** Turns raw user text into a TripIntent. Absent until the parse model lands. */
export type IntentParser = (text: string) => Promise<unknown>;

export interface UseRideFinderOptions {
    parser?: IntentParser;
    fetcher?: ExploreFetcher;
    profileContext?: ProfileContext;
    spots?: RideSpot[];
    now?: Date;
    firstMileMode?: 'rental_car' | 'public_transport';
}

const deriveQuality = (result: SearchResult): ResultQuality => {
    if (result.warnings.some((w) => w.kind === 'BACKEND_DEGRADED')) {
        return 'degraded';
    }
    if (result.warnings.some((w) => w.kind === 'PARTIAL_FANOUT' || w.kind === 'CALL_FAILED')) {
        return 'partial';
    }
    return 'full';
};

export const useRideFinder = (options: UseRideFinderOptions = {}) => {
    const [state, setState] = useState<RideFinderState>({ status: 'idle' });
    /** Guards against a slow earlier search overwriting a newer one. */
    const runId = useRef(0);

    const { parser, fetcher, profileContext, spots, now, firstMileMode } = options;

    /**
     * Plans and executes. Every entry point that is not initial parsing lands
     * here — including chip edits, follow-up answers and relaxations.
     */
    const runSearch = useCallback(async (
        intent: ResolvedIntent,
        intentWarnings: IntentWarning[] = [],
    ) => {
        const currentRun = runId.current + 1;
        runId.current = currentRun;

        const followUp = assessMateriality(intent, { now });
        if (followUp) {
            setState({ status: 'needs_answer', intent, followUp, warnings: intentWarnings });
            return;
        }

        const plan = planSearch(intent, { now, spots, firstMileMode });

        if (plan.blocked || plan.calls.length === 0) {
            setState({ status: 'no_backing', intent, plan, warnings: intentWarnings });
            return;
        }

        const progress: SearchProgress = {};
        for (const call of plan.calls) {
            progress[call.spotLabel] = 'pending';
        }
        setState({ status: 'searching', intent, plan, progress: { ...progress } });

        try {
            const result = await executePlan(plan, {
                fetcher,
                profile: intent.weightProfile,
                onCallSettled: (spotLabel, ok) => {
                    if (runId.current !== currentRun) {
                        return;
                    }
                    progress[spotLabel] = ok ? 'done' : 'failed';
                    setState((prev) => (
                        prev.status === 'searching' ? { ...prev, progress: { ...progress } } : prev
                    ));
                },
            });

            if (runId.current !== currentRun) {
                return;
            }

            // Every candidate dropped for want of backing is the no_backing
            // state, not an empty results page.
            if (result.options.length === 0) {
                setState({ status: 'no_backing', intent, plan, warnings: intentWarnings });
                return;
            }

            setState({
                status: 'results',
                intent,
                plan,
                result,
                quality: deriveQuality(result),
                warnings: intentWarnings,
            });
        } catch (error) {
            if (runId.current !== currentRun) {
                return;
            }
            setState({
                status: 'error',
                message: error instanceof Error ? error.message : 'Search failed.',
                intent,
            });
        }
    }, [fetcher, firstMileMode, now, spots]);

    /** Entry point from the text box. The only path that touches the parser. */
    const submitText = useCallback(async (text: string) => {
        if (!parser) {
            // No model wired yet: start from an empty intent and let the chips
            // carry everything. The flow still works end to end.
            const seeded = normalizeTripIntent({});
            const merged = mergeProfileIntoIntent(seeded.intent, profileContext ?? {});
            await runSearch(merged.intent, [...seeded.warnings, ...merged.warnings]);
            return;
        }

        setState({ status: 'parsing', text });
        try {
            const raw = await parser(text);
            const normalized = normalizeTripIntent(raw);
            const merged = mergeProfileIntoIntent(normalized.intent, profileContext ?? {});
            await runSearch(merged.intent, [...normalized.warnings, ...merged.warnings]);
        } catch (error) {
            setState({
                status: 'error',
                message: error instanceof Error ? error.message : 'Could not read that.',
                intent: null,
            });
        }
    }, [parser, profileContext, runSearch]);

    /** Search a known-good intent directly, bypassing the model entirely. */
    const submitIntent = useCallback(
        (intent: ResolvedIntent) => runSearch(intent),
        [runSearch],
    );

    /**
     * Chip edits re-enter at the search step. They mutate ResolvedIntent and
     * re-plan — the parser is NOT in this path, by design.
     */
    const updateChip = useCallback(<K extends keyof ResolvedIntent>(field: K, value: ResolvedIntent[K]) => {
        setState((prev) => {
            const current = 'intent' in prev ? prev.intent : null;
            if (!current) {
                return prev;
            }
            const next: ResolvedIntent = {
                ...current,
                [field]: value,
                sources: { ...current.sources, [field]: 'user' },
            };
            void runSearch(next);
            return prev;
        });
    }, [runSearch]);

    const answerFollowUp = useCallback((value: unknown) => {
        setState((prev) => {
            if (prev.status !== 'needs_answer') {
                return prev;
            }
            const next: ResolvedIntent = {
                ...prev.intent,
                [prev.followUp.field]: value,
                sources: { ...prev.intent.sources, [prev.followUp.field]: 'user' },
            } as ResolvedIntent;
            void runSearch(next, prev.warnings);
            return prev;
        });
    }, [runSearch]);

    /** Applies the planner's computed relaxation — never a guessed one. */
    const applyRelaxation = useCallback(() => {
        setState((prev) => {
            if (prev.status !== 'no_backing' || !prev.plan.blocked?.relaxation) {
                return prev;
            }
            const { dropFilter } = prev.plan.blocked.relaxation;
            const next: ResolvedIntent = { ...prev.intent, sources: { ...prev.intent.sources } };

            if (dropFilter === 'rideSurface' || dropFilter === 'allVenueFacts') {
                next.rideSurface = null;
            }
            if (dropFilter === 'skillLevel' || dropFilter === 'allVenueFacts') {
                next.skillLevel = null;
            }
            if (dropFilter === 'dateWindow' || dropFilter === 'allVenueFacts') {
                next.dateWindow = null;
            }

            void runSearch(next, prev.warnings);
            return prev;
        });
    }, [runSearch]);

    const reset = useCallback(() => {
        runId.current += 1;
        setState({ status: 'idle' });
    }, []);

    const intent = useMemo(() => ('intent' in state ? state.intent : null), [state]);

    return { state, intent, submitText, submitIntent, updateChip, answerFollowUp, applyRelaxation, reset };
};
