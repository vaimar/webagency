import { useCallback, useState } from 'react';
import {
    DepartureCity,
    loadDepartureOrigin,
    normaliseDeparture,
    saveDepartureOrigin,
} from '../services/departureOrigin';

/**
 * The departure city, read once from storage and written back on every change.
 *
 * Deliberately not a context: nothing renders two of these at once, and the
 * only cross-page requirement is that the *value* survives navigation, which
 * storage already does. A provider would add a tree-wide dependency to solve a
 * problem localStorage solves on its own.
 */
export const useDepartureOrigin = (): [DepartureCity, (city: string) => void] => {
    const [origin, setOrigin] = useState<DepartureCity>(loadDepartureOrigin);

    const chooseOrigin = useCallback((city: string) => {
        const next = normaliseDeparture(city);
        setOrigin(next);
        saveDepartureOrigin(next);
    }, []);

    return [origin, chooseOrigin];
};
