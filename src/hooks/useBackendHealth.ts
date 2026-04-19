import { useCallback, useEffect, useState } from 'react';
import { ApiDiagnostics, ApiRequestError, checkBackendHealth } from '../services/api';

type HealthStatus = 'unknown' | 'online' | 'offline';

interface UseBackendHealthResult {
    status: HealthStatus;
    backendState: string;
    diagnostics: ApiDiagnostics | null;
    lastCheckedAt: string | null;
    refresh: () => Promise<void>;
}

export const useBackendHealth = (): UseBackendHealthResult => {
    const [status, setStatus] = useState<HealthStatus>('unknown');
    const [backendState, setBackendState] = useState<string>('UNKNOWN');
    const [diagnostics, setDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const result = await checkBackendHealth();
            setStatus(result.ok ? 'online' : 'offline');
            setBackendState(result.status);
            setDiagnostics(result.diagnostics);
            setLastCheckedAt(new Date().toISOString());
        } catch (error) {
            setStatus('offline');
            setBackendState('DOWN');
            if (error instanceof ApiRequestError) {
                setDiagnostics(error.diagnostics);
            }
            setLastCheckedAt(new Date().toISOString());
        }
    }, []);

    useEffect(() => {
        void refresh();
        const interval = setInterval(() => void refresh(), 30_000);
        return () => clearInterval(interval);
    }, [refresh]);

    return { status, backendState, diagnostics, lastCheckedAt, refresh };
};
