import {
    LowCrowdWindowResponse,
    SkiWindow,
    WindowConfidence,
    WindowHolidayOverlap,
    WindowPreset,
} from './api';

/**
 * Presentation helpers for the low-crowd window finder. Pure functions only —
 * the ranking itself is the backend's job, and duplicating any of that scoring
 * logic here would guarantee the two implementations drift.
 */

export const PRESETS: { id: WindowPreset; label: string; blurb: string }[] = [
    { id: 'balanced', label: 'Balanced', blurb: 'Crowd, snow and price weighted together' },
    { id: 'empty-pistes', label: 'Empty pistes', blurb: 'Prioritise quiet lifts above all' },
    { id: 'best-snow', label: 'Best snow', blurb: 'Prioritise cover, accept more company' },
    { id: 'cheapest', label: 'Cheapest', blurb: 'Prioritise price for how busy the week is' },
];

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

const parseIsoDate = (value: string): Date | null => {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * "Sat 13 – Sat 20 Mar". The end date is exclusive in the API — it is the day you
 * travel home — and it is shown rather than hidden because a seven-night let that
 * ends on the 20th is a different thing from one that ends on the 19th.
 */
export const formatWindowRange = (window: SkiWindow): string => {
    const start = parseIsoDate(window.start);
    const end = parseIsoDate(window.end);
    if (!start || !end) return `${window.start} → ${window.end}`;

    const weekday = (d: Date): string => d.toLocaleDateString('en-IE', { weekday: 'short' });
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = sameMonth
        ? `${weekday(start)} ${start.getDate()}`
        : `${weekday(start)} ${start.toLocaleDateString('en-IE', DATE_FORMAT)}`;
    return `${startLabel} – ${weekday(end)} ${end.toLocaleDateString('en-IE', DATE_FORMAT)}`;
};

export const formatYear = (window: SkiWindow): string => {
    const start = parseIsoDate(window.start);
    return start ? String(start.getFullYear()) : '';
};

/** Crowd index to a plain-language band. Thresholds match the scorer's saturation curve. */
export const crowdBand = (crowdIndex: number): 'quiet' | 'moderate' | 'busy' | 'packed' => {
    if (crowdIndex < 10) return 'quiet';
    if (crowdIndex < 30) return 'moderate';
    if (crowdIndex < 60) return 'busy';
    return 'packed';
};

export const crowdLabel = (crowdIndex: number): string => ({
    quiet: 'Quiet',
    moderate: 'Moderate',
    busy: 'Busy',
    packed: 'Packed',
}[crowdBand(crowdIndex)]);

export const priceTierLabel = (tier: number | null | undefined): string => {
    if (tier == null) return 'Unknown';
    return ['', 'Cheapest', 'Below average', 'Average', 'Above average', 'Peak'][tier] ?? 'Unknown';
};

/**
 * Whether a value should be shown with an "estimated" marker. Anything weaker
 * than STATED is a guess the user needs to be able to see as one.
 */
export const isSoft = (confidence: WindowConfidence): boolean =>
    confidence === 'INFERRED' || confidence === 'LIKELY';

export const confidenceLabel = (confidence: WindowConfidence): string => ({
    INFERRED: 'inferred',
    LIKELY: 'likely',
    STATED: 'published',
    CONFIRMED: 'confirmed',
}[confidence]);

/** Overlaps that actually moved the score, biggest first. */
export const significantOverlaps = (window: SkiWindow): WindowHolidayOverlap[] =>
    window.holidayOverlap
        .filter((o) => o.weightedImpact >= 0.01)
        .sort((a, b) => b.weightedImpact - a.weightedImpact);

/**
 * A one-line reason the week scores as it does, for the collapsed card. Prefers
 * the exclusion when there is one — a user scanning the list needs to know
 * "you can't go then" before anything else.
 */
export const headlineReason = (window: SkiWindow): string => {
    if (!window.eligible) {
        return window.exclusions[0]?.detail ?? 'Not available';
    }
    const overlaps = significantOverlaps(window);
    if (overlaps.length === 0) {
        return 'No school break in any calendar that drives this resort';
    }
    const names = overlaps.slice(0, 2).map((o) => o.displayName).join(' and ');
    return `${names} on holiday for part of the week`;
};

export const eligibleWindows = (response: LowCrowdWindowResponse | null): SkiWindow[] =>
    (response?.windows ?? []).filter((w) => w.eligible);

export const excludedWindows = (response: LowCrowdWindowResponse | null): SkiWindow[] =>
    (response?.windows ?? []).filter((w) => !w.eligible);

/**
 * True when the price column carries no weight in the ranking. The backend drops
 * it entirely rather than modelling a price from the crowd index, so the UI must
 * not present the tier as if it influenced the result.
 */
export const priceIsIndicativeOnly = (response: LowCrowdWindowResponse | null): boolean =>
    !!response && response.weights.price === 0;

/** Default search span: the whole of a given month, padded so edge weeks are considered. */
export const monthSearchRange = (year: number, month1to12: number): { from: string; to: string } => {
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    const first = new Date(Date.UTC(year, month1to12 - 1, 1));
    const last = new Date(Date.UTC(year, month1to12, 0));
    // Pad by a week either side so a changeover week straddling the month
    // boundary is still a candidate — months do not start on Saturdays.
    return {
        from: iso(new Date(first.getTime() - 7 * 86_400_000)),
        to: iso(new Date(last.getTime() + 7 * 86_400_000)),
    };
};
