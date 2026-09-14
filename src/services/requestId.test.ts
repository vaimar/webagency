import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The X-Request-Id header is only safe on same-origin calls: a custom header
 * turns a simple cross-origin request into a preflighted one, and the Slumber
 * backend has no CORS configuration to answer an OPTIONS with. Getting this
 * wrong breaks every API call in production, so it is pinned here.
 */
describe('request id propagation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    const captureRequest = () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: () => 'application/json' },
                json: async () => ({ status: 'UP' }),
                text: async () => '{"status":"UP"}',
            } as unknown as Response;
        }) as typeof fetch;
        return calls;
    };

    const headerFrom = (init?: RequestInit): string | undefined => {
        const headers = init?.headers as Record<string, string> | undefined;
        return headers?.['X-Request-Id'];
    };

    it('attaches a request id to a same-origin call', async () => {
        const calls = captureRequest();
        const { checkBackendHealth } = await import('./api');

        await checkBackendHealth();

        // API_BASE is '' under the dev proxy, so the URL is a relative path.
        expect(calls[0].url.startsWith('/')).toBe(true);
        expect(headerFrom(calls[0].init)).toMatch(/^[a-z0-9]+$/i);
    });

    it('gives each call its own id', async () => {
        const calls = captureRequest();
        const { checkBackendHealth } = await import('./api');

        await checkBackendHealth();
        await checkBackendHealth();

        expect(headerFrom(calls[0].init)).not.toBe(headerFrom(calls[1].init));
    });

    it('omits the header on a cross-origin call, which would force a preflight', async () => {
        const calls = captureRequest();
        const { trackedFetch } = await import('./serviceStatus');

        await trackedFetch('https://another-host.example/api/thing');

        expect(headerFrom(calls[0].init)).toBeUndefined();
    });

    it('still attaches it on a relative path through trackedFetch', async () => {
        const calls = captureRequest();
        const { trackedFetch } = await import('./serviceStatus');

        await trackedFetch('/api/destinations/spots');

        expect(headerFrom(calls[0].init)).toBeTruthy();
    });

    it('surfaces the id on diagnostics so a failure can be traced end to end', async () => {
        captureRequest();
        const { checkBackendHealth } = await import('./api');

        const { diagnostics } = await checkBackendHealth();
        expect(diagnostics.requestId).toBeTruthy();
        expect(diagnostics.requestId).not.toBe('unknown');
    });
});
