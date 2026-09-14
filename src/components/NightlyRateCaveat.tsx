import React from 'react';
import './NightlyRateCaveat.css';

/**
 * Why this exists:
 *   A nightly rate shown as a bare "€120 / night" quietly implies it is what
 *   *you* will pay. It is not. The rate comes back from the provider at their
 *   default occupancy — one room, normally two people sharing — and this app
 *   sends no party size with the request, so nothing is adjusted for a solo
 *   traveller, a group of four, or a family needing two rooms.
 *
 *   The site's whole argument is that travel companies are not straight about
 *   what a trip costs. Showing a room rate as if it were a per-person or
 *   per-party price would be the same trick, so the caveat sits next to the
 *   number rather than in a footnote nobody reads.
 *
 *   It is deliberately not dismissible: it stays true on every visit.
 */

/** Single source of the wording, so no two surfaces can drift apart. */
export const NIGHTLY_RATE_CAVEAT =
    'One room at the provider’s standard occupancy — usually two sharing. Not adjusted for your party size, and extra guests or a second room cost more.';

export const NIGHTLY_RATE_CAVEAT_SHORT = 'One room, usually two sharing';

interface Props {
    /** 'inline' sits under a single price; 'block' heads a list of stays. */
    variant?: 'inline' | 'block';
}

const NightlyRateCaveat: React.FC<Props> = ({ variant = 'inline' }) => (
    <p className={`nightly-rate-caveat nightly-rate-caveat--${variant}`}>
        {variant === 'inline' ? NIGHTLY_RATE_CAVEAT_SHORT : NIGHTLY_RATE_CAVEAT}
    </p>
);

export default NightlyRateCaveat;
