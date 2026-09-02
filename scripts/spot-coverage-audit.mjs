#!/usr/bin/env node
/**
 * Coverage audit for the beta catalogue.
 *
 * The beta's promise is that a Dublin traveller learns something here they
 * cannot get from a map. That is a claim about *record completeness*, not about
 * features — a spot with a pin and a website is strictly worse than Google
 * Maps, and 105 of those do not add up to one useful one.
 *
 * This scores every spot against the fields that make a record decisively
 * better than a map pin, and prints a ranked worklist: which spots are closest
 * to complete, and exactly which facts each one is missing. It never guesses a
 * missing value — an absent fact is reported absent, which is the same rule the
 * product applies to travellers.
 *
 *   node scripts/spot-coverage-audit.mjs
 *   node scripts/spot-coverage-audit.mjs --activity=wakeboarding --limit=30
 *   node scripts/spot-coverage-audit.mjs --airports=CDG,BVA,BCN,AGP  # reachable set
 *   node scripts/spot-coverage-audit.mjs --json > coverage.json
 *
 * `--airports` takes the airports a traveller can actually fly to, and must be
 * accompanied by `--coverage-fetched-at` — this script does not probe the fare
 * feed, so reachability is an input, and an undated input cannot be shown to
 * still be true:
 *
 *   node scripts/spot-coverage-audit.mjs \
 *     --airports=BCN,PMI,NTE,AGP --coverage-fetched-at=2026-08-27T20:00:00Z \
 *     --travel-window-start=2026-08-27 --travel-window-end=2026-09-09
 *
 * Known limitation, and it is a provider one: /api/flights ignores its `date`
 * parameter, so no probe against it can state a travel window. Until that
 * contract changes, every record reports
 * "way in (fare schedule window unavailable from provider)" and nothing can be
 * trip-ready. That is the honest result, not a bug in this script.
 */

