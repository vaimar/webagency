/**
 * Best-effort rate limiting for the expensive search endpoints.
 *
 * Scope, stated plainly: this is a token bucket held in the memory of a single
 * edge isolate. Netlify runs many isolates across many regions, so the real
 * ceiling a determined caller sees is higher than the numbers below, and a
 * cleared isolate forgets everything. It is defence in depth, not a WAF.
 *
 * It is still worth having, because the realistic failure is not a determined
 * attacker — it is one script, or one runaway retry loop, hammering
 * /api/trips/self-connect, which fans out into many upstream flight searches
 * and burns third-party API quota that costs real money and is shared by every
 * other visitor. Blunting that at the edge protects everyone else's searches.
 *
 * Platform-level rate limiting and a WAF should still be enabled in front of
 * this; see the note in README.
 */

/** Endpoints that cost real money or upstream quota per call. */
const EXPENSIVE = [
    '/api/trips/self-connect',
    '/api/trips/explore',
    '/api/trips/ai-guide',
    '/api/ai/messages',
    '/api/flights/refresh',
    '/api/flight-search/',
    '/api/hotels/search/',
];

export const LIMITS = {
    // Deliberately tight. A person exploring routes makes a handful of these a
    // minute; ten in a minute is already unusual, and a hundred is a script.
    expensive: { capacity: 10, refillPerSecond: 10 / 60 },
    // Everything else: catalogue reads, health, profile. Generous, because the
    // spots page alone makes several on load.
    standard: { capacity: 120, refillPerSecond: 120 / 60 },
};

export const classifyPath = (pathname) => (
    EXPENSIVE.some((prefix) => pathname.startsWith(prefix)) ? 'expensive' : 'standard'
);

/**
 * Client identity. Netlify sets x-nf-client-connection-ip; the others are
 * fallbacks. An absent IP is bucketed under a shared key rather than being
 * waved through — otherwise spoofing the header off would bypass the limiter.
 */
export const clientKey = (request) => (
    request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('cf-connecting-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown'
);

const buckets = new Map();
const MAX_TRACKED = 10_000;

/**
 * @returns {{ allowed: boolean, retryAfterSeconds: number, remaining: number }}
 */
export const consume = (key, klass, now = Date.now()) => {
    const limit = LIMITS[klass];
    const id = `${klass}:${key}`;

    // Bound the map so a flood of distinct IPs cannot grow it without limit.
    // Dropping the oldest entry only forgives an old caller, never a current one.
    if (buckets.size > MAX_TRACKED && !buckets.has(id)) {
        const oldest = buckets.keys().next().value;
        buckets.delete(oldest);
    }

    const bucket = buckets.get(id) ?? { tokens: limit.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    const tokens = Math.min(limit.capacity, bucket.tokens + elapsedSeconds * limit.refillPerSecond);

    if (tokens < 1) {
        buckets.set(id, { tokens, updatedAt: now });
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil((1 - tokens) / limit.refillPerSecond),
            remaining: 0,
        };
    }

    buckets.set(id, { tokens: tokens - 1, updatedAt: now });
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(tokens - 1) };
};

/** Test seam — the bucket map is module state that would leak between cases. */
export const resetBuckets = () => buckets.clear();
