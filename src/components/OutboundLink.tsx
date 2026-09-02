import React from 'react';
import { funnel } from '../services/telemetry';

interface OutboundLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string;
    /** Partner being handed off to, e.g. 'Ryanair', 'Booking.com'. */
    partner: string;
    /** Screen the click came from, so the funnel can be split by surface. */
    surface: string;
    origin?: string | null;
    destination?: string | null;
    children: React.ReactNode;
}

/**
 * An outbound partner link that records the handoff.
 *
 * This is the conversion event — the moment someone leaves to book — and it was
 * previously invisible. Every outbound link should go through this rather than
 * a bare <a>, so the funnel has a consistent last stage.
 *
 * The click is never blocked or delayed: the event is buffered synchronously
 * and, where a collector is configured, sent with sendBeacon, which survives
 * the page being replaced by the partner's site.
 */
const OutboundLink: React.FC<OutboundLinkProps> = ({
    href, partner, surface, origin, destination, children, onClick, ...rest
}) => {
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        try {
            funnel.outboundClicked({
                partner,
                surface,
                origin: origin ?? undefined,
                destination: destination ?? undefined,
                // Records whether this handoff could actually earn anything —
                // an untagged link still works, it just is not attributed.
                affiliateTagged: /[?&](aid|associateId|affiliate|partner_id|campaign)=/.test(href),
            });
        } catch {
            // Analytics must never stop someone reaching the booking page.
        }
        onClick?.(event);
    };

    return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick} {...rest}>
            {children}
        </a>
    );
};

export default OutboundLink;
