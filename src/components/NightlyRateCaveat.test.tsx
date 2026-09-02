import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NightlyRateCaveat, { NIGHTLY_RATE_CAVEAT, NIGHTLY_RATE_CAVEAT_SHORT } from './NightlyRateCaveat';

/**
 * The caveat is a truth claim, not decoration: a nightly rate is one room at
 * the provider's default occupancy, and the app sends no party size. If this
 * ever silently disappears from a stay surface, the price starts implying
 * something false, which is the exact failure the product exists to avoid.
 */
describe('NightlyRateCaveat', () => {
    it('says the rate is one room, not a per-person or per-party price', () => {
        render(<NightlyRateCaveat variant="block" />);
        expect(screen.getByText(/one room/i)).toBeInTheDocument();
        expect(screen.getByText(/two sharing/i)).toBeInTheDocument();
    });

    it('warns that party size is not applied', () => {
        render(<NightlyRateCaveat variant="block" />);
        expect(screen.getByText(/not adjusted for your party size/i)).toBeInTheDocument();
    });

    it('keeps a short form for sitting under a single price', () => {
        render(<NightlyRateCaveat />);
        expect(screen.getByText(NIGHTLY_RATE_CAVEAT_SHORT)).toBeInTheDocument();
    });

    it('states the same fact in both lengths, so no surface is softer than another', () => {
        for (const text of [NIGHTLY_RATE_CAVEAT, NIGHTLY_RATE_CAVEAT_SHORT]) {
            expect(text.toLowerCase()).toContain('one room');
            expect(text.toLowerCase()).toContain('sharing');
        }
    });

    it('is not dismissible — there is no control to hide it', () => {
        const { container } = render(<NightlyRateCaveat variant="block" />);
        expect(container.querySelector('button')).toBeNull();
    });
});
