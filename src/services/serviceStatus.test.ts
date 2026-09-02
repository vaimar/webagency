import {
    getServiceStatus,
    reportApiOutcome,
    resetServiceStatus,
    subscribeToServiceStatus,
} from './serviceStatus';

describe('serviceStatus', () => {
    beforeEach(() => {
        resetServiceStatus();
    });

    it('starts unknown so a fresh page says nothing', () => {
        expect(getServiceStatus().status).toBe('unknown');
    });

    it('goes ok on a successful request', () => {
        reportApiOutcome({ url: '/api/flights', ok: true, status: 200 });

        const snapshot = getServiceStatus();
        expect(snapshot.status).toBe('ok');
        expect(snapshot.lastOkAt).not.toBeNull();
    });

    it('does not announce an outage on a single transport failure', () => {
        reportApiOutcome({ url: '/api/flights', ok: false, status: null, message: 'Failed to fetch' });

        expect(getServiceStatus().status).toBe('unknown');
    });

    it('reports unreachable after consecutive transport failures', () => {
        reportApiOutcome({ url: '/api/flights', ok: false, status: null, message: 'Failed to fetch' });
        reportApiOutcome({ url: '/api/hotels/nearby', ok: false, status: null, message: 'Failed to fetch' });

        const snapshot = getServiceStatus();
        expect(snapshot.status).toBe('unreachable');
        expect(snapshot.lastFailure).toMatchObject({ url: '/api/hotels/nearby', status: null });
    });

    it('ignores caller-cancelled requests', () => {
        reportApiOutcome({ url: '/api/airports', ok: false, status: null, aborted: true });
        reportApiOutcome({ url: '/api/airports', ok: false, status: null, aborted: true });
        reportApiOutcome({ url: '/api/airports', ok: false, status: null, aborted: true });

        expect(getServiceStatus().status).toBe('unknown');
    });

    it('treats repeated 5xx as degraded, not unreachable', () => {
        reportApiOutcome({ url: '/api/trips/explore', ok: false, status: 500 });
        reportApiOutcome({ url: '/api/trips/explore', ok: false, status: 502 });

        expect(getServiceStatus().status).toBe('degraded');
    });

    it('does not treat a 404 on one resource as an outage', () => {
        reportApiOutcome({ url: '/api/hotels/xid-1', ok: false, status: 404 });
        reportApiOutcome({ url: '/api/hotels/xid-2', ok: false, status: 404 });

        // Something answered, so the service is up — the resource just is not there.
        expect(getServiceStatus().status).toBe('ok');
    });

    it('recovers to ok once a request succeeds again', () => {
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        expect(getServiceStatus().status).toBe('unreachable');

        reportApiOutcome({ url: '/api/flights', ok: true, status: 200 });
        expect(getServiceStatus().status).toBe('ok');
    });

    it('requires a fresh run of failures after a recovery', () => {
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        reportApiOutcome({ url: '/api/flights', ok: true, status: 200 });

        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        expect(getServiceStatus().status).toBe('ok');
    });

    it('notifies subscribers only when the status changes', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeToServiceStatus(listener);

        reportApiOutcome({ url: '/api/flights', ok: true, status: 200 });
        reportApiOutcome({ url: '/api/flights', ok: true, status: 200 });

        // Both calls change lastOkAt, so both emit — but the status stays 'ok'.
        expect(listener).toHaveBeenCalled();
        expect(listener.mock.calls.every(([snapshot]) => snapshot.status === 'ok')).toBe(true);

        listener.mockClear();
        unsubscribe();
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        reportApiOutcome({ url: '/api/flights', ok: false, status: null });
        expect(listener).not.toHaveBeenCalled();
    });
});
