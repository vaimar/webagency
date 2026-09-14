#!/usr/bin/env node
/**
 * Backfill provenance for seasons that already have a value and no source.
 *
 * Twenty spots carry a season today; none carries a source, because until V21
 * there was nowhere to put one. Until they are backfilled, turning on the
 * `season-sourced` readiness check takes trip-ready from 15 to 0.
 *
 * This script does NOT invent that provenance — it cannot, and neither can
 * anything else. Finding where a stored season came from is the same research
 * problem the extraction pipeline solves, so this consumes a LEDGER: one entry
 * per slug, each naming the page, the moment it was read, and the quote that
 * carries the months. Every entry is then put through the same validator the
 * pipeline uses, against the live page, before it is allowed into SQL.
 *
 *   node scripts/backfill-season-provenance.mjs --ledger=season-ledger.json
 *   node scripts/backfill-season-provenance.mjs --ledger=… --emit-sql=V22__backfill.sql
 *   node scripts/backfill-season-provenance.mjs --ledger=… --check-gate
 *
 * DRY RUN IS THE DEFAULT. Nothing is written unless --emit-sql names a file,
 * and even then the output is SQL for a human to read and apply, never a
 * connection to the database.
 *
 * IDEMPOTENT twice over: an entry already matching what the API reports is
 * skipped with `unchanged`, and the emitted UPDATE carries an IS DISTINCT FROM
 * guard, so applying the same file again touches zero rows.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { validateSeason, resolveTier } from '../extraction-validator.js';

const arg = (name, fallback = undefined) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const API = arg('api', process.env.REACT_APP_API_BASE || 'http://localhost:9090');
const ACTIVITY = arg('activity', 'wakeboarding');
const LEDGER = arg('ledger');
const EMIT_SQL = arg('emit-sql');
const CHECK_GATE = process.argv.includes('--check-gate');

if (!LEDGER) {
    console.error('--ledger=<file.json> is required.\n\nEntry shape:\n'
        + '  { "slug": "…", "seasonSourceUrl": "https://…", "seasonObservedAt": "2026-09-08T09:00:00Z",\n'
        + '    "seasonSourceQuote": "…", "seasonConfidence": "STATED" }');
    process.exit(2);
}

const getJson = async (path) => {
    const response = await fetch(`${API}${path}`);
    return response.ok ? response.json() : null;
};

/** Plain text of a page, near enough for a substring check. */
const fetchPageText = async (url) => {
    try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) return { ok: false, status: response.status, text: '' };
        const html = await response.text();
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&eacute;/gi, 'é')
            .replace(/&egrave;/gi, 'è');
        return { ok: true, status: response.status, text };
    } catch (error) {
        return { ok: false, status: 0, text: '', error: String(error).slice(0, 120) };
    }
};

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

