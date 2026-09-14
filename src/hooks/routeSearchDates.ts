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

/**
 * The date the schedule graph is probed on when the reader has not picked one.
 *
 * A spot page asks "can I get there", not "what does it cost on the 14th", so
 * there is no date field to read. Four weeks out, snapped forward to the next
 * Saturday, is the shape of the trip people actually take to these places, and
 * it is far enough ahead that a timetable exists without being so far out that
 * the schedule is still provisional.
 *
 * The date is shown to the reader wherever its results are, because a route
 * that operates on one Saturday is evidence about that Saturday and only
 * suggestive about any other.
 */
export const nextScheduleProbeDate = (from: Date = new Date()): string => {
    const base = addDaysToDateOnly(from.toISOString().slice(0, 10), 28);
    // 0 Sunday … 6 Saturday. Already a Saturday advances by zero.
    const weekday = new Date(`${base}T00:00:00Z`).getUTCDay();
    return addDaysToDateOnly(base, (6 - weekday + 7) % 7);
};
