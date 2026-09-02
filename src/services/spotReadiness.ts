/**
 * Typed access to the shared readiness rule.
 *
 * The rule itself lives in `spot-readiness.js` at the repo root, because
 * `scripts/spot-coverage-audit.mjs` runs under Node and this runs in the Vite
 * bundle, and they must apply identical conditions. This file adds types and
 * re-exports; it deliberately contains no logic of its own, so there is nothing
 * here that can drift from the audit.
 */

import {
    assessReadiness as assess,
    DECISION_CHECKS,
    FRESH_DAYS,
    MAX_DECISION,
    MAX_PRESENTATION,
    PRESENTATION_CHECKS,
    READINESS_COPY as COPY,
    COVERAGE_TTL_DAYS,
    evaluateCoverage,
} from '../../spot-readiness.js';

export type ReadinessTier = 'trip-ready' | 'needs-verification' | 'not-auditable';

export interface ReadinessRecord {
    prices?: Array<{
        sourceUrl?: string | null;
        observedAt?: string | null;
        includesGear?: boolean | null;
    }> | null;
    seasonStartMonth?: number | null;
    seasonEndMonth?: number | null;
    tractionType?: string | null;
    cableTowers?: number | null;
    fullCableCount?: number | null;
    systemTwoCount?: number | null;
    gearRental?: boolean | null;
    websiteUrl?: string | null;
    imageUrl?: string | null;
    setupNotes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    access?: {
        airports?: Array<{ iata?: string | null }> | null;
        station?: unknown;
        drivingDirectionsUrl?: string | null;
    } | null;
}

/**
 * A dated fare-coverage probe. Not a bare airport list: the fare cache holds a
 * short forward window, so "DUB reaches NTE" is only true for the dates it was
 * fetched for. An undated or expired snapshot is treated as unknown, so a spot
 * cannot keep a trip-ready badge after its only fare path has gone.
 */
export interface FareCoverage {
    origin: string;
    airports: string[];
    provider: string;
    /** ISO timestamp of the probe. */
    fetchedAt: string;
    /**
     * ISO dates the probed fares were valid between. Required: a fresh probe
     * for the wrong dates is not usable coverage. Note that the current
     * provider cannot supply these — /api/flights ignores `date` — so any
     * snapshot built from it is reported as
     * 'fare schedule window unavailable from provider'.
     */
    travelWindowStart: string;
    travelWindowEnd: string;
    /** Overrides COVERAGE_TTL_DAYS. */
    ttlDays?: number;
}

export interface ReadinessOptions {
    fareCoverage?: FareCoverage | null;
    /** ISO date of the trip being priced, checked against the probed window. */
    tripDate?: string | null;
    freshDays?: number;
    /** true when the access lookup errored, as opposed to returning nothing. */
    accessLookupFailed?: boolean;
    /** false when there is no detail record to inspect — yields 'not-auditable'. */
    auditable?: boolean;
}

export interface Readiness {
    tier: ReadinessTier;
    /** Required facts that are absent, stale, or uncheckable. */
    missing: string[];
    /** Every gap, including the non-blocking ones. */
    gaps: string[];
    lastVerified: Date | null;
    stale: boolean;
    decisionScore: number | null;
    presentationScore: number | null;
}

export const assessReadiness = (
    record: ReadinessRecord,
    options?: ReadinessOptions,
): Readiness => assess(record, options) as Readiness;

export const READINESS_COPY = COPY as Record<ReadinessTier, { label: string; meaning: string }>;

export { DECISION_CHECKS, PRESENTATION_CHECKS, FRESH_DAYS, MAX_DECISION, MAX_PRESENTATION, COVERAGE_TTL_DAYS, evaluateCoverage };
