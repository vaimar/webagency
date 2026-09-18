#!/usr/bin/env node
/**
 * Publish a Netlify preview of this app backed by the *local* Slumber backend.
 *
 *   node scripts/preview-tunnel.mjs [--alias local] [--skip-build] [--keep-env]
 *                                   [--check-and-close] [--gateway-port 9099]
 *
 * Railway is deliberately unpaid, so a normal deploy has no API behind it. This
 * wires one up for as long as the script runs:
 *
 *   browser -> https://<alias>--travelhub-vaimar.netlify.app/api/...
 *           -> netlify/edge-functions/api-proxy.js      (same-origin, no CORS;
 *                                                        adds X-Preview-Token)
 *           -> https://<random>.trycloudflare.com       (cloudflared quick tunnel)
 *           -> 127.0.0.1:9099  preview-gateway.mjs      (token + path allowlist)
 *           -> http://localhost:9090                    (Spring Boot on this laptop)
 *
 * The app is built with REACT_APP_API_BASE=/ so the tunnel hostname never
 * reaches the browser: no CSP change is needed (connect-src 'self' covers it)
 * and the URL is not baked into the published bundle.
 *
 * The tunnel terminates at the gateway, never at the backend directly. Finding
 * the trycloudflare hostname therefore buys nothing: without the per-run token
 * every path 404s, and even with it only /api/** and /actuator/health are
 * proxied — not Swagger, /v3/api-docs or /h2-console, all of which the
 * backend's anyRequest().permitAll() would otherwise serve to the world.
 *
 * Ctrl-C tears the tunnel down, which is what takes the preview's API offline.
 * The deploy itself stays up, serving the UI with a dead API, until it is
 * replaced or deleted.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { startGateway } from './preview-gateway.mjs';

const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const ALIAS = flagValue('alias', 'local');
const LOCAL_BACKEND = 'http://localhost:9090';
const GATEWAY_PORT = Number(flagValue('gateway-port', '9099'));
const HEALTH_PATH = '/actuator/health';
const TOKEN = randomBytes(32).toString('hex');   // fresh per run, never reused

const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);

/**
 * Thrown by `fail()`. Every step runs inside one try/catch, so a failure
 * unwinds the whole pipeline instead of letting later steps run.
 *
 * An earlier version called process.exit() from an async cleanup and simply
 * returned — which let the *next* step start while the teardown was still
 * awaiting, and a failed env:set was followed by a deploy that should never
 * have happened. Unwinding is the only way to stop that for good.
 */
class Halt extends Error {}
const fail = (msg) => { throw new Halt(msg); };

/** Run a command, inheriting stdio; non-zero exit halts the pipeline. */
const run = async (cmd, cmdArgs, opts = {}) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit', ...opts });
    const [code] = await once(child, 'exit');
    if (code !== 0) fail(`${cmd} ${cmdArgs.join(' ')} exited ${code}`);
};

/** Same, but capture stdout so a URL can be scraped out of it. */
const capture = async (cmd, cmdArgs, opts = {}) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    const [code] = await once(child, 'exit');
    if (code !== 0) fail(`${cmd} ${cmdArgs.join(' ')} exited ${code}`);
    return out;
};

