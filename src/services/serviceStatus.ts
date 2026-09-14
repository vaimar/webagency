import { captureError, log, newRequestId } from './telemetry';

/**
 * Backend reachability, observed from traffic the app already makes.
 *
 * Why this exists:
 *   The app calls ~37 endpoints on a Spring Boot backend that is frequently not
 *   there — no deployed instance in production, and in development a laptop
 *   that is not running it on :9090. Before this module all three failure modes
 *   looked identical to the person using the site: a panel that simply stayed
 *   empty, forever, with no way to tell whether it was loading, broken, or
 *   waiting on a server that does not exist.
 *
 *   This records the outcome of requests that are being made anyway, so the
 *   shell can name which case it is. It deliberately does NOT poll: an outage
 *   is discovered by the first real request that fails, and recovery is checked
 *   only when the person asks for it (see `recheckService`).
 */

export type ServiceStatus =
    /** No request has completed yet — say nothing. */
    | 'unknown'
    /** Last request succeeded. */
    | 'ok'
    /** The browser reports no network connection at all. */
    | 'offline'
    /** Requests never reach the backend: refused, DNS failure, or timeout. */
    | 'unreachable'
    /** The backend answers, but with server errors. */
    | 'degraded';

export interface ServiceFailure {
    url: string;
    /** HTTP status, or null when the request never got a response. */
    status: number | null;
    message: string;
    at: string;
}

export interface ServiceStatusSnapshot {
    status: ServiceStatus;
    lastFailure: ServiceFailure | null;
    lastOkAt: string | null;
}

export interface ApiOutcome {
    url: string;
    /** True when the response was 2xx. */
    ok: boolean;
    /** HTTP status, or null when no response arrived (transport failure). */
    status: number | null;
    message?: string;
    /**
     * True when the caller cancelled the request itself (component unmounted,
     * a newer search superseded this one). Those say nothing about the health
     * of the backend and must never move the status.
     */
    aborted?: boolean;
}

/**
 * Consecutive transport failures before we announce an outage. One is not
 * enough: a single request can be killed by a sleeping laptop or a flaky
 * hotspot, and a full-width "we are down" banner is a bad thing to be wrong
 * about. Any real outage produces this many within one page load, because
 * every dashboard here fires several requests at once.
 */
const TRANSPORT_FAILURE_THRESHOLD = 2;

/** Same idea for 5xx — one server error is a bad request, a run of them is an outage. */
const SERVER_ERROR_THRESHOLD = 2;

type Listener = (snapshot: ServiceStatusSnapshot) => void;

const listeners = new Set<Listener>();

let snapshot: ServiceStatusSnapshot = {
    status: 'unknown',
    lastFailure: null,
    lastOkAt: null,
};

let transportFailures = 0;
let serverErrors = 0;

const isBrowserOffline = (): boolean =>
    typeof navigator !== 'undefined' && navigator.onLine === false;

const emit = (): void => {
    // Copy per listener call so a subscriber cannot mutate shared state.
    listeners.forEach((listener) => listener({ ...snapshot }));
};

const update = (next: Partial<ServiceStatusSnapshot>): void => {
    const merged = { ...snapshot, ...next };
    const changed =
        merged.status !== snapshot.status
        || merged.lastFailure !== snapshot.lastFailure
        || merged.lastOkAt !== snapshot.lastOkAt;

    snapshot = merged;
    if (changed) emit();
};

export const getServiceStatus = (): ServiceStatusSnapshot => ({ ...snapshot });

export const subscribeToServiceStatus = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Record what happened to one API request. Called from the shared fetch
 * wrappers, not by feature code.
 */
export const reportApiOutcome = (outcome: ApiOutcome): void => {
    if (outcome.aborted) return;

    if (outcome.ok) {
        transportFailures = 0;
        serverErrors = 0;
        update({ status: 'ok', lastOkAt: new Date().toISOString() });
        return;
    }

    const failure: ServiceFailure = {
        url: outcome.url,
        status: outcome.status,
        message: outcome.message ?? 'Request failed',
        at: new Date().toISOString(),
    };

    // No response at all — refused, DNS, CORS, or timed out.
    if (outcome.status === null) {
        transportFailures += 1;
        if (isBrowserOffline()) {
            update({ status: 'offline', lastFailure: failure });
            return;
        }
        if (transportFailures >= TRANSPORT_FAILURE_THRESHOLD) {
            update({ status: 'unreachable', lastFailure: failure });
        }
        return;
    }

    // The backend answered. 4xx is the endpoint's business, not an outage —
    // a 404 on one hotel is a missing hotel, not a dead server.
    if (outcome.status >= 500) {
        serverErrors += 1;
        transportFailures = 0;
        if (serverErrors >= SERVER_ERROR_THRESHOLD) {
            update({ status: 'degraded', lastFailure: failure });
        }
        return;
    }

    // A 4xx still proves something is listening, so it clears an outage.
    transportFailures = 0;
    serverErrors = 0;
    if (snapshot.status !== 'ok') {
        update({ status: 'ok', lastOkAt: new Date().toISOString() });
    }
};

/**
 * fetch() that reports its outcome. Services that build their own requests use
 * this instead of the global so their failures are visible to the shell.
 */
export const trackedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const requestId = newRequestId();
    const startedAt = Date.now();

    // Same-origin only — see the note on isSameOrigin in api.ts. A custom header
    // on a cross-origin call would force a preflight the backend cannot answer.
    const sameOrigin = url.startsWith('/')
        || (typeof window !== 'undefined' && (() => {
            try { return new URL(url, window.location.href).origin === window.location.origin; } catch { return false; }
        })());

    try {
        const response = await fetch(input, sameOrigin
            ? { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), 'X-Request-Id': requestId } }
            : init);

        log('api.response', {
            requestId,
            method: init?.method ?? 'GET',
            url,
            status: response.status,
            ok: response.ok,
            durationMs: Date.now() - startedAt,
        });
        reportApiOutcome({
            url,
            ok: response.ok,
            status: response.status,
            message: response.ok ? undefined : response.statusText,
        });
        return response;
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        const message = error instanceof Error ? error.message : 'Network error';

        reportApiOutcome({ url, ok: false, status: null, message, aborted });
        log('api.failure', { requestId, url, message, aborted });

        // A superseded or unmounted request is routine and not worth reporting.
        if (!aborted) captureError(error, 'tracked-fetch', { requestId, url });

        throw error;
    }
};

/**
 * Actively re-check the backend after an outage. This is the only request this
 * module initiates, and only ever because someone pressed "Try again".
 */
export const recheckService = async (): Promise<ServiceStatus> => {
    // Imported lazily: api.ts imports this module, and a static import back
    // would be a cycle.
    const { checkBackendHealth } = await import('./api');

    try {
        const result = await checkBackendHealth();
        reportApiOutcome({ url: '/actuator/health', ok: result.ok, status: result.ok ? 200 : 503 });
    } catch {
        // checkBackendHealth already reported the outcome through the shared
        // wrapper; swallowing here keeps a failed retry from throwing into a
        // click handler.
    }

    return snapshot.status;
};

/** Test seam — resets module state between cases. */
export const resetServiceStatus = (): void => {
    transportFailures = 0;
    serverErrors = 0;
    snapshot = { status: 'unknown', lastFailure: null, lastOkAt: null };
};

if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
        update({ status: 'offline' });
    });
    window.addEventListener('online', () => {
        // Being back on a network says nothing about the backend. Drop to
        // 'unknown' and let the next real request decide.
        transportFailures = 0;
        serverErrors = 0;
        update({ status: 'unknown' });
    });
}
