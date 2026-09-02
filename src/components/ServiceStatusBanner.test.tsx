import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { reportApiOutcome, resetServiceStatus } from '../services/serviceStatus';
import ServiceStatusBanner from './ServiceStatusBanner';

/**
 * Status changes originate outside React, so anything reported while the
 * banner is mounted has to be wrapped in act() for the re-render to flush.
 */
const report = (...outcomes: Parameters<typeof reportApiOutcome>[0][]): void => {
    act(() => {
        outcomes.forEach(reportApiOutcome);
    });
};

const TRANSPORT_FAILURE = { url: '/api/flights', ok: false, status: null, message: 'Failed to fetch' };
const SERVER_ERROR = { url: '/api/trips/explore', ok: false, status: 500 };
const SUCCESS = { url: '/api/flights', ok: true, status: 200 };

describe('ServiceStatusBanner', () => {
    beforeEach(() => {
        resetServiceStatus();
    });

    it('renders nothing before any request has completed', () => {
        const { container } = render(<ServiceStatusBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing while the backend is answering', () => {
        reportApiOutcome(SUCCESS);

        const { container } = render(<ServiceStatusBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('names the outage as ours, not the visitor’s, when the backend is unreachable', () => {
        reportApiOutcome(TRANSPORT_FAILURE);
        reportApiOutcome(TRANSPORT_FAILURE);

        render(<ServiceStatusBanner />);

        expect(screen.getByText('Live travel data is unavailable')).toBeInTheDocument();
        expect(screen.getByText(/on our side, not yours/i)).toBeInTheDocument();
    });

    it('appears when the status degrades while mounted', () => {
        render(<ServiceStatusBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        report(TRANSPORT_FAILURE, TRANSPORT_FAILURE);

        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('disappears once the backend answers again', () => {
        render(<ServiceStatusBanner />);
        report(TRANSPORT_FAILURE, TRANSPORT_FAILURE);
        expect(screen.getByRole('status')).toBeInTheDocument();

        report(SUCCESS);

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('can be dismissed, and comes back for a different problem', () => {
        render(<ServiceStatusBanner />);
        report(TRANSPORT_FAILURE, TRANSPORT_FAILURE);

        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        // Backend comes back, then starts erroring — a new problem, so speak up again.
        report(SUCCESS);
        report(SERVER_ERROR, SERVER_ERROR);

        expect(screen.getByText('Live travel data is having problems')).toBeInTheDocument();
    });

    it('offers a retry when the backend is at fault', () => {
        render(<ServiceStatusBanner />);
        report(SERVER_ERROR, SERVER_ERROR);

        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('offers no retry when the device itself is offline', () => {
        render(<ServiceStatusBanner />);

        // Nothing can leave the machine, so a retry button would only ever lie.
        act(() => {
            window.dispatchEvent(new Event('offline'));
        });

        expect(screen.getByText('You are offline')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });
});
