import { useCallback, useEffect, useState } from 'react';
import { checkBackendHealth } from '../services/api';

type HealthStatus = 'unknown' | 'online' | 'offline';

export const useBackendHealth = (): HealthStatus => {
    const [status, setStatus] = useState<HealthStatus>('unknown');

    const poll = useCallback(async () => {
        const ok = await checkBackendHealth();
        setStatus(ok ? 'online' : 'offline');
    }, []);

    useEffect(() => {
        void poll();
        const interval = setInterval(() => void poll(), 30_000);
        return () => clearInterval(interval);
    }, [poll]);

    return status;
};

