import type { MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from './ErrorBoundary';

const Boom: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
    if (shouldThrow) throw new Error('kaboom from a bad API shape');
    return <p>Recovered content</p>;
};

describe('ErrorBoundary', () => {
    let consoleError: MockInstance;

    beforeEach(() => {
        // React logs the caught error itself; silence it so a passing run is readable.
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('renders children when nothing throws', () => {
        render(
            <ErrorBoundary>
                <p>All good</p>
            </ErrorBoundary>,
        );

        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('shows a recovery panel instead of unmounting the tree', () => {
        render(
            <ErrorBoundary scope="page">
                <Boom shouldThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('This section stopped working')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
    });

    it('surfaces the underlying message for a bug report', () => {
        render(
            <ErrorBoundary>
                <Boom shouldThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByText('kaboom from a bad API shape')).toBeInTheDocument();
    });

    it('uses whole-screen copy at app scope', () => {
        render(
            <ErrorBoundary scope="app">
                <Boom shouldThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByText('This page stopped working')).toBeInTheDocument();
    });

    it('re-renders the children when "Try again" is clicked', () => {
        // A transient failure: the first render throws, the retry does not —
        // which is exactly the shape of one bad response from the backend.
        let failing = true;
        const Flaky: React.FC = () => <Boom shouldThrow={failing} />;

        render(
            <ErrorBoundary>
                <Flaky />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();

        failing = false;
        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText('Recovered content')).toBeInTheDocument();
    });

    it('calls onReset before retrying', () => {
        const onReset = vi.fn();

        render(
            <ErrorBoundary onReset={onReset}>
                <Boom shouldThrow />
            </ErrorBoundary>,
        );

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onReset).toHaveBeenCalledTimes(1);
    });
});
