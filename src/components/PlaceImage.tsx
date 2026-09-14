import React, { useState } from 'react';
import './PlaceImage.css';

interface PlaceImageProps {
    src?: string | null;
    alt: string;
    label: string;
    className?: string;
}

const PlaceImage: React.FC<PlaceImageProps> = ({ src, alt, label, className = '' }) => {
    const [failed, setFailed] = useState(false);

    if (!src || failed) {
        return (
            <div className={`place-image place-image--fallback ${className}`.trim()} aria-label={`${label}: no photo available`}>
                <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
                <small>No verified photo</small>
            </div>
        );
    }

    return (
        <img
            className={`place-image ${className}`.trim()}
            src={src}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    );
};

export default PlaceImage;
