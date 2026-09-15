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
 * Integer cents → "€549.65". Two decimals always, en-IE grouping.
 *
 * The trip cost card adds a fare to a nightly rate, and a sum is only
 * checkable when every part of it is shown to the cent: whole euros would let
 * €99.98 + €449.67 display as €100 + €450 above a €550 total that does not
 * match the rows it came from. Not a replacement for `euro()`, which the cart
 * keeps.
 */
export const formatCents = (cents: number, currency: string): string => {
    const code = (currency || 'EUR').toUpperCase();
    const value = Math.round(cents) / 100;
    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // Malformed code (Intl throws RangeError): never drop the amount.
        return `${value.toFixed(2)} ${code}`;
    }
};

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

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * An ISO date or date-time → "Sat 3 Oct" in local time. null when missing or
 * unparseable, so a label can drop the date rather than print "Invalid Date".
 *
 * Built by hand for the same reason as `formatLocalClock`:
 * toLocaleDateString('en-IE', …) gives "Sat, 3 Oct" on some ICU builds and
 * "Sat 3 Oct" on others. A bare "2026-10-03" is a calendar day, not an
 * instant — Date.parse would read it as UTC midnight and show Fri 2 Oct to
 * anyone west of Greenwich — so it is built from its parts in local time.
 */
export const formatShortDate = (iso?: string | null): string | null => {
    if (!iso) return null;
    const bare = BARE_DATE.exec(iso);
    let when: Date;
    if (bare) {
        const [year, month, day] = [Number(bare[1]), Number(bare[2]), Number(bare[3])];
        when = new Date(year, month - 1, day);
        // new Date rolls 31 Feb over into March; that is not the date given.
        if (when.getFullYear() !== year || when.getMonth() !== month - 1 || when.getDate() !== day) return null;
    } else {
        const at = Date.parse(iso);
        if (!Number.isFinite(at)) return null;
        when = new Date(at);
    }
    return `${SHORT_WEEKDAYS[when.getDay()]} ${when.getDate()} ${SHORT_MONTHS[when.getMonth()]}`;
};
