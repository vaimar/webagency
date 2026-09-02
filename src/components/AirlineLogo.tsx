import React, { useState } from 'react';
import { airlineLogoUrl, airlineName } from '../data/airlines';
import './AirlineLogo.css';

interface AirlineLogoProps {
    /** IATA carrier code, e.g. "FR". Nothing renders without one. */
    code?: string | null;
    /** Size in px of the square mark. */
    size?: number;
    /**
     * True when the carrier's name is already written next to the logo — the
     * mark is then decoration, and a screen reader should not read the airline
     * twice. Left false, the logo carries the name as its alt text.
     */
    labelled?: boolean;
}

/**
 * A carrier's logo, with the airline's initials as the fallback. The mark comes
 * from a third-party CDN, so it has to survive an ad blocker, an offline user
 * and an airline nobody has a logo for — in every one of those cases this shows
 * the code instead of an empty box or a broken-image icon.
 */
const AirlineLogo: React.FC<AirlineLogoProps> = ({ code, size = 20, labelled = false }) => {
    const [failed, setFailed] = useState(false);
    if (!code) {
        return null;
    }
    const upper = code.toUpperCase();
    const style = { width: size, height: size };

    if (failed) {
        return (
            <span
                className="airline-logo airline-logo--fallback"
                style={{ ...style, fontSize: Math.round(size * 0.42) }}
                aria-hidden={labelled || undefined}
                title={airlineName(upper)}
            >
                {upper}
            </span>
        );
    }

    return (
        <img
            className="airline-logo"
            style={style}
            src={airlineLogoUrl(upper)}
            alt={labelled ? '' : `${airlineName(upper)} logo`}
            width={size}
            height={size}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
};

export default AirlineLogo;
