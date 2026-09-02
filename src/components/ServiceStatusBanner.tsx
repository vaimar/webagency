import { faArrowRotateRight, faPlugCircleExclamation, faTriangleExclamation, faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { ServiceStatus, recheckService } from '../services/serviceStatus';

/**
 * Says out loud what the empty panels mean.
 *
 * Every data view in this app depends on a backend that is often not running.
 * Without this, an outage and "there are genuinely no results" render the same
 * way, and the honest conclusion for a visitor is that the product is broken.
 * Naming the outage — and saying which side of it is at fault — is the
 * difference between "down right now" and "does not work".
 */

const COPY: Record<Exclude<ServiceStatus, 'ok' | 'unknown'>, { icon: typeof faWifi; title: string; body: string }> = {
    offline: {
        icon: faWifi,
        title: 'You are offline',
        body: 'Your device has no internet connection, so live prices and routes cannot load. Anything already on screen stays available.',
    },
    unreachable: {
        icon: faPlugCircleExclamation,
        title: 'Live travel data is unavailable',
        body: 'The service that supplies flights, stays and routes is not responding. This is on our side, not yours — the pages still work, but the panels below will stay empty.',
    },
    degraded: {
        icon: faTriangleExclamation,
        title: 'Live travel data is having problems',
        body: 'The service is answering with errors, so some results may be missing or out of date. Prices shown may not be current.',
    },
};

const ServiceStatusBanner: React.FC = () => {
    const { status } = useServiceStatus();
    const [dismissedFor, setDismissedFor] = useState<ServiceStatus | null>(null);
    const [retrying, setRetrying] = useState(false);

    // A dismissal covers the outage the person dismissed, not the next one.
    useEffect(() => {
        if (status === 'ok' || status === 'unknown') setDismissedFor(null);
    }, [status]);

    if (status === 'ok' || status === 'unknown' || dismissedFor === status) return null;

    const copy = COPY[status];

    const handleRetry = async (): Promise<void> => {
        setRetrying(true);
        try {
            await recheckService();
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className={`service-banner service-banner--${status}`} role="status" aria-live="polite">
            <div className="page-container service-banner__inner">
                <div className="service-banner__icon" aria-hidden="true">
                    <FontAwesomeIcon icon={copy.icon} />
                </div>

                <div className="service-banner__content">
                    <strong className="service-banner__title">{copy.title}</strong>
                    <span className="service-banner__body">{copy.body}</span>
                </div>

                <div className="service-banner__actions">
                    {status !== 'offline' && (
                        <button
                            type="button"
                            className="service-banner__retry"
                            onClick={handleRetry}
                            disabled={retrying}
                        >
                            <FontAwesomeIcon icon={faArrowRotateRight} spin={retrying} />
                            <span>{retrying ? 'Checking...' : 'Try again'}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        className="service-banner__close"
                        onClick={() => setDismissedFor(status)}
                        aria-label="Dismiss this notice"
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ServiceStatusBanner;
