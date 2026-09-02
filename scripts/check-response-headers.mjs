#!/usr/bin/env node
/**
 * Verifies that a *running* deployment actually serves the policy in
 * security-headers.js.
 *
 * Configuration files are not evidence: Netlify silently ignores a malformed
 * [[headers]] block, an nginx location can drop inherited headers, and a CDN
 * in front of either can rewrite them. This fetches the real thing.
 *
 *   node scripts/check-response-headers.mjs https://your-site
 *   node scripts/check-response-headers.mjs http://localhost:3002 --preview
 *
 * `--preview` compares against the preview policy instead, which allows the
 * local backend in connect-src. Without it, pointing this at `npm run preview`
 * correctly reports a connect-src mismatch.
 */

import { SECURITY_HEADERS, previewSecurityHeaders } from '../security-headers.js';

const preview = process.argv.includes('--preview');
const target = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!target) {
    console.error('usage: node scripts/check-response-headers.mjs <url>');
    process.exit(2);
}

const base = target.replace(/\/$/, '');

/** Headers whose value may legitimately differ from the canonical policy. */
const ADVISORY = new Set([
    // Absent over plain http, and Netlify injects its own on some plans.
    'Strict-Transport-Security',
]);

const normalise = (value) => value.trim().replace(/\s*;\s*/g, '; ').replace(/\s+/g, ' ');

const run = async () => {
    let response;
    try {
        response = await fetch(base, { redirect: 'follow' });
    } catch (error) {
        console.error(`FAIL  could not reach ${base}: ${error.message}`);
        process.exit(1);
    }

    console.log(`${base} → HTTP ${response.status}  (${preview ? 'preview' : 'production'} policy)\n`);

    const failures = [];
    const warnings = [];

    const policy = preview ? previewSecurityHeaders() : SECURITY_HEADERS;

    for (const [name, expected] of Object.entries(policy)) {
        const actual = response.headers.get(name);
        const advisory = ADVISORY.has(name);

        if (actual === null) {
            (advisory ? warnings : failures).push(`${name}: missing`);
            console.log(`  ${advisory ? 'warn' : 'FAIL'}  ${name} — absent`);
            continue;
        }

        if (normalise(actual) !== normalise(expected)) {
            (advisory ? warnings : failures).push(`${name}: mismatch`);
            console.log(`  ${advisory ? 'warn' : 'FAIL'}  ${name}\n        expected ${normalise(expected)}\n        actual   ${normalise(actual)}`);
            continue;
        }

        console.log(`  ok    ${name}`);
    }

    // A CSP that only covers the document is worth little if the SPA fallback
    // route serves a different one — that is the route every deep link takes.
    const deep = await fetch(`${base}/spots`, { redirect: 'follow' }).catch(() => null);
    if (deep) {
        const docCsp = response.headers.get('Content-Security-Policy');
        const deepCsp = deep.headers.get('Content-Security-Policy');
        if (normalise(docCsp ?? '') !== normalise(deepCsp ?? '')) {
            failures.push('Content-Security-Policy differs on the SPA fallback route');
            console.log('\n  FAIL  /spots serves a different Content-Security-Policy than /');
        } else {
            console.log('\n  ok    SPA fallback route serves the same CSP');
        }
    }

    console.log();
    if (warnings.length) console.log(`${warnings.length} advisory warning(s): ${warnings.join(', ')}`);
    if (failures.length) {
        console.error(`${failures.length} header check(s) failed.`);
        process.exit(1);
    }
    console.log('All required security headers present and correct.');
};

await run();
