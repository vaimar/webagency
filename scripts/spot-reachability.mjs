#!/usr/bin/env node
/**
 * Which of the catalogue's arrival airports a traveller can actually fly to.
 *
 * `spot-coverage-audit.mjs` takes reachability as an INPUT (`--airports=`),
 * because it does not probe the fare feed itself. Supplying that set by hand is
 * how "trip-ready" becomes a number about whoever typed the list. This measures
 * it instead, so the audit's headline figure is derived rather than asserted.
 *
 *   node scripts/spot-reachability.mjs                       # human-readable
 *   node scripts/spot-reachability.mjs --json                # machine-readable
 *   node scripts/spot-reachability.mjs --print-audit-command # paste-ready
 *
 * WHY THE SCHEDULE GRAPH AND NOT /api/flights. The audit's header records a
 * provider limitation — /api/flights ignores its `date` parameter, so no probe
 * against it can state a travel window, so nothing can ever be trip-ready. That
 * is true of /api/flights and NOT true of /api/trips/hacker-routes, which takes
 * a date and answers for that date. Probing the schedule graph is what lets a
 * travel window be stated honestly.
 *
 * What "reachable" means here, exactly: the schedule graph returns at least one
 * itinerary from the origin on at least one of the sampled dates. It is a claim
 * about a flight EXISTING, never about a fare — a route with no price is still
 * a way in, and the audit's own tiers keep those apart. Weekday-patterned
 * routes are why several dates are sampled rather than one: a Tuesday-only
 * service is not unreachable, it is Tuesday.
 */

const arg = (name, fallback = undefined) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const API = arg('api', process.env.REACT_APP_API_BASE || 'http://localhost:9090');
const ACTIVITY = arg('activity', 'wakeboarding');
const ORIGIN = (arg('origin', 'DUB') || 'DUB').toUpperCase();
const CONCURRENCY = Number.parseInt(arg('concurrency', '6'), 10);
const asJson = process.argv.includes('--json');
const asCommand = process.argv.includes('--print-audit-command');

/**
 * Dates to sample, spread across the window rather than clustered.
 *
 * Three is a compromise, and it errs toward calling something unreachable: a
 * route flying one weekday that none of the three lands on reads as no route.
 * Raise it with --samples when the answer is going to be quoted.
 */
const SAMPLES = Number.parseInt(arg('samples', '3'), 10);
const WINDOW_DAYS = Number.parseInt(arg('window-days', '12'), 10);

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

const today = new Date();
const windowStart = addDays(today, 2);
const sampleDates = Array.from({ length: SAMPLES }, (_, i) => iso(
    addDays(windowStart, Math.round((i * (WINDOW_DAYS - 2)) / Math.max(SAMPLES - 1, 1))),
));

/**
 * One retry, because a transient failure here does not look like a failure.
 *
 * Without it, a probe that timed out under concurrency was indistinguishable
 * from "no route on that date", and the direct-flight count swung between 31
 * and 36 across consecutive runs of an unchanged catalogue. A metric that moves
 * when nothing moved is not a metric.
 */
const getJson = async (path, attempts = 2) => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(`${API}${path}`);
            if (response.ok) return await response.json();
        } catch {
            // fall through to the retry
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
    return null;
};

/** Every arrival airport the catalogue names, and which spots named it. */
const collectAirports = async () => {
    const list = await getJson(`/api/destinations/spots?activity=${encodeURIComponent(ACTIVITY)}`);
    if (!Array.isArray(list)) {
        console.error(`Could not read the spot catalogue from ${API}. Is the backend running?`);
        process.exit(2);
    }
    const byAirport = new Map();
    let withSlug = 0;
    for (const summary of list.filter((s) => s.slug)) {
        withSlug += 1;
        const access = await getJson(`/api/spots/${encodeURIComponent(summary.slug)}/arrival`);
        for (const airport of access?.airports ?? []) {
            if (!airport?.iata) continue;
            const code = airport.iata.toUpperCase();
            if (!byAirport.has(code)) byAirport.set(code, []);
            byAirport.get(code).push(summary.slug);
        }
    }
    return { byAirport, withSlug, catalogue: list.length };
};

