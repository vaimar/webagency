import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCableCar, faShip, faWater, faBolt } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './SpotTile.css';

/**
 * The visual for one spot: its photograph where the catalogue has a usable one,
 * and a generated tile where it does not.
 *
 * <p>Only about a quarter of the catalogue has a photo, and every one of them is a
 * hotlink to the park's own site that can 403 or rot at any time. So a missing
 * image is the normal case here, not the exception, and the fallback has to be a
 * designed state rather than a grey box — otherwise three quarters of the finder
 * looks broken.
 *
 * <p>The fallback is derived from the slug, so a given park always gets the same
 * colours: the grid reads as a set of distinct places rather than a wall of one
 * repeated placeholder, and a spot does not change appearance between visits. The
 * traction icon carries the one fact that most distinguishes a venue at a glance.
 */

export interface SpotTileProps {
    slug: string | null;
    label: string;
    photoUrl: string | null;
    photoCredit?: string | null;
    towType?: string | null;
    /** Renders the taller hero crop rather than the grid crop. */
    variant?: 'grid' | 'hero';
    className?: string;
}

const TRACTION_ICON: Record<string, IconDefinition> = {
    FULL_CABLE: faCableCar,
    CABLE_UNSPECIFIED: faCableCar,
    MIXED: faCableCar,
    SYSTEM_2_0: faBolt,
    BOAT: faShip,
    WINCH: faBolt,
};

/**
 * Six hues spread around the wheel, all at a saturation and lightness that keeps
 * white type over them above AA. Picked as a fixed set rather than a free hue
 * rotation because an unconstrained hue lands on yellows that white cannot sit on.
 */
const PALETTE: [string, string][] = [
    ['#0e7490', '#155e75'], // teal
    ['#1d4ed8', '#1e3a8a'], // blue
    ['#4338ca', '#312e81'], // indigo
    ['#0f766e', '#115e59'], // pine
    ['#b45309', '#7c2d12'], // amber-earth
    ['#be123c', '#881337'], // rose
];

/** Stable small hash — the same slug must always pick the same swatch. */
const hashOf = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
};

/** "EXO 64 (Lac de Sames)" → "E6". Two characters, from words, ignoring brackets. */
const initialsOf = (label: string): string => {
    const words = label.replace(/\(.*?\)/g, ' ').split(/[\s-]+/).filter(Boolean);
    const letters = words.map((w) => w[0]).filter((c) => /[A-Za-z0-9]/.test(c));
    return (letters.slice(0, 2).join('') || label.slice(0, 2)).toUpperCase();
};

const SpotTile: React.FC<SpotTileProps> = ({
    slug, label, photoUrl, photoCredit, towType, variant = 'grid', className = '',
}) => {
    // A hotlink that 403s or dies mid-session falls back rather than showing the
    // browser's broken-image glyph. State, not CSS, because onError is the only
    // signal the load actually failed.
    const [failed, setFailed] = useState(false);

    const key = slug ?? label;
    const tone = hashOf(key) % PALETTE.length;
    const [from, to] = PALETTE[tone];
    const icon = TRACTION_ICON[towType ?? ''] ?? faWater;
    const classes = `spot-tile spot-tile--${variant} ${className}`.trim();

    if (photoUrl && !failed) {
        return (
            <figure className={classes}>
                <img
                    className="spot-tile__img"
                    src={photoUrl}
                    alt={label}
                    loading="lazy"
                    onError={() => setFailed(true)}
                />
                {photoCredit && <figcaption className="spot-tile__credit">{photoCredit}</figcaption>}
            </figure>
        );
    }

    return (
        <div
            className={`${classes} spot-tile--generated`}
            // Which swatch this spot landed on. Exposed as an attribute because the
            // gradient itself is unreadable once a browser normalises the shorthand,
            // so this is the only stable handle on "did these two spots differ".
            data-tile-tone={tone}
            style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
            aria-hidden="true"
        >
            <FontAwesomeIcon icon={icon} className="spot-tile__icon" />
            <span className="spot-tile__initials">{initialsOf(label)}</span>
        </div>
    );
};

export default SpotTile;
