import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OutboundLink from './OutboundLink';
import { registerSink, type Signal } from '../services/telemetry';

describe('OutboundLink', () => {
    let signals: Signal[];
    let stop: () => void;

    beforeEach(() => {
        signals = [];
        stop?.();
        stop = registerSink((signal) => signals.push(signal));
    });

    const lastEvent = () => signals.filter((s) => s.kind === 'event').at(-1) as
        { name: string; props: Record<string, unknown> } | undefined;

    it('records the handoff when someone leaves to book', async () => {
        render(
            <OutboundLink href="https://www.ryanair.com/trip" partner="Ryanair" surface="flight-card" origin="DUB" destination="AGP">
                Ryanair
            </OutboundLink>,
        );

        await userEvent.click(screen.getByRole('link', { name: 'Ryanair' }));

        expect(lastEvent()?.name).toBe('funnel.outbound_clicked');
        expect(lastEvent()?.props).toMatchObject({
            partner: 'Ryanair', surface: 'flight-card', origin: 'DUB', destination: 'AGP',
        });
    });

    // An untagged link still works but earns nothing. Recording which is which
    // is the only way to notice that affiliate IDs were never set in a deploy.
    it('distinguishes an attributed link from an untagged one', async () => {
        const { unmount } = render(
            <OutboundLink href="https://www.booking.com/city.html?aid=booking-789" partner="Booking" surface="stay">
                Tagged
            </OutboundLink>,
        );
        await userEvent.click(screen.getByRole('link', { name: 'Tagged' }));
        expect(lastEvent()?.props.affiliateTagged).toBe(true);
        unmount();

        render(
            <OutboundLink href="https://www.booking.com/city.html" partner="Booking" surface="stay">
                Untagged
            </OutboundLink>,
        );
        await userEvent.click(screen.getByRole('link', { name: 'Untagged' }));
        expect(lastEvent()?.props.affiliateTagged).toBe(false);
    });

    it('opens safely in a new tab', () => {
        render(<OutboundLink href="https://example.test" partner="X" surface="s">Go</OutboundLink>);

        const link = screen.getByRole('link', { name: 'Go' });
        expect(link).toHaveAttribute('target', '_blank');
        // Without noopener the partner page gets a handle on window.opener.
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('still navigates when telemetry throws', async () => {
        const stopBad = registerSink(() => { throw new Error('sink down'); });
        const clicks: string[] = [];

        render(
            <OutboundLink href="https://example.test" partner="X" surface="s" onClick={() => clicks.push('clicked')}>
                Book
            </OutboundLink>,
        );

        await userEvent.click(screen.getByRole('link', { name: 'Book' }));
        expect(clicks).toEqual(['clicked']);
        stopBad();
    });
});