/** Status code for a single request, or a short label when it never answered. */
const probe = async (url, { timeoutMs = 8000, token } = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: token ? { 'X-Preview-Token': token } : {},
        });
        return res.status;
    } catch (err) {
        return err.name === 'AbortError' ? 'timeout' : 'no-response';
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Wait for the fresh hostname to exist, asking an upstream resolver directly.
 *
 * This is not belt-and-braces, it is the difference between working and not.
 * A quick-tunnel hostname does not resolve for the first few seconds, and the
 * macOS resolver caches that NXDOMAIN for about a minute — so the *first*
 * lookup, if it happens too early, poisons every later one and the run fails
 * with ENOTFOUND while `dig @1.1.1.1` says the record is fine. Querying 1.1.1.1
 * through a dedicated Resolver leaves the system resolver untouched, so the
 * first getaddrinfo (inside fetch, below) happens only once the record is real
 * and gets a positive answer to cache.
 */
const awaitDns = async (hostname, timeoutMs = 60_000) => {
    const resolver = new Resolver();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try {
            const [address] = await resolver.resolve4(hostname);
            return address;
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return null;
};

// ── Resources that must be torn down no matter how this run ends ────────────
let gateway = null;
let cloudflared = null;
let denied = 0;
let toreDown = false;

const teardown = async () => {
    if (toreDown) return;
    toreDown = true;
    // Kill first, unset second: closing the tunnel is what actually takes the
    // backend off the internet, so it must not wait on a network round trip.
    if (cloudflared) { log('closing tunnel'); cloudflared.kill('SIGTERM'); }
    if (gateway) { gateway.close(); }
    if (denied) log(`gateway refused ${denied} request(s): no token, or a blocked path`);
    if (!has('keep-env')) {
        log('unsetting BACKEND_ORIGIN / PREVIEW_TOKEN so the next deploy goes back to Railway');
        for (const key of ['BACKEND_ORIGIN', 'PREVIEW_TOKEN']) {
            await new Promise((resolve) => {
                spawn('netlify', ['env:unset', key], { stdio: 'ignore' }).on('exit', resolve);
            });
        }
    }
};

const main = async () => {
    // ── 1. The local backend has to be up, or the preview is pointless ──────
    log(`checking ${LOCAL_BACKEND}${HEALTH_PATH}`);
    if (await probe(`${LOCAL_BACKEND}${HEALTH_PATH}`) !== 200) {
        fail(`local backend is not answering on ${LOCAL_BACKEND}. Start Slumber first.`);
    }

    // ── 2. Authenticating gateway in front of the backend ───────────────────
    // cloudflared points here, never at 9090 — see scripts/preview-gateway.mjs.
    log(`starting auth gateway on 127.0.0.1:${GATEWAY_PORT}`);
    gateway = await startGateway({
        token: TOKEN,
        port: GATEWAY_PORT,
        backend: LOCAL_BACKEND,
        onDeny: () => { denied += 1; },
    });

    // ── 3. Quick tunnel in front of the gateway ─────────────────────────────
    log('starting cloudflared quick tunnel');
    cloudflared = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${GATEWAY_PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tunnelUrl = null;
    let registered = false;
    const scrape = (chunk) => {
        const text = String(chunk);
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelUrl) tunnelUrl = match[0];
        // cloudflared prints the hostname immediately, but Cloudflare only
        // routes to it once an edge connection is registered.
        if (/Registered tunnel connection/i.test(text)) registered = true;
    };
    cloudflared.stdout.on('data', scrape);
    cloudflared.stderr.on('data', scrape);       // the URL goes to stderr

    const urlDeadline = Date.now() + 30_000;
    while (!tunnelUrl && Date.now() < urlDeadline) {
        await new Promise((r) => setTimeout(r, 300));
        if (cloudflared.exitCode !== null) fail('cloudflared exited before printing a URL');
    }
    if (!tunnelUrl) fail('cloudflared did not print a trycloudflare.com URL within 30s');
    log(`tunnel: ${tunnelUrl}`);

    const registrationDeadline = Date.now() + 60_000;
    while (!registered && Date.now() < registrationDeadline) {
        await new Promise((r) => setTimeout(r, 300));
        if (cloudflared.exitCode !== null) fail('cloudflared exited before registering');
    }
    if (!registered) warn('cloudflared never logged a registered connection; trying anyway');

    log('waiting for DNS to publish the tunnel hostname');
    const address = await awaitDns(new URL(tunnelUrl).hostname);
    if (!address) fail('tunnel hostname never resolved');
    log(`hostname resolves to ${address}`);

    log('waiting for the tunnel to serve the backend');
    let healthy = false;
    let attempt = 0;
    const healthDeadline = Date.now() + 120_000;
    while (!healthy && Date.now() < healthDeadline) {
        attempt += 1;
        const status = await probe(`${tunnelUrl}${HEALTH_PATH}`, { token: TOKEN, timeoutMs: 6000 });
        healthy = status === 200;
        // 502/530 is Cloudflare saying the hostname exists but the origin is
        // not wired up yet — normal for the first seconds of a quick tunnel.
        if (!healthy) {
            log(`  attempt ${attempt}: ${status} — retrying`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    if (!healthy) fail('tunnel never returned a healthy backend');
    log('tunnel is serving the backend');

    // Prove the gateway refuses an unauthenticated caller before the hostname
    // is handed to Netlify. If this ever succeeds, the run must not continue.
    log('checking the tunnel rejects a request without the token');
    const unauth = await probe(`${tunnelUrl}${HEALTH_PATH}`);
    if (unauth === 200) fail('the tunnel answered WITHOUT the preview token — refusing to publish');
    log(`unauthenticated requests get ${unauth}`);

    // ── 4. Point the edge proxy at the tunnel ───────────────────────────────
    // Edge functions read these at request time, but the values are bound when
    // the deploy is created — so they must be set before the deploy below.
    log('netlify env:set BACKEND_ORIGIN / PREVIEW_TOKEN');
    await run('netlify', ['env:set', 'BACKEND_ORIGIN', tunnelUrl, '--force']);
    // Deliberately NOT --secret: a secret value never reached the edge runtime
    // (every proxied call arrived at the gateway with no token and was 404'd),
    // while a plain variable does. The token is regenerated every run and unset
    // on teardown, so write-once storage buys little here anyway.
    await run('netlify', ['env:set', 'PREVIEW_TOKEN', TOKEN, '--force']);

    // ── 5. Build against the same-origin proxy, not the tunnel ──────────────
    if (!has('skip-build')) {
        log('building with REACT_APP_API_BASE=/');
        await run('npm', ['run', 'build'], { env: { ...process.env, REACT_APP_API_BASE: '/' } });
    }

    // ── 6. Deploy, and prove it works before handing over the URL ───────────
    log(`deploying to alias "${ALIAS}"`);
    const deployOut = await capture('netlify', ['deploy', '--dir', 'build', '--alias', ALIAS]);
    const previewUrl = deployOut.match(/https:\/\/[^\s]*--travelhub-vaimar\.netlify\.app/)?.[0]
        ?? `https://${ALIAS}--travelhub-vaimar.netlify.app`;

    log(`smoke testing ${previewUrl}`);
    await run('node', ['scripts/smoke-test.mjs', previewUrl]);

    if (has('check-and-close')) {
        console.log(`\n\x1b[32m✓\x1b[0m preview verified: \x1b[1m${previewUrl}\x1b[0m`);
        console.log('  closing the tunnel now (--check-and-close): the UI stays up, the API goes dark.\n');
        return;
    }

    console.log(`\n\x1b[32m✓\x1b[0m preview live: \x1b[1m${previewUrl}\x1b[0m`);
    console.log(`  API is your laptop, via ${tunnelUrl} (token-gated, /api + /actuator/health only)`);
    console.log('  Ctrl-C closes the tunnel and takes the API back down.\n');
    await once(cloudflared, 'exit');
};

let exitCode = 0;
process.on('SIGINT', () => { teardown().then(() => process.exit(0)); });
process.on('SIGTERM', () => { teardown().then(() => process.exit(0)); });

try {
    await main();
} catch (err) {
    console.error(`\x1b[31m✗\x1b[0m ${err instanceof Halt ? err.message : err}`);
    exitCode = 1;
} finally {
    await teardown();
}
process.exit(exitCode);
