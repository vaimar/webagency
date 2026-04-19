import React, { useEffect } from 'react';

interface DeprecatedIntegrationProps {
    onTokenReceived: (token: string) => void;
    onFlightSearch?: (results: unknown[]) => void;
}

const DeprecatedIntegration: React.FC<DeprecatedIntegrationProps> = ({ onTokenReceived }) => {
    useEffect(() => {
        onTokenReceived('');
    }, [onTokenReceived]);

    return null;
};

export default DeprecatedIntegration;
