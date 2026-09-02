import { beforeEach, describe, expect, it } from 'vitest';
// The edge function is plain JS shared with Netlify's Deno runtime; it imports
// nothing platform-specific, so the limiter can be exercised directly here.
import { classifyPath, clientKey, consume, LIMITS, resetBuckets } from '../../netlify/edge-functions/rate-limit.js';

describe('edge rate limiting', () => {
    beforeEach(() => resetBuckets());

    it('treats quota-burning endpoints as expensive and catalogue reads as standard', () => {
        expect(classifyPath('/api/trips/self-connect')).toBe('expensive');
        expect(classifyPath('/api/flight-search/routes')).toBe('expensive');
        expect(classifyPath('/api/ai/messages')).toBe('expensive');
        expect(classifyPath('/api/destinations/spots')).toBe('standard');
        expect(classifyPath('/actuator/health')).toBe('standard');
    });

    it('allows a normal burst and then blocks', () => {
        const now = Date.now();
        const allowed = Array.from({ length: LIMITS.expensive.capacity }, () => consume('1.2.3.4', 'expensive', now));
        expect(allowed.every((d) => d.allowed)).toBe(true);

        const blocked = consume('1.2.3.4', 'expensive', now);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('refills over time so a blocked caller recovers without intervention', () => {
        const now = Date.now();
        for (let i = 0; i < LIMITS.expensive.capacity; i += 1) consume('5.6.7.8', 'expensive', now);
        expect(consume('5.6.7.8', 'expensive', now).allowed).toBe(false);

        // One token per six seconds at 10/minute.
        expect(consume('5.6.7.8', 'expensive', now + 6_000).allowed).toBe(true);
    });

    it('does not let one caller exhaust another caller\'s quota', () => {
        const now = Date.now();
        for (let i = 0; i < LIMITS.expensive.capacity + 5; i += 1) consume('9.9.9.9', 'expensive', now);

        expect(consume('9.9.9.9', 'expensive', now).allowed).toBe(false);
        expect(consume('8.8.8.8', 'expensive', now).allowed).toBe(true);
    });

    it('keeps the expensive and standard budgets separate', () => {
        const now = Date.now();
        for (let i = 0; i < LIMITS.expensive.capacity; i += 1) consume('1.1.1.1', 'expensive', now);

        expect(consume('1.1.1.1', 'expensive', now).allowed).toBe(false);
        // Being throttled on route search must not break the spots catalogue.
        expect(consume('1.1.1.1', 'standard', now).allowed).toBe(true);
    });

    it('buckets a request with no identifiable IP rather than waving it through', () => {
        const anonymous = new Request('https://example.test/api/trips/explore');
        expect(clientKey(anonymous)).toBe('unknown');

        const now = Date.now();
        for (let i = 0; i < LIMITS.expensive.capacity; i += 1) consume('unknown', 'expensive', now);
        expect(consume('unknown', 'expensive', now).allowed).toBe(false);
    });

    it('prefers Netlify\'s client IP header over a spoofable forwarded-for', () => {
        const request = new Request('https://example.test/api/x', {
            headers: {
                'x-nf-client-connection-ip': '203.0.113.7',
                'x-forwarded-for': '198.51.100.1, 203.0.113.9',
            },
        });
        expect(clientKey(request)).toBe('203.0.113.7');
    });

    it('takes the first hop from x-forwarded-for when nothing better exists', () => {
        const request = new Request('https://example.test/api/x', {
            headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' },
        });
        expect(clientKey(request)).toBe('198.51.100.1');
    });
});
