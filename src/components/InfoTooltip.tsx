import React, { useId } from 'react';

export type InfoTooltipTone = 'info' | 'warn';

interface InfoTooltipProps {
    /** Short glyph/text shown in the always-visible micro-badge. */
    label: React.ReactNode;
    /** Rich detail revealed on hover / focus. */
    children: React.ReactNode;
    /** Screen-reader description of what the badge opens. */
    ariaLabel: string;
    tone?: InfoTooltipTone;
}

// Progressive disclosure primitive: an elegant micro-badge that keeps dense
// logistics text off the main card and reveals it on hover or keyboard focus.
// CSS-only reveal (see .trip-explore-dashboard__info-* rules) so it works
// without extra state, and the detail stays in the DOM for assistive tech.
const InfoTooltip: React.FC<InfoTooltipProps> = ({ label, children, ariaLabel, tone = 'info' }) => {
    const bubbleId = useId();

    return (
        <span className="trip-explore-dashboard__info">
            <button
                type="button"
                className={
                    tone === 'warn'
                        ? 'trip-explore-dashboard__info-badge trip-explore-dashboard__info-badge--warn'
                        : 'trip-explore-dashboard__info-badge'
                }
                aria-label={ariaLabel}
                aria-describedby={bubbleId}
            >
                {label}
            </button>
            <span role="tooltip" id={bubbleId} className="trip-explore-dashboard__info-bubble">
                {children}
            </span>
        </span>
    );
};

export default InfoTooltip;