const arg = (name, fallback = undefined) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const API = arg('api', 'http://localhost:9090');
const ACTIVITY = arg('activity', 'wakeboarding');
const LIMIT = Number.parseInt(arg('limit', '40'), 10);
const REACHABLE = (arg('airports', '') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
// Presence, not emptiness. `--airports=` means "tested, and nothing is covered"
// — which must fail every record. Omitting the flag means coverage is unknown.
// Collapsing the two would let an empty tested set read as permissive.
const hasAirportsFilter = process.argv.some((a) => a.startsWith('--airports='));

// Never defaulted to "now". This script does not probe the fare feed — the
// airport list is supplied from outside, so this run has no idea when it was
// gathered or which dates it covers. Stamping it with the current time would
// relabel arbitrarily stale coverage as fresh, which is the exact failure the
// dated snapshot exists to prevent.
const COVERAGE_FETCHED_AT = arg('coverage-fetched-at', null);
const TRAVEL_WINDOW_START = arg('travel-window-start', null);
const TRAVEL_WINDOW_END = arg('travel-window-end', null);

if (hasAirportsFilter && !COVERAGE_FETCHED_AT) {
    console.error(
        '--airports requires --coverage-fetched-at=<ISO timestamp>.\n\n'
        + 'This script does not probe the fare feed; the airport list comes from\n'
        + 'outside, so only the caller knows when it was gathered.',
    );
    process.exit(2);
}

if (hasAirportsFilter && !Number.isFinite(Date.parse(COVERAGE_FETCHED_AT))) {
    // Caught here rather than downstream: an unparsable timestamp would reach
    // evaluateCoverage as NaN and be reported as 'undated', blaming the
    // snapshot for what is actually a typo in the argument.
    console.error(`--coverage-fetched-at is not a parsable timestamp: "${COVERAGE_FETCHED_AT}"`);
    process.exit(2);
}

// One boundary without the other is malformed input, not a provider
// limitation. Letting it through would report the caller's mistake as
// 'fare schedule window unavailable from provider' and send someone to fix the
// wrong thing entirely.
if (hasAirportsFilter && Boolean(TRAVEL_WINDOW_START) !== Boolean(TRAVEL_WINDOW_END)) {
    console.error(
        'Supply both --travel-window-start and --travel-window-end, or neither.\n'
        + 'Only one boundary is malformed input; omitting both is the expected\n'
        + 'case while the provider cannot state a window.',
    );
    process.exit(2);
}

for (const [flag, value] of [['--travel-window-start', TRAVEL_WINDOW_START], ['--travel-window-end', TRAVEL_WINDOW_END]]) {
    if (value && !Number.isFinite(Date.parse(value))) {
        console.error(`${flag} is not a parsable date: "${value}"`);
        process.exit(2);
    }
}

if (hasAirportsFilter && TRAVEL_WINDOW_START && Date.parse(TRAVEL_WINDOW_START) > Date.parse(TRAVEL_WINDOW_END)) {
    console.error('--travel-window-start is after --travel-window-end.');
    process.exit(2);
}

if (hasAirportsFilter && !(TRAVEL_WINDOW_START && TRAVEL_WINDOW_END)) {
    // Deliberately a warning rather than a hard failure: the current provider
    // *cannot* supply a window, so requiring one outright would make the flag
    // unusable. The snapshot is passed through without one and every record is
    // correctly reported as 'fare schedule window unavailable from provider'.
    console.error(
        'Warning: --travel-window-start/--travel-window-end not given.\n'
        + 'No record can be trip-ready without them. This is currently expected:\n'
        + '/api/flights ignores its `date` parameter, so the provider cannot say\n'
        + 'which dates its fares apply to. That limitation stays visible in the\n'
        + 'output until the provider contract changes.\n',
    );
}

const asJson = process.argv.includes('--json');

const getJson = async (path) => {
    const response = await fetch(`${API}${path}`);
    if (!response.ok) return null;
    return response.json();
};

// The rule lives in one place. Copying these conditions into the audit would
// guarantee the badge in the UI and this worklist eventually disagree.
import {
    assessReadiness,
    DECISION_CHECKS,
    PRESENTATION_CHECKS,
    MAX_DECISION,
    MAX_PRESENTATION,
    newestObservedAt,
} from '../spot-readiness.js';

const FRESH_DAYS = Number.parseInt(arg('fresh-days', '180'), 10);

const run = async () => {
    const list = await getJson(`/api/destinations/spots?activity=${encodeURIComponent(ACTIVITY)}`);
    if (!Array.isArray(list)) {
        console.error(`Could not read the spot catalogue from ${API}. Is the backend running?`);
        process.exit(2);
    }

    const withSlug = list.filter((s) => s.slug);
    const withoutSlug = list.filter((s) => !s.slug);
    const rows = [];
    // A dropped record is a finding, not a non-event. Silently skipping a
    // failed fetch lets partial coverage read as complete coverage downstream.
    const failedDetails = [];
    const failedAccess = [];

    // Sequential on purpose: this hits a dev backend, and the point is an
    // accurate audit, not a fast one.
    for (const summary of withSlug) {
        const detail = await getJson(`/api/spots/${encodeURIComponent(summary.slug)}`);
        if (!detail) {
            failedDetails.push({ slug: summary.slug, name: summary.destinationLabel ?? summary.slug });
            continue;
        }
        const access = await getJson(`/api/spots/${encodeURIComponent(summary.slug)}/arrival`);
        if (!access) failedAccess.push({ slug: summary.slug, name: summary.destinationLabel ?? summary.slug });
        // imageUrl is only on the list payload; curationLevel is on both, and is
        // taken from the list so provenance has one unambiguous source.
        const spot = {
            ...detail,
            imageUrl: summary.imageUrl,
            curationLevel: summary.curationLevel ?? detail.curationLevel ?? null,
            access,
        };

        const readiness = assessReadiness(spot, {
            freshDays: FRESH_DAYS,
            // Only a supplied set counts as tested; without --airports the
            // access check correctly reports coverage as untested rather than
            // silently passing.
            // Dated snapshot, not a bare list: the fare cache has a short
            // forward window, and an undated set would let trip-ready outlive
            // the fare path it was based on.
            fareCoverage: hasAirportsFilter ? {
                origin: arg('origin', 'DUB'),
                airports: REACHABLE,
                provider: arg('provider', 'ryanair-cache'),
                fetchedAt: COVERAGE_FETCHED_AT,
                travelWindowStart: TRAVEL_WINDOW_START,
                travelWindowEnd: TRAVEL_WINDOW_END,
            } : null,
            accessLookupFailed: access === null,
        });
        const observed = newestObservedAt(spot);
        // Every candidate, never a truncated set: an arbitrary API ordering
        // must not decide which arrival airports are eligible.
        const airports = (access?.airports ?? []).map((a) => a.iata);

        rows.push({
            slug: spot.slug,
            name: spot.destinationLabel ?? spot.name,
            country: spot.country,
            // Provenance only — never an input to either score.
            curation: spot.curationLevel,
            lastVerified: Number.isFinite(observed) ? new Date(observed).toISOString() : null,
            tier: readiness.tier,
            decisionScore: readiness.decisionScore,
            decisionPct: Math.round((readiness.decisionScore / MAX_DECISION) * 100),
            decisionMissing: readiness.missing,
            decisionGaps: readiness.gaps,
            presentationScore: readiness.presentationScore,
            presentationPct: Math.round((readiness.presentationScore / MAX_PRESENTATION) * 100),
            airports,
            // A spot qualifies if ANY arrival candidate is fare-covered.
            reachable: hasAirportsFilter ? airports.some((a) => REACHABLE.includes(a)) : null,
            priceCount: (spot.prices ?? []).length,
        });
    }

    const eligible = rows.filter((r) => r.reachable !== false);
    eligible.sort((a, b) => b.decisionScore - a.decisionScore || a.name.localeCompare(b.name));

    if (asJson) {
        console.log(JSON.stringify({
            // Accounting first: any consumer of this file must be able to see
            // what was NOT covered before trusting what was.
            // The coverage this run was given, so an artifact self-describes
            // rather than relying on a filename. A file with
            // windowSupplied:false cannot support a trip-ready claim, and one
            // with a hand-supplied window is a mechanism test, not evidence.
            coverageSnapshot: hasAirportsFilter ? {
                origin: arg('origin', 'DUB'),
                provider: arg('provider', 'ryanair-cache'),
                airports: REACHABLE,
                fetchedAt: COVERAGE_FETCHED_AT,
                travelWindowStart: TRAVEL_WINDOW_START,
                travelWindowEnd: TRAVEL_WINDOW_END,
                windowSupplied: Boolean(TRAVEL_WINDOW_START && TRAVEL_WINDOW_END),
                usableForTripReady: Boolean(TRAVEL_WINDOW_START && TRAVEL_WINDOW_END),
                note: TRAVEL_WINDOW_START
                    ? 'Window was supplied by the caller. No probe against the current fare provider can produce one, so verify its origin before treating this as evidence.'
                    : 'No travel window: /api/flights ignores `date`, so the provider cannot state one. No record can be trip-ready.',
            } : { tested: false, note: 'Fare coverage was not tested; no record can be trip-ready.' },
            catalogueCount: list.length,
            auditableCount: withSlug.length,
            auditedCount: rows.length,
            unauditable: withoutSlug.map((s) => ({
                slug: null,
                name: s.destinationLabel ?? s.name ?? null,
                country: s.country ?? null,
                curation: s.curationLevel ?? null,
                reason: 'no slug — no detail endpoint, so no field can be evidenced',
            })),
            failedDetails,
            failedAccess,
            maxDecision: MAX_DECISION,
            maxPresentation: MAX_PRESENTATION,
            freshDays: FRESH_DAYS,
            decisionRequirements: DECISION_CHECKS.map(({ key, label, weight, required, why }) => ({ key, label, weight, required, why })),
            presentationRequirements: PRESENTATION_CHECKS.map(({ key, label, weight, why }) => ({ key, label, weight, why })),
            rows: eligible,
        }, null, 2));
        return;
    }

    // Tier counts come from every audited record, not from the display subset.
    // Counting over `eligible` made an explicitly empty coverage set report
    // "0 needs verification", which reads as nothing to do rather than nothing
    // covered.
    const decisionReady = rows.filter((r) => r.tier === 'trip-ready');
    const needsVerification = rows.filter((r) => r.tier === 'needs-verification');

    console.log(`\nSpot coverage — ${ACTIVITY}`);
    console.log(`${API} · ${withSlug.length} spots with a slug · freshness window ${FRESH_DAYS} days`);
    console.log(hasAirportsFilter
        ? `fare-covered airports: ${REACHABLE.join(', ') || '(none — tested, zero covered)'}\n`
        : 'fare coverage NOT tested — no record can be trip-ready\n');

    if (withoutSlug.length) {
        // Reported, never silently dropped: these have no detail endpoint, so
        // no field can be evidenced for them — which is itself a finding.
        const levels = {};
        for (const s of withoutSlug) levels[s.curationLevel] = (levels[s.curationLevel] ?? 0) + 1;
        console.log(`  NOT AUDITABLE — no slug, so no detail record : ${withoutSlug.length}`);
        console.log(`        ${Object.entries(levels).map(([k, v]) => `${v} ${k}`).join(', ')}`);
        console.log(`        ${withoutSlug.slice(0, 4).map((s) => s.destinationLabel).join(' · ')}${withoutSlug.length > 4 ? ' …' : ''}`);
        console.log(`        These cannot reach a detail page or be scored at all until they have a slug.`);
    }

    if (failedDetails.length || failedAccess.length) {
        console.log(`  FETCH FAILURES — detail ${failedDetails.length}, access ${failedAccess.length}`);
        console.log(`        Coverage below is incomplete by that many records.`);
    }

    console.log(`  audited                    : ${rows.length}`);
    console.log(`  trip-ready                 : ${decisionReady.length}`);
    console.log(`  needs verification         : ${needsVerification.length}`);
    if (hasAirportsFilter) {
        console.log(`  with a fare-covered way in : ${rows.filter((r) => r.reachable).length}`);
    }

    console.log(hasAirportsFilter
        ? `\nRanked by decision readiness, limited to records with a fare-covered way in:\n`
        : `\nRanked by decision readiness (presentation shown separately, never gating):\n`);
    for (const row of eligible.slice(0, LIMIT)) {
        console.log(`  decision ${String(row.decisionPct).padStart(3)}%  presentation ${String(row.presentationPct).padStart(3)}%  ${row.name} (${row.country})`);
        console.log(`        ${row.slug} · ${row.curation} · ${row.priceCount} tariff row(s) · verified ${row.lastVerified?.slice(0, 10) ?? 'never'}`);
        console.log(`        airports: ${row.airports.join(', ') || 'none'}`);
        if (row.decisionMissing.length) console.log(`        missing (decision): ${row.decisionMissing.join(', ')}`);
    }

    console.log('\nDecision facts missing most often:\n');
    const tally = {};
    for (const row of rows) for (const label of row.decisionMissing) tally[label] = (tally[label] ?? 0) + 1;
    Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([label, count]) => {
        const requirement = DECISION_CHECKS.find((r) => r.label === label);
        console.log(`  ${String(count).padStart(4)}  ${label}`);
        console.log(`        ${requirement?.why ?? ''}`);
    });
    console.log();
};

await run();
