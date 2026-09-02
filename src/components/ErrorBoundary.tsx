import { faArrowRotateRight, faHouse, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { captureError } from '../services/telemetry';

/**
 * Why this exists:
 *   There was no error boundary anywhere in the app. React's default for an
 *   uncaught render error is to unmount the whole tree — the person gets a
 *   white page, with the header, the navigation and any way back all gone.
 *   One bad field in one API response could take out the entire site.
 *
 *   This keeps a crash local. The page-scoped boundary in Main.tsx loses the
 *   page but keeps the shell, so navigation still works; the app-scoped one in
 *   App.tsx is the last resort for a crash in the providers themselves.
 */

type Scope = 'app' | 'page';

interface Props {
    children: React.ReactNode;
    /** 'page' keeps the surrounding shell; 'app' is a whole-screen failure. */
    scope?: Scope;
    /** Called when the person clicks "Try again", before the retry re-renders. */
    onReset?: () => void;
}

interface State {
    error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // Reported rather than only logged: a render crash the person recovers
        // from by clicking "Try again" leaves no other trace at all.
        captureError(error, 'render', {
            scope: this.props.scope ?? 'page',
            componentStack: info.componentStack,
            path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        });
    }

    handleReset = (): void => {
        this.props.onReset?.();
        this.setState({ error: null });
    };

    handleReload = (): void => {
        window.location.reload();
    };

    render(): React.ReactNode {
        const { error } = this.state;
        const { children, scope = 'page' } = this.props;

        if (!error) return children;

        const isApp = scope === 'app';

        return (
            <div className={`error-boundary error-boundary--${scope}`} role="alert">
                <div className="error-boundary__panel">
                    <div className="error-boundary__icon" aria-hidden="true">
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                    </div>

                    <h2 className="error-boundary__title">
                        {isApp ? 'This page stopped working' : 'This section stopped working'}
                    </h2>

                    <p className="error-boundary__body">
                        {isApp
                            ? 'Something went wrong while loading the app. Nothing you did caused it and nothing was saved or sent.'
                            : 'Something went wrong while building this view. The rest of the site still works — you can go back and try a different section.'}
                    </p>

                    <div className="error-boundary__actions">
                        <button type="button" className="error-boundary__button error-boundary__button--primary" onClick={this.handleReset}>
                            <FontAwesomeIcon icon={faArrowRotateRight} />
                            <span>Try again</span>
                        </button>
                        <button type="button" className="error-boundary__button" onClick={this.handleReload}>
                            <span>Reload the page</span>
                        </button>
                        <a className="error-boundary__button" href="/">
                            <FontAwesomeIcon icon={faHouse} />
                            <span>Back to home</span>
                        </a>
                    </div>

                    {/* Shown to everyone, collapsed. Someone reporting a bug can open
                        it and paste the message; nobody else has to look at it. */}
                    <details className="error-boundary__details">
                        <summary>Technical details</summary>
                        <code>{error.message || error.name || 'Unknown error'}</code>
                    </details>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
