// Formatting shared by every Hack Flights surface.
//
// The clock, the duration and the euro sign used to be re-declared inside each
// component that needed them, which is how the results toolbar and the cards it
// summarises ended up able to disagree about what "8h05" means. One copy.

/** "HH:mm", "HH:mm:ss" or an ISO date-time → "HH:mm". Em dash when unknown. */
export const formatClock = (value?: string | null): string => {
    if (!value) return '—';
    const match = value.match(/(?:^|T)(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
};

/** Minutes → "8h05" / "3h". Em dash for anything that is not a real span. */
export const formatDuration = (minutes?: number | null): string => {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
};

/** Whole euros — fares are compared, not accounted for, so cents are noise. */
export const euro = (value: number): string => (
    `€${value.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`
);

/**
 * An ISO timestamp → the wall clock where the reader is, "14:20".
 *
 * Timestamps are stored in UTC; a fare "seen at 13:20" that the reader saw at
 * 14:20 their own time would look like someone else's price. Built by hand
 * rather than through toLocaleTimeString so the output is the same everywhere
 * and can be tested.
 */
export const formatLocalClock = (iso?: string | null): string => {
    const at = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(at)) return '—';
    const when = new Date(at);
    return `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
};
