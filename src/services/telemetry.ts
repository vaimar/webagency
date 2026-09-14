/**
 * Error reporting, structured logging and product analytics.
 *
 * There is no vendor wired in, because that needs an account this repo cannot
 * create. What is here is the whole path up to the vendor: every error, log
 * line and funnel event already flows through `emit()`, correlated by session
 * and request id. Adding Sentry is then one call in `src/index.tsx`:
 *
 *     import * as Sentry from '@sentry/react';
 *     Sentry.init({ dsn: readEnv('REACT_APP_SENTRY_DSN') });
 *     registerSink((signal) => {
 *         if (signal.kind === 'error') Sentry.captureException(signal.error, { extra: signal.context });
 *         else Sentry.addBreadcrumb({ category: signal.kind, message: signal.name, data: signal.props });
 *     });
 *
 * Nothing here may throw, and nothing may block a user action: a telemetry
 * failure must never become a product failure.
 */

import { isProduction, isTest, readEnv } from './env';

// ─── Signals ──────────────────────────────────────────────────────────────────

export interface ErrorSignal {
    kind: 'error';
    error: Error;
    /** Where it came from: 'render', 'request', 'unhandled-rejection'. */
    source: string;
    context: Record<string, unknown>;
    sessionId: string;
    timestamp: string;
}

export interface EventSignal {
    kind: 'event' | 'log';
    name: string;
    props: Record<string, unknown>;
    sessionId: string;
    timestamp: string;
}

export type Signal = ErrorSignal | EventSignal;
export type Sink = (signal: Signal) => void;

// ─── Correlation ids ──────────────────────────────────────────────────────────

const randomId = (): string => {
    // crypto.randomUUID is unavailable over plain http on some browsers, and in
    // older Safari. The fallback only needs to be unique enough to correlate one
    // request across a log line and an error report.
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        }
    } catch {
        /* fall through */
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

/** Stable for the life of the tab — ties a person's whole visit together. */
export const SESSION_ID = randomId();

/** One id per outbound API call, echoed to the backend as X-Request-Id. */
export const newRequestId = (): string => randomId();

// ─── Sinks ────────────────────────────────────────────────────────────────────

const sinks: Sink[] = [];

/** Register a destination for signals. Returns an unsubscribe function. */
export const registerSink = (sink: Sink): (() => void) => {
    sinks.push(sink);
    return () => {
        const index = sinks.indexOf(sink);
        if (index >= 0) sinks.splice(index, 1);
    };
};

/**
 * Last N signals, for support. When someone reports "it just showed an error",
 * this is what turns that into something diagnosable without a vendor.
 */
const BUFFER_LIMIT = 50;
const buffer: Signal[] = [];

export const recentSignals = (): readonly Signal[] => [...buffer];

const emit = (signal: Signal): void => {
    buffer.push(signal);
    if (buffer.length > BUFFER_LIMIT) buffer.shift();

    for (const sink of sinks) {
        try {
            sink(signal);
        } catch {
            // A broken sink must not take down the caller. Deliberately silent:
            // logging here could recurse straight back into this function.
        }
    }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const captureError = (
    error: unknown,
    source: string,
    context: Record<string, unknown> = {},
): void => {
    emit({
        kind: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        source,
        context,
        sessionId: SESSION_ID,
        timestamp: new Date().toISOString(),
    });
};

/** A product event: something the person did, or a result they were shown. */
export const trackEvent = (name: string, props: Record<string, unknown> = {}): void => {
    emit({ kind: 'event', name, props, sessionId: SESSION_ID, timestamp: new Date().toISOString() });
};

/** A structured log line. Carries requestId so a request can be followed. */
export const log = (name: string, props: Record<string, unknown> = {}): void => {
    emit({ kind: 'log', name, props, sessionId: SESSION_ID, timestamp: new Date().toISOString() });
};

// ─── Funnel ───────────────────────────────────────────────────────────────────

/**
 * The conversion funnel, named in one place so the stages cannot drift apart
 * as they get called from different screens. Search → result → outbound click
 * is the only sequence that says whether this product works commercially.
 */
export const funnel = {
    searchStarted: (props: { surface: string; origin?: string; destination?: string; activity?: string }) =>
        trackEvent('funnel.search_started', props),

    searchSucceeded: (props: { surface: string; resultCount: number; durationMs?: number }) =>
        trackEvent('funnel.search_succeeded', props),

    searchFailed: (props: { surface: string; reason: string; status?: number | null }) =>
        trackEvent('funnel.search_failed', props),

    resultsShown: (props: { surface: string; resultCount: number }) =>
        trackEvent('funnel.results_shown', props),

    /** The money event: someone left for a partner to book. */
    outboundClicked: (props: { partner: string; surface: string; origin?: string; destination?: string; affiliateTagged?: boolean }) =>
        trackEvent('funnel.outbound_clicked', props),
};

// ─── Default sinks ────────────────────────────────────────────────────────────

/** Human-readable console output. Off in production and in tests. */
const consoleSink: Sink = (signal) => {
    if (signal.kind === 'error') {
        console.error(`[telemetry:error] ${signal.source}`, signal.error, signal.context);
        return;
    }
    console.debug(`[telemetry:${signal.kind}] ${signal.name}`, signal.props);
};

/**
 * Ships signals to a collector if one is configured. Uses sendBeacon so a
 * report survives the page being closed — which is exactly when the outbound
 * booking click happens.
 */
const beaconSink = (endpoint: string): Sink => (signal) => {
    const body = JSON.stringify(
        signal.kind === 'error'
            ? {
                kind: 'error',
                source: signal.source,
                message: signal.error.message,
                stack: signal.error.stack,
                context: signal.context,
                sessionId: signal.sessionId,
                timestamp: signal.timestamp,
            }
            : signal,
    );

    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
            return;
        }
        void fetch(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    } catch {
        // Never let a failed report surface to the person using the site.
    }
};

let installed = false;

/** Wire up the default sinks. Idempotent; called once from the app entry. */
export const initTelemetry = (): void => {
    if (installed || isTest()) return;
    installed = true;

    if (!isProduction()) registerSink(consoleSink);

    const endpoint = (readEnv('REACT_APP_TELEMETRY_ENDPOINT') ?? '').trim();
    if (endpoint) registerSink(beaconSink(endpoint));

    if (typeof window !== 'undefined') {
        // Errors that never reach a React boundary — async callbacks, event
        // handlers, and rejected promises nobody awaited.
        window.addEventListener('error', (event) => {
            captureError(event.error ?? event.message, 'window-error', {
                filename: event.filename,
                line: event.lineno,
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            captureError(event.reason, 'unhandled-rejection', {});
        });
    }
};
