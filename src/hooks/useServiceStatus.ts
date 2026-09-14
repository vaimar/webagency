import { useEffect, useState } from 'react';
import {
    ServiceStatusSnapshot,
    getServiceStatus,
    subscribeToServiceStatus,
} from '../services/serviceStatus';

/** Subscribe to observed backend reachability. See services/serviceStatus.ts. */
export const useServiceStatus = (): ServiceStatusSnapshot => {
    const [snapshot, setSnapshot] = useState<ServiceStatusSnapshot>(getServiceStatus);

    useEffect(() => {
        // Re-read on mount: a request may have failed between the initial
        // useState call and the subscription being attached.
        setSnapshot(getServiceStatus());
        return subscribeToServiceStatus(setSnapshot);
    }, []);

    return snapshot;
};