const run = async () => {
    const { byAirport, withSlug, catalogue } = await collectAirports();
    const airports = [...byAirport.keys()].sort();

    // A failed probe is a finding, not a non-event: counting it as unreachable
    // would quietly shrink the coverage set every time the backend hiccupped.
    // `sampled` is what every figure below is a fraction of — an airport whose
    // probes all failed contributes to neither the reachable set nor the
    // unreachable one, and is reported separately as unmeasured.
    const probeOne = async (iata) => {
        const row = {
            iata, reachable: false, direct: 0, selfTransfer: 0,
            sampled: 0, errors: 0, spots: byAirport.get(iata).length,
        };
        for (const date of sampleDates) {
            const routes = await getJson(
                `/api/trips/hacker-routes?origin=${ORIGIN}&destination=${iata}&date=${date}`,
            );
            if (!Array.isArray(routes)) { row.errors += 1; continue; }
            row.sampled += 1;
            if (routes.length > 0) row.reachable = true;
            row.direct = Math.max(row.direct, routes.filter((r) => r.type === 'DIRECT').length);
            row.selfTransfer = Math.max(row.selfTransfer, routes.filter((r) => r.type === 'SELF_TRANSFER').length);
        }
        return row;
    };

    const rows = [];
    for (let i = 0; i < airports.length; i += CONCURRENCY) {
        rows.push(...await Promise.all(airports.slice(i, i + CONCURRENCY).map(probeOne)));
    }

    const reachable = rows.filter((r) => r.reachable);
    // Unreachable means measured and empty. An airport with no successful
    // sample is unmeasured, and saying so is the difference between a number
    // that means something and one that moves on its own.
    const unreachable = rows.filter((r) => !r.reachable && r.sampled > 0);
    const unknown = rows.filter((r) => !r.reachable && r.sampled === 0);
    const partial = rows.filter((r) => r.sampled > 0 && r.sampled < sampleDates.length);
    const set = reachable.map((r) => r.iata).sort();
    const fetchedAt = new Date().toISOString();

    if (asJson) {
        console.log(JSON.stringify({
            origin: ORIGIN, activity: ACTIVITY, fetchedAt,
            travelWindow: { start: sampleDates[0], end: sampleDates[sampleDates.length - 1] },
            sampleDates, catalogue, withSlug,
            airportsProbed: rows.length, reachableAirports: set,
            unmeasured: unknown.map((r) => r.iata), partiallySampled: partial.map((r) => r.iata), rows,
        }, null, 2));
        return;
    }

    const command = 'node scripts/spot-coverage-audit.mjs \\\n'
        + `  --origin=${ORIGIN} \\\n`
        + `  --airports=${set.join(',')} \\\n`
        + `  --coverage-fetched-at=${fetchedAt} \\\n`
        + `  --travel-window-start=${sampleDates[0]} \\\n`
        + `  --travel-window-end=${sampleDates[sampleDates.length - 1]}`;

    if (asCommand) { console.log(command); return; }

    console.log(`Reachability from ${ORIGIN} — ${ACTIVITY}`);
    console.log(`${API} · ${catalogue} spots (${withSlug} with a slug) · sampled ${sampleDates.join(', ')}\n`);
    console.log(`  airports named by the catalogue : ${rows.length}`);
    console.log(`  reachable                       : ${reachable.length}`);
    console.log(`    with a direct flight          : ${reachable.filter((r) => r.direct > 0).length}`);
    console.log(`    self-transfer only            : ${reachable.filter((r) => r.direct === 0).length}`);
    console.log(`  no itinerary on any sampled date: ${unreachable.length}`);
    if (unknown.length > 0) {
        console.log(`  UNMEASURED — every probe failed : ${unknown.length} (${unknown.map((r) => r.iata).join(', ')})`);
        console.log('    Not counted as reachable OR unreachable. Re-run before quoting a total.');
    }
    if (partial.length > 0) {
        console.log(`  partially sampled               : ${partial.length} (some dates failed; direct counts are floors)`);
    }
    console.log('\nUnreachable, and how many spots each one strands:');
    for (const row of unreachable.sort((a, b) => b.spots - a.spots).slice(0, 15)) {
        console.log(`  ${row.iata}  ${row.spots} spot(s)`);
    }
    console.log('\nFeed the measured set to the audit:\n');
    console.log(command);
};

run().catch((error) => { console.error(error); process.exit(1); });
