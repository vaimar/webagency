#!/usr/bin/env node
/**
 * Authenticating gateway that sits between `cloudflared` and the local backend.
 *
 *   cloudflared ──▶ this gateway (9099) ──▶ Spring Boot (9090)
 *
 * Without it, a quick tunnel puts the whole backend on the public internet:
 * SecurityConfig ends in `anyRequest().permitAll()`, so Swagger UI,
 * /v3/api-docs, /h2-console and every mutating endpoint would be one guessed
 * URL away. Two independent controls close that:
 *
 *   1. A shared secret. Only requests carrying `X-Preview-Token` get through.
 *      The Netlify edge function adds that header server-side, so it never
 *      reaches a browser and never appears in the published bundle.
 *   2. A path allowlist. Even a caller holding the token can only reach
 *      /api/** and /actuator/health — the docs and console routes are not
 *      proxied at all.
 *
 * Anything that fails either check gets a bare 404, not a 401: a scanner that
 * stumbles onto the hostname learns nothing about what is behind it.
 *
 * Standalone use (the tunnel script imports it instead):
 *   PREVIEW_TOKEN=$(openssl rand -hex 32) node scripts/preview-gateway.mjs
 */

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const ALLOWED = [
    /^\/api\/[^?]*$/,
    /^\/actuator\/health\/?$/,
];

const isAllowedPath = (pathname) => ALLOWED.some((re) => re.test(pathname));

/** Constant-time compare that tolerates length mismatch without leaking it. */
const tokenMatches = (given, expected) => {
    if (typeof given !== 'string' || given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

export const startGateway = ({ token, port = 9099, backend = 'http://localhost:9090', onDeny } = {}) => {
    if (!token) throw new Error('startGateway needs a token');
    const upstream = new URL(backend);

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://placeholder');
        const deny = (reason) => {
            onDeny?.(reason, url.pathname);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end('{"error":"Not found"}');
        };

        if (!tokenMatches(req.headers['x-preview-token'], token)) return deny('no-token');
        if (!isAllowedPath(url.pathname)) return deny('path-not-allowed');

        const headers = { ...req.headers, host: upstream.host };
        delete headers['x-preview-token'];      // never forward the secret onward
        delete headers.origin;                  // keep it a server-to-server call
        delete headers.referer;

        const proxied = http.request(
            {
                hostname: upstream.hostname,
                port: upstream.port || 80,
                path: req.url,
                method: req.method,
                headers,
            },
            (upstreamRes) => {
                res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
                upstreamRes.pipe(res);
            },
        );

        proxied.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Backend unreachable', detail: String(err) }));
        });

        req.pipe(proxied);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
};

// Run directly: read config from the environment and stay up.
if (import.meta.url === `file://${process.argv[1]}`) {
    const token = process.env.PREVIEW_TOKEN;
    if (!token) {
        console.error('PREVIEW_TOKEN is required');
        process.exit(2);
    }
    const port = Number(process.env.PREVIEW_GATEWAY_PORT ?? 9099);
    const backend = process.env.PREVIEW_BACKEND ?? 'http://localhost:9090';
    await startGateway({
        token,
        port,
        backend,
        onDeny: (reason, path) => console.log(`denied (${reason}): ${path}`),
    });
    console.log(`gateway on http://127.0.0.1:${port} -> ${backend}`);
}
