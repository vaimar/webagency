import React, { useEffect } from 'react';

// Update the AmadeusProps interface in Amadeus.tsx
interface AmadeusProps {
    onTokenReceived: (token: string) => void;
    onFlightSearch?: (results: unknown[]) => void;
}

const Amadeus: React.FC<AmadeusProps> = ({ onTokenReceived }) => {
    const accessToken = (((process.env as { REACT_APP_AMADEUS_TOKEN?: string })?.REACT_APP_AMADEUS_TOKEN) ?? '').trim();

    useEffect(() => {
        onTokenReceived(accessToken);
    }, [accessToken, onTokenReceived]);

    return null;
};

export default Amadeus;