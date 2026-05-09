import { addDaysToDateOnly, normalizeTripDates } from './routeSearchDates';

describe('useRouteSearch date helpers', () => {
    it('pushes the return date one day after departure when return is missing or invalid', () => {
        expect(normalizeTripDates('2026-06-01', '')).toEqual({
            departureDate: '2026-06-01',
            returnDate: '2026-06-02',
        });

        expect(normalizeTripDates('2026-06-01', '2026-06-01')).toEqual({
            departureDate: '2026-06-01',
            returnDate: '2026-06-02',
        });

        expect(normalizeTripDates('2026-06-01', '2026-05-30')).toEqual({
            departureDate: '2026-06-01',
            returnDate: '2026-06-02',
        });
    });

    it('keeps a valid return date and can add days safely', () => {
        expect(normalizeTripDates('2026-06-01', '2026-06-05')).toEqual({
            departureDate: '2026-06-01',
            returnDate: '2026-06-05',
        });

        expect(addDaysToDateOnly('2026-06-01', 1)).toBe('2026-06-02');
    });
});

