/**
 * The canonical production response-header policy.
 *
 * These headers have to be identical in three places that cannot share a file:
 * `netlify.toml` (the Netlify deploy), `nginx.conf` (the Docker image) and the
 * local `vite preview` server. This module is the source of truth; the other
 * two are generated from it by `scripts/sync-security-headers.mjs`, and CI runs
 * that script in --check mode so they can never drift apart silently.
 *
 * Verify a running deployment against this policy with:
 *   node scripts/check-response-headers.mjs https://your-site
 */

/**
 * Content-Security-Policy, as ordered directive pairs.
 *
 * Each relaxation below is load-bearing — a stricter value was tried first and
 * broke something observable in the browser:
 *
 * - `style-src 'unsafe-inline'`: React writes `style` attributes for the map
 *   marker colours and maplibre-gl injects a stylesheet at runtime. Removing it
 *   costs the entire map UI. A nonce cannot help — Netlify serves a static
 *   index.html with no per-request template step.
 * - `img-src https:`: the app renders hotel, POI and city photography from
 *   whatever host the upstream provider returns (Wikimedia, Unsplash, OTA
 *   thumbnails, OpenTripMap). The host set is not knowable ahead of time, so
 *   this is scoped by scheme instead. `data:` and `blob:` cover the generated
 *   SpotTile fallbacks.
 * - `worker-src blob:`: maplibre-gl starts its tile workers from a blob URL.
 *
 * `script-src` deliberately stays at `'self'` with no `unsafe-inline` and no
 * `unsafe-eval`: Vite emits a single external module script and nothing else.
 * That is the directive that actually stops XSS, so keep it that way.
 */
export const CONTENT_SECURITY_POLICY = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["form-action", "'self'"],
    ["script-src", "'self'"],
    ["style-src", "'self' 'unsafe-inline' https://fonts.googleapis.com"],
    ["font-src", "'self' data: https://fonts.gstatic.com"],
    ["img-src", "'self' data: blob: https:"],
    ["worker-src", "'self' blob:"],
    ["child-src", "'self' blob:"],
    ["manifest-src", "'self'"],
    ["connect-src", [
        "'self'",
        // Vector basemap + glyphs. OpenFreeMap is the keyless fallback used
        // whenever REACT_APP_MAPTILER_KEY is unset, so both must be allowed.
        'https://api.maptiler.com',
        'https://tiles.openfreemap.org',
        // Terrain tiles on the spot detail map.
        'https://s3.amazonaws.com',
        // The backend. In production /api and /actuator go same-origin through
        // the Netlify edge function, but a build pointed straight at Railway by
        // REACT_APP_API_BASE talks to this host directly.
        'https://slumber-production.up.railway.app',
        // NOTE: setting REACT_APP_TELEMETRY_ENDPOINT (or adding Sentry) to a
        // host that is not listed here will have its reports silently blocked
        // by this policy — add the origin below at the same time.
    ].join(' ')],
    ["upgrade-insecure-requests", ""],
];

export const cspValue = (policy = CONTENT_SECURITY_POLICY) => policy
    .map(([directive, value]) => (value ? `${directive} ${value}` : directive))
    .join('; ');

/**
 * The same headers for `vite preview`, with the local backend added to
 * connect-src.
 *
 * Production must never allow `http://localhost:*` — but the preview server is
 * a local verification aid, and a build carrying REACT_APP_API_BASE=localhost
 * (which is what `.env.production.local` sets) would otherwise have every one
 * of its API calls blocked, hiding real CSP problems behind a wall of noise.
 * This is the one deliberate difference between preview and production.
 */
export const previewSecurityHeaders = () => {
    const headers = { ...SECURITY_HEADERS };

    headers['Content-Security-Policy'] = cspValue(CONTENT_SECURITY_POLICY.map(([directive, value]) => (
        directive === 'connect-src'
            ? [directive, `${value} http://localhost:9090 http://localhost:9091`]
            : [directive, value]
    )));

    // Deleted, not set to undefined: Node's setHeader throws on an undefined
    // value and vite preview turns that into a 500 on every request. HSTS is
    // pointless over plain http anyway, and sending it would poison the
    // browser's HSTS cache for every other localhost project on this machine.
    delete headers['Strict-Transport-Security'];

    return headers;
};

/** Every security header served for an HTML document. */
export const SECURITY_HEADERS = {
    'Content-Security-Policy': cspValue(),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    // 2 years, preload-eligible. Netlify terminates TLS for the apex and all
    // subdomains, so includeSubDomains is safe here.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
};
