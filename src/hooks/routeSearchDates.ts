const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const addDaysToDateOnly = (value: string, days: number): string => {
    if (!DATE_ONLY_RE.test(value)) {
        return value;
    }

    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const nextDate = new Date(Date.UTC(year, month - 1, day));
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate.toISOString().slice(0, 10);
};

export const normalizeTripDates = (departureDate: string, returnDate: string): { departureDate: string; returnDate: string } => {
    if (!DATE_ONLY_RE.test(departureDate)) {
        return { departureDate, returnDate };
    }

    if (!DATE_ONLY_RE.test(returnDate) || returnDate <= departureDate) {
        return {
            departureDate,
            returnDate: addDaysToDateOnly(departureDate, 1),
        };
    }

    return { departureDate, returnDate };
};