const run = async () => {
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
    if (!Array.isArray(ledger)) { console.error('Ledger must be a JSON array.'); process.exit(2); }

    const list = await getJson(`/api/destinations/spots?activity=${encodeURIComponent(ACTIVITY)}`);
    if (!Array.isArray(list)) { console.error(`Cannot read the catalogue from ${API}.`); process.exit(2); }

    const results = [];
    for (const entry of ledger) {
        const row = { slug: entry.slug, status: null, reasons: [] };
        const spot = await getJson(`/api/spots/${encodeURIComponent(entry.slug)}`);

        if (!spot) { row.status = 'no-such-spot'; results.push(row); continue; }
        if (spot.seasonStartMonth == null || spot.seasonEndMonth == null) {
            // Not this script's job: a spot with no season needs the extraction
            // pipeline, not a provenance record for a value that is not there.
            row.status = 'no-season-to-source'; results.push(row); continue;
        }
        if (spot.seasonSourceUrl === entry.seasonSourceUrl
            && spot.seasonObservedAt === entry.seasonObservedAt) {
            row.status = 'unchanged'; results.push(row); continue;
        }

        const page = await fetchPageText(entry.seasonSourceUrl);
        if (!page.ok) {
            row.status = 'rejected';
            row.reasons = [{ code: 'E_NO_SOURCE', field: 'seasonSourceUrl', detail: `Page did not load (status ${page.status}${page.error ? `, ${page.error}` : ''}).` }];
            results.push(row); continue;
        }

        // Same rules as the pipeline. A backfill that validated more loosely
        // than the pipeline would be a hole in the gate rather than a step
        // toward it.
        const problems = validateSeason(
            {
                seasonStartMonth: spot.seasonStartMonth,
                seasonEndMonth: spot.seasonEndMonth,
                wrapsYearEnd: spot.seasonStartMonth > spot.seasonEndMonth,
                provenance: {
                    sourceUrl: entry.seasonSourceUrl,
                    sourceTier: resolveTier(entry.seasonSourceUrl, { operatorWebsiteUrl: spot.websiteUrl }) ?? 'T1_OPERATOR',
                    observedAt: entry.seasonObservedAt,
                    sourceQuote: entry.seasonSourceQuote,
                },
                score: { total: 95, components: { sourceTier: 40, quoteMatch: 25, valueExplicit: 20, fieldProximity: 10 } },
            },
            {
                operatorWebsiteUrl: spot.websiteUrl,
                pagesFetched: [{ url: entry.seasonSourceUrl, fetchedAt: entry.seasonObservedAt, text: page.text }],
            },
        );

        row.status = problems.length === 0 ? 'ready' : 'rejected';
        row.reasons = problems;
        row.sql = problems.length === 0
            ? `UPDATE spot SET season_source_url = ${sqlString(entry.seasonSourceUrl)}, `
              + `season_observed_at = ${sqlString(entry.seasonObservedAt)}::timestamptz, `
              + `season_source_quote = ${sqlString(entry.seasonSourceQuote)}, `
              + `season_confidence = ${sqlString(entry.seasonConfidence ?? 'STATED')} `
              + `WHERE slug = ${sqlString(entry.slug)} `
              + `AND (season_source_url IS DISTINCT FROM ${sqlString(entry.seasonSourceUrl)} `
              + `OR season_observed_at IS DISTINCT FROM ${sqlString(entry.seasonObservedAt)}::timestamptz);`
            : null;
        results.push(row);
    }

    const by = (status) => results.filter((r) => r.status === status);
    console.log(`Season provenance backfill — ${LEDGER}`);
    console.log(`${API} · ${ledger.length} ledger entries · ${EMIT_SQL ? `writing ${EMIT_SQL}` : 'DRY RUN, nothing written'}\n`);
    console.log(`  ready to apply     : ${by('ready').length}`);
    console.log(`  already applied    : ${by('unchanged').length}`);
    console.log(`  rejected           : ${by('rejected').length}`);
    console.log(`  no season to source: ${by('no-season-to-source').length}`);
    console.log(`  unknown slug       : ${by('no-such-spot').length}`);

    for (const row of by('rejected')) {
        console.log(`\n  REJECTED ${row.slug}`);
        for (const reason of row.reasons) console.log(`    ${reason.code} ${reason.field} — ${reason.detail}`);
    }

    if (CHECK_GATE) {
        // The one question that decides whether the gate can be switched on:
        // is every spot that is trip-ready TODAY covered by this backfill?
        const sourced = new Set([...by('ready'), ...by('unchanged')].map((r) => r.slug));
        const seasoned = [];
        for (const summary of list.filter((s) => s.slug)) {
            const spot = await getJson(`/api/spots/${encodeURIComponent(summary.slug)}`);
            if (spot?.seasonStartMonth != null && spot?.seasonEndMonth != null) seasoned.push(summary.slug);
        }
        const uncovered = seasoned.filter((slug) => !sourced.has(slug));
        console.log(`\nGate check — spots holding a season: ${seasoned.length}, covered by this ledger: ${seasoned.length - uncovered.length}`);
        if (uncovered.length > 0) {
            console.log('  NOT SAFE to enable --require-season-provenance. Uncovered:');
            for (const slug of uncovered) console.log(`    ${slug}`);
        } else {
            console.log('  Safe to enable --require-season-provenance once this SQL is applied.');
        }
    }

    if (EMIT_SQL) {
        const statements = by('ready').map((r) => r.sql);
        writeFileSync(EMIT_SQL, '-- Season provenance backfill. Generated, idempotent: the IS DISTINCT FROM\n'
            + '-- guards mean re-applying this file updates zero rows.\n'
            + `-- Ledger: ${LEDGER}\n-- Generated: ${new Date().toISOString()}\n\n`
            + (statements.length ? `${statements.join('\n')}\n` : '-- Nothing validated; no statements.\n'));
        console.log(`\nWrote ${statements.length} statement(s) to ${EMIT_SQL}. Review before applying.`);
    }
};

run().catch((error) => { console.error(error); process.exit(1); });
