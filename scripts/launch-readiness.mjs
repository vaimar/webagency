#!/usr/bin/env node
/**
 * Configuration completeness check for a build that is about to go live.
 *
 * This is not the smoke test. The smoke test asks "is this deployment serving
 * correctly?" — and a deployment with no affiliate IDs, no map key and an
 * unnamed legal controller serves perfectly. It passes every check, while
 * earning nothing, showing a basemap that is not licensed for production load,
 * and collecting personal data without a controller named anywhere.
 *
 * Those are the failures nobody notices, because nothing breaks. This is the
 * check for those.
 *
 *   node scripts/launch-readiness.mjs                    # inspect ./build
 *   node scripts/launch-readiness.mjs https://your-site  # inspect a live deploy
 *   node scripts/launch-readiness.mjs ... --strict       # exit 1 on any blocker
 *
 * The URL form matters: the env values are baked in at build time by whichever
 * environment did the build, so a local `npm run build` proves nothing about
 * what Netlify produced. Only the deployed bundle carries the real answer.
 *
 * Exit codes: 0 clean (or advisory-only) · 1 a blocker with --strict · 2 usage.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'build');
const strict = process.argv.includes('--strict');
const target = process.argv.slice(2).find((arg) => !arg.startsWith('--'));

/** Every JS chunk of the build, from disk or from a deployed origin. */
const loadChunks = async () => {
    if (!target) {
        if (!existsSync(BUILD)) {
            console.error('No build/ directory. Run `npm run build`, or pass a URL.');
            process.exit(2);
        }
        const staticDir = join(BUILD, 'static');
        return readdirSync(staticDir)
            .filter((f) => f.endsWith('.js'))
            .map((f) => readFileSync(join(staticDir, f), 'utf8'));
    }

    const base = target.replace(/\/$/, '');
    const index = await (await fetch(base)).text();
    const entry = index.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    if (!entry) {
        console.error(`No module script found at ${base} — is that the app?`);
        process.exit(2);
    }

    // Follow the chunk graph, exactly as the smoke test does: the env chunk is
    // referenced by other chunks, not by index.html.
    const CHUNK_REF = /["'](?:\.\/|\/)?(static\/[A-Za-z0-9_-]+\.js)["']/g;
    const seen = new Set();
    const queue = [entry.replace(/^\//, '')];
    const bodies = [];

    while (queue.length && seen.size < 80) {
        const path = queue.shift();
        if (seen.has(path)) continue;
        seen.add(path);

        const response = await fetch(`${base}/${path}`);
        if (!response.ok) continue;
        const body = await response.text();
        bodies.push(body);
        for (const match of body.matchAll(CHUNK_REF)) {
            if (!seen.has(match[1])) queue.push(match[1]);
        }
    }
    return bodies;
};

const chunks = await loadChunks();
const allChunks = chunks.join('');

// Vite inlines import.meta.env as a single object literal, with backtick-quoted
// values. Absent keys mean the variable was never set at build time.
const readBuiltEnv = (key) => {
    const match = allChunks.match(new RegExp(`${key}:\\\`([^\\\`]*)\\\``));
    return match ? match[1] : undefined;
};

const findings = [];
const record = (level, name, detail, consequence) => {
    findings.push({ level, name, detail, consequence });
};

// ── Backend origin ────────────────────────────────────────────────────────────

const apiBase = readBuiltEnv('REACT_APP_API_BASE') ?? '';
if (!apiBase) {
    record('advisory', 'API origin', 'unset — the app falls back to its built-in production host',
        'Fine if that fallback is correct; explicit is better.');
} else if (/localhost|127\.0\.0\.1/.test(apiBase)) {
    record('blocker', 'API origin', `points at ${apiBase}`,
        'Every data panel will be dead for the public. Usually means .env.production.local leaked into the build.');
} else if (apiBase.startsWith('http://')) {
    record('blocker', 'API origin', `${apiBase} is plain http`,
        'Blocked as mixed content on an https site, and upgrade-insecure-requests will rewrite it anyway.');
} else {
    record('ok', 'API origin', apiBase, '');
}

// ── Map basemap ───────────────────────────────────────────────────────────────

if (!(readBuiltEnv('REACT_APP_MAPTILER_KEY') ?? '').trim()) {
    record('blocker', 'MapTiler key', 'unset',
        'Maps fall back to the free demo basemap, which is not licensed for production traffic.');
} else {
    record('ok', 'MapTiler key', 'set', '');
}

// ── Revenue attribution ───────────────────────────────────────────────────────

const AFFILIATE_KEYS = [
    'REACT_APP_BOOKING_AID',
    'REACT_APP_SKYSCANNER_ID',
    'REACT_APP_KIWI_ID',
    'REACT_APP_GYG_PARTNER_ID',
    'REACT_APP_TRIPADVISOR_ID',
];
const configured = AFFILIATE_KEYS.filter((key) => (readBuiltEnv(key) ?? '').trim());

if (configured.length === 0) {
    record('blocker', 'Affiliate IDs', 'none configured',
        'Every outbound booking works and none is attributed. The site earns nothing and nothing reports it.');
} else {
    record('ok', 'Affiliate IDs', `${configured.length} of ${AFFILIATE_KEYS.length} set`,
        configured.length < AFFILIATE_KEYS.length
            ? `Unset: ${AFFILIATE_KEYS.filter((k) => !configured.includes(k)).join(', ')}`
            : '');
}

// ── Error reporting ───────────────────────────────────────────────────────────

const hasCollector = (readBuiltEnv('REACT_APP_TELEMETRY_ENDPOINT') ?? '').trim()
    || (readBuiltEnv('REACT_APP_SENTRY_DSN') ?? '').trim();

if (!hasCollector) {
    record('blocker', 'Error reporting', 'no collector configured',
        'Errors are captured in-page and go nowhere. A crash in production leaves no trace at all.');
} else {
    record('ok', 'Error reporting', 'collector configured', '');
}

// ── Legal controller ──────────────────────────────────────────────────────────

// Read the operator data only. An earlier version of this check also looked for
// the "address still has to be published" copy, which is wrong: that string is
// in LegalPage's JSX and therefore ships whether or not the address is set, so
// the check could never pass.
const postalAddress = allChunks.match(/postalAddress:\s*(`([^`]*)`|null)/);
const legalIncomplete = !postalAddress
    || postalAddress[1] === 'null'
    || !(postalAddress[2] ?? '').trim();

if (legalIncomplete) {
    record('blocker', 'Legal controller', 'name/address not filled in',
        'GDPR Art. 13 requires a named controller before collecting personal data. The pages render a visible gap notice.');
} else {
    record('ok', 'Legal controller', 'filled in', '');
}

// ── Source maps ───────────────────────────────────────────────────────────────

const maps = target
    ? (allChunks.match(/sourceMappingURL=/g) ?? []).length
    : readdirSync(join(BUILD, 'static')).filter((f) => f.endsWith('.map')).length;
if (maps > 0) {
    record('advisory', 'Source maps', `${maps} published`,
        'Readable source for anyone who looks. Intentional and useful with an error reporter; drop build.sourcemap if not.');
}

// ── Report ────────────────────────────────────────────────────────────────────

const ICON = { ok: '  ok      ', blocker: '  BLOCKER ', advisory: '  advisory' };

console.log(`\nLaunch readiness — configuration completeness`);
console.log(`${target ?? join(ROOT, 'build')}\n`);
for (const { level, name, detail, consequence } of findings) {
    console.log(`${ICON[level]} ${name}: ${detail}`);
    if (consequence && level !== 'ok') console.log(`             ${consequence}`);
}

const blockers = findings.filter((f) => f.level === 'blocker');
console.log(`\n${findings.filter((f) => f.level === 'ok').length} ready · ${blockers.length} blocking · ${findings.filter((f) => f.level === 'advisory').length} advisory`);

if (blockers.length && strict) {
    console.error('\nNot ready to go public. Re-run without --strict to keep this advisory.');
    process.exit(1);
}
if (blockers.length) {
    console.log('\nAdvisory run — pass --strict to make these fail a pipeline.');
}
