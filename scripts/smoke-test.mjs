#!/usr/bin/env node
/**
 * Post-deploy smoke test. Runs against any origin — a Netlify deploy preview,
 * the production domain, or a local `npm run preview`.
 *
 *   node scripts/smoke-test.mjs https://your-site
 *   node scripts/smoke-test.mjs http://localhost:3002 --skip-api
 *
 * This checks that the deployment is *serving and wired* correctly. It is not a
 * substitute for the unit suite: it makes real network calls and is meant to
 * gate promotion, catching the class of failure that only appears once built
 * and deployed — a broken SPA fallback, an asset path that 404s, an edge proxy
 * that never got its backend URL, a CSP that blocks the app's own API host.
 *
 * Exit codes: 0 all passed · 1 a check failed · 2 bad usage.
 */

import { SECURITY_HEADERS } from '../security-headers.js';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'))?.replace(/\/$/, '');
const skipApi = args.includes('--skip-api');

if (!base) {
    console.error('usage: node scripts/smoke-test.mjs <origin> [--skip-api]');
    process.exit(2);
}

const TIMEOUT_MS = 20_000;
const results = [];

const get = async (path, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fetch(`${base}${path}`, { redirect: 'follow', signal: controller.signal, ...init });
    } finally {
        clearTimeout(timer);
    }
};

