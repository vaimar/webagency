import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    captureError,
    funnel,
    newRequestId,
    recentSignals,
    registerSink,
    trackEvent,
    type Signal,
} from './telemetry';

describe('telemetry', () => {
    let received: Signal[];
    let unregister: () => void;

    beforeEach(() => {
        received = [];
        unregister?.();
        unregister = registerSink((signal) => received.push(signal));
    });

    it('gives every request a distinct id', () => {
        const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
        expect(ids.size).toBe(200);
    });

    it('normalises a thrown non-Error into an Error so stacks are never lost', () => {
        captureError('just a string', 'test');

        const signal = received.at(-1);
        expect(signal?.kind).toBe('error');
        expect(signal && 'error' in signal && signal.error).toBeInstanceOf(Error);
        expect(signal && 'error' in signal && signal.error.message).toBe('just a string');
    });

    it('tags every signal with the same session id', () => {
        trackEvent('one');
        captureError(new Error('two'), 'test');

        const sessions = new Set(received.map((s) => s.sessionId));
        expect(sessions.size).toBe(1);
    });

    // The whole point of the abstraction: a reporting outage must not become a
    // product outage. A sink that throws used to take the caller down with it.
    it('survives a sink that throws, and still reaches the other sinks', () => {
        const good: Signal[] = [];
        const stopBad = registerSink(() => { throw new Error('sink is down'); });
        const stopGood = registerSink((signal) => good.push(signal));

        expect(() => trackEvent('still.delivered')).not.toThrow();
        expect(good.at(-1) && 'name' in good.at(-1)!).toBe(true);

        stopBad();
        stopGood();
    });

    it('records the outbound click with whether the link was actually attributed', () => {
        funnel.outboundClicked({ partner: 'Ryanair', surface: 'test', affiliateTagged: false });

        const signal = received.at(-1);
        expect(signal && 'name' in signal && signal.name).toBe('funnel.outbound_clicked');
        expect(signal && 'props' in signal && signal.props.affiliateTagged).toBe(false);
    });

    it('keeps a bounded buffer so a long session cannot grow without limit', () => {
        for (let i = 0; i < 200; i += 1) trackEvent(`event.${i}`);

        const buffered = recentSignals();
        expect(buffered.length).toBeLessThanOrEqual(50);
        // The most recent must survive — an overflowing buffer that drops the
        // newest would be worse than useless for diagnosing a fresh failure.
        expect(buffered.at(-1) && 'name' in buffered.at(-1)!
            && (buffered.at(-1) as { name: string }).name).toBe('event.199');
    });

    it('stops delivering after a sink unregisters', () => {
        const seen: Signal[] = [];
        const stop = registerSink((signal) => seen.push(signal));

        trackEvent('before');
        stop();
        trackEvent('after');

        expect(seen).toHaveLength(1);
    });

    it('does not throw when no sink is registered at all', () => {
        unregister();
        unregister = () => undefined;
        expect(() => captureError(new Error('nobody listening'), 'test')).not.toThrow();
    });

    it('hands out a copy of the buffer, not the live array', () => {
        trackEvent('one');
        const snapshot = recentSignals() as Signal[];
        const lengthBefore = recentSignals().length;

        // Mutating what a caller was given must not corrupt the shared buffer.
        snapshot.push({ kind: 'event', name: 'injected', props: {}, sessionId: 'x', timestamp: 'x' });

        expect(recentSignals().length).toBe(lengthBefore);
        expect(recentSignals().some((s) => 'name' in s && s.name === 'injected')).toBe(false);
    });
});

describe('telemetry init', () => {
    it('is inert in tests, so a suite never ships signals anywhere', async () => {
        const beacon = vi.fn();
        vi.stubGlobal('navigator', { sendBeacon: beacon });

        const { initTelemetry } = await import('./telemetry');
        initTelemetry();
        trackEvent('should.not.be.sent');

        expect(beacon).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
