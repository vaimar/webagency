// The hour window behind the take-off and landing filters.
//
// Kept out of the component so the rule it encodes — what counts as inside the
// window, and what an unknown time does — can be tested on its own.

/** Whole hours, 0–24. 24 means "to the end of the day", not midnight. */
export type HourWindow = [number, number];

export const FULL_DAY: HourWindow = [0, 24];

export const isFullDay = (window: HourWindow): boolean => (
    window[0] === FULL_DAY[0] && window[1] === FULL_DAY[1]
);

/** 7 → "07:00". The 24 at the top of the range stays "24:00" on purpose. */
export const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/**
 * Does a clock time, in minutes since midnight, fall inside the window?
 *
 * An untouched window admits everything, including a flight whose time the
 * schedule could not resolve. A narrowed one does not: "takes off between 06:00
 * and 12:00" is a claim, and a departure with no time on it is not one this can
 * make, so it drops out rather than sitting in a filtered list under false
 * pretences.
 */
export const withinWindow = (minutes: number | null, window: HourWindow): boolean => {
    if (isFullDay(window)) return true;
    if (minutes === null) return false;
    return minutes >= window[0] * 60 && minutes <= window[1] * 60;
};
