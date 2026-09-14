import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResortMatch } from './services/api';
import LowCrowdWindows from './components/LowCrowdWindows';
import { monthSearchRange } from './services/skiWindows';

/**
 * Route wrapper for the low-crowd window finder.
 *
 * <p>Defaults to La Clusaz in March 2027 — the case the module was built for.
 * The range is padded a week either side of the month because ski weeks run
 * Saturday to Saturday and months do not start on Saturdays, so an unpadded
 * month silently drops the changeover weeks at both boundaries.
 */
const SkiWindowsPage: React.FC = () => {
    const [params, setParams] = useSearchParams();

    const resort = params.get('resort') ?? 'la-clusaz';
    const year = Number.parseInt(params.get('year') ?? '2027', 10);
    const month = Number.parseInt(params.get('month') ?? '3', 10);

    const range = useMemo(() => {
        const safeYear = Number.isFinite(year) ? year : 2027;
        const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 3;
        return monthSearchRange(safeYear, safeMonth);
    }, [year, month]);

    /**
     * The picked resort lands in the URL rather than in component state, so the
     * result is shareable and the back button walks the resorts you looked at.
     */
    const handleResortChange = (match: ResortMatch): void => {
        const next = new URLSearchParams(params);
        next.set('resort', match.slug);
        setParams(next);
    };

    return (
        <LowCrowdWindows
            onResortChange={handleResortChange}
            resort={resort}
            from={params.get('from') ?? range.from}
            to={params.get('to') ?? range.to}
            homeCalendar={params.get('homeCalendar') ?? 'IE-NATIONAL'}
        />
    );
};

export default SkiWindowsPage;