const check = async (name, fn, { optional = false } = {}) => {
    const started = Date.now();
    try {
        const detail = await fn();
        const ms = Date.now() - started;
        console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''} (${ms}ms)`);
        results.push({ name, ok: true });
    } catch (error) {
        const ms = Date.now() - started;
        console.log(`  ${optional ? 'warn' : 'FAIL'}  ${name} — ${error.message} (${ms}ms)`);
        results.push({ name, ok: false, optional, message: error.message });
    }
};

const expect = (condition, message) => {
    if (!condition) throw new Error(message);
};

// ── Shell: the app is served at all ───────────────────────────────────────────

console.log(`\nSmoke test: ${base}\n`);
console.log('Shell');

let indexHtml = '';

await check('landing page returns HTML', async () => {
    const response = await get('/');
    expect(response.ok, `HTTP ${response.status}`);
    indexHtml = await response.text();
    expect(indexHtml.includes('<div id="root">'), 'no #root mount point in the document');
    return `HTTP ${response.status}`;
});

await check('deep link falls back to the SPA shell', async () => {
    // The single most common broken deploy: /spots 404s because the host has no
    // SPA rewrite, so every shared link is dead while the home page looks fine.
    const response = await get('/spots');
    expect(response.ok, `HTTP ${response.status} — SPA fallback is not configured`);
    const body = await response.text();
    expect(body.includes('<div id="root">'), 'fallback did not serve the app shell');
    return `HTTP ${response.status}`;
});

await check('hashed JS bundle loads', async () => {
    const src = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    expect(src, 'no module script found in index.html');
    const response = await get(src);
    expect(response.ok, `HTTP ${response.status} for ${src}`);
    const type = response.headers.get('content-type') ?? '';
    expect(/javascript/.test(type), `served as ${type}, not JavaScript`);
    return src;
});

await check('stylesheet loads', async () => {
    const href = indexHtml.match(/<link[^>]+href="(\/static\/[^"]+\.css)"/)?.[1];
    expect(href, 'no local stylesheet found in index.html');
    const response = await get(href);
    expect(response.ok, `HTTP ${response.status} for ${href}`);
    return href;
});

await check('web app manifest loads', async () => {
    const response = await get('/manifest.json');
    expect(response.ok, `HTTP ${response.status}`);
    const manifest = await response.json();
    expect(manifest.name, 'manifest has no name');
    return manifest.name;
});

// ── Security headers ──────────────────────────────────────────────────────────

console.log('\nSecurity headers');

await check('required headers present on the document', async () => {
    const response = await get('/');
    const missing = Object.keys(SECURITY_HEADERS)
        .filter((name) => name !== 'Strict-Transport-Security')
        .filter((name) => response.headers.get(name) === null);
    expect(missing.length === 0, `missing: ${missing.join(', ')}`);
    return `${Object.keys(SECURITY_HEADERS).length - missing.length} headers`;
});

await check('CSP allows the app to reach its own API host', async () => {
    const csp = (await get('/')).headers.get('Content-Security-Policy') ?? '';
    const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect, 'no connect-src directive');
    // Production serves /api same-origin through the edge proxy, so 'self' is
    // the thing that must be there. Without it every data panel dies silently.
    expect(connect.includes("'self'"), "connect-src does not include 'self'");
    return connect.slice(0, 60) + '…';
});

// ── Backend reachability, through whatever proxy the deployment uses ──────────

console.log('\nBackend');

if (skipApi) {
    console.log('  skip  API checks (--skip-api)');
} else {
    await check('health endpoint responds', async () => {
        const response = await get('/actuator/health');
        expect(response.ok, `HTTP ${response.status} — the edge proxy or backend is down`);
        const body = await response.json();
        expect(body.status === 'UP', `health status is ${body.status}`);
        return body.status;
    });

    // Each of these is one of the user journeys that must work on day one.
    const endpoints = [
        ['spots catalogue', '/api/destinations/spots?activity=wakeboarding', (b) => Array.isArray(b) && b.length > 0, 'returned no spots'],
        ['ski resort map', '/api/ski/map', (b) => (Array.isArray(b) ? b.length > 0 : Boolean(b)), 'returned no resorts'],
        ['resort catalogue', '/api/resorts', (b) => (Array.isArray(b) ? b.length > 0 : Boolean(b)), 'returned no resorts'],
    ];

    for (const [name, path, valid, failure] of endpoints) {
        await check(name, async () => {
            const response = await get(path);
            expect(response.ok, `HTTP ${response.status}`);
            const body = await response.json();
            expect(valid(body), failure);
            return Array.isArray(body) ? `${body.length} records` : 'ok';
        });
    }

    // Fares and self-transfer depend on third-party quota, so a miss here is
    // reported but does not block promotion — the shell degrades honestly.
    await check('fare search', async () => {
        const response = await get('/api/flights?origin=DUB&destination=AGP');
        expect(response.ok, `HTTP ${response.status}`);
        return 'reachable';
    }, { optional: true });

    await check('self-transfer routing', async () => {
        // POST with a JSON body — this endpoint fans out many flight searches,
        // so it is slow and quota-bound, hence optional.
        const response = await get('/api/trips/self-connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: 'DUB', destination: 'AGP' }),
        });
        expect(response.ok, `HTTP ${response.status}`);
        return 'reachable';
    }, { optional: true });

    await check('login endpoint rejects bad credentials cleanly', async () => {
        // Not a real login — that needs a seeded account. This proves the auth
        // route is wired and answering rather than 404ing or 502ing.
        const response = await get('/api/accounts/profile');
        expect([401, 403].includes(response.status),
            `expected 401/403 for an unauthenticated profile read, got ${response.status}`);
        return `HTTP ${response.status} as expected`;
    });
}

// ── Booking handoff ───────────────────────────────────────────────────────────

console.log('\nBooking handoff');

await check('outbound booking link builders shipped in the bundle', async () => {
    // Outbound links are built client-side, so there is no request to observe
    // from here. What this catches is the deployment-level failure: the
    // affiliate module missing from the built output entirely, which would turn
    // every "book with the airline" handoff into a dead end. It does NOT prove
    // the affiliate IDs are configured — that is only visible in the browser.
    const src = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    expect(src, 'no module script found in index.html');

    // Chunks are referenced as "static/Name-hash.js" (no leading slash) from
    // the entry, and route chunks reference further chunks of their own — so
    // follow the graph rather than only reading the entry.
    const CHUNK_REF = /["'](?:\.\/|\/)?(static\/[A-Za-z0-9_-]+\.js)["']/g;
    const seen = new Set();
    const queue = [src.replace(/^\//, '')];
    const bodies = [];

    while (queue.length && seen.size < 60) {
        const path = queue.shift();
        if (seen.has(path)) continue;
        seen.add(path);

        const response = await get(`/${path}`);
        if (!response.ok) continue;
        const body = await response.text();
        bodies.push(body);

        for (const match of body.matchAll(CHUNK_REF)) {
            if (!seen.has(match[1])) queue.push(match[1]);
        }
    }

    const haystack = bodies.join('');
    const partners = ['ryanair.com', 'booking.com', 'skyscanner'];
    const missing = partners.filter((partner) => !haystack.includes(partner));
    expect(missing.length === 0, `no link builder found for: ${missing.join(', ')}`);
    return `${partners.length} partners across ${seen.size} chunks`;
});

// ── Report ────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok && !r.optional);
const degraded = results.filter((r) => !r.ok && r.optional);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (degraded.length) {
    console.log(`${degraded.length} optional check(s) degraded: ${degraded.map((r) => r.name).join(', ')}`);
}
if (failed.length) {
    console.error(`\n${failed.length} required check(s) FAILED:`);
    failed.forEach((r) => console.error(`  - ${r.name}: ${r.message}`));
    process.exit(1);
}
console.log('Smoke test passed.\n');
